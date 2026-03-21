import { EventEmitter } from 'events';

// ── Typy ────────────────────────────────────────────────

export interface MidiSenderConfig {
  /** Nazwa portu MIDI (domyślnie: 'NextTime Virtual MIDI') */
  portName: string;
  /** Kanał MIDI 1-16 (domyślnie: 1) */
  defaultChannel: number;
  /** Czy sender jest aktywny */
  enabled: boolean;
}

interface MidiTriggerCue {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

/** Typ wiadomości MIDI — zgodny z docs/types.ts MidiMessageType */
type MidiMessageType = 'note_on' | 'note_off' | 'program' | 'cc';

interface MidiCueData {
  message_type: MidiMessageType;
  note_or_cc: number;
  velocity_or_val: number;
  channel?: number;
}

// ── MidiSender ──────────────────────────────────────────

const DEFAULT_CONFIG: MidiSenderConfig = {
  portName: 'NextTime Virtual MIDI',
  defaultChannel: 1,
  enabled: true,
};

/**
 * Wysyła wiadomości MIDI w odpowiedzi na 'midi-trigger' z PlaybackEngine.
 *
 * UWAGA: To jest placeholder — prawdziwy MIDI output wymaga biblioteki
 * typu `midi` (npm) lub `easymidi`. Na razie loguje wiadomości do konsoli.
 * W przyszłości: podłączenie do hardware MIDI via node-midi.
 */
export class MidiSender {
  private config: MidiSenderConfig;
  /** Callback do przechwytywania wiadomości (do testów i przyszłej integracji) */
  onMessage: ((msg: { status: number; data1: number; data2: number; raw: number[] }) => void) | null = null;

  constructor(config: Partial<MidiSenderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Podpina się do engine i nasłuchuje na 'midi-trigger' */
  attach(engine: EventEmitter): void {
    engine.on('midi-trigger', (cue: MidiTriggerCue) => this.handleTrigger(cue));
  }

  /** Obsługuje trigger z engine — buduje i wysyła wiadomość MIDI */
  handleTrigger(cue: MidiTriggerCue): void {
    if (!this.config.enabled) return;

    const data = cue.data as Partial<MidiCueData>;
    const messageType = data.message_type ?? 'note_on';
    const noteOrCc = this.clampMidi(data.note_or_cc ?? 60);
    const velocityOrVal = this.clampMidi(data.velocity_or_val ?? 127);
    const channel = Math.max(1, Math.min(16, data.channel ?? this.config.defaultChannel));

    // Buduj status byte (kanały MIDI 0-indexed)
    const ch = channel - 1;
    let status: number;
    switch (messageType) {
      case 'note_on':  status = 0x90 | ch; break;
      case 'note_off': status = 0x80 | ch; break;
      case 'cc':       status = 0xB0 | ch; break;
      case 'program':  status = 0xC0 | ch; break;
      default:         status = 0x90 | ch; break;
    }

    const msg = {
      status,
      data1: noteOrCc,
      data2: messageType === 'program' ? 0 : velocityOrVal,
      raw: messageType === 'program'
        ? [status, noteOrCc]
        : [status, noteOrCc, velocityOrVal],
    };

    // Wyślij przez callback (jeśli ustawiony) lub loguj
    if (this.onMessage) {
      this.onMessage(msg);
    }

    console.log(
      `[MidiSender] ${messageType.toUpperCase()} ch:${channel} ` +
      `note/cc:${noteOrCc} vel/val:${velocityOrVal} → [${msg.raw.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`,
    );
  }

  /** Clamp wartości MIDI do zakresu 0-127 */
  private clampMidi(val: number): number {
    return Math.max(0, Math.min(127, Math.round(val)));
  }

  /** Aktualizuje konfigurację w runtime */
  updateConfig(config: Partial<MidiSenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Zwraca aktualną konfigurację */
  getConfig(): MidiSenderConfig {
    return { ...this.config };
  }

  /** Cleanup (placeholder — przyszłe zamknięcie portu MIDI) */
  destroy(): void {
    this.onMessage = null;
  }
}
