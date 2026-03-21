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

/** Informacja o porcie MIDI */
export interface MidiPortInfo {
  index: number;
  name: string;
}

/** Wynik operacji MIDI */
export interface MidiResult {
  ok: boolean;
  error?: string;
}

// ── Interfejs dla natywnego modułu MIDI ─────────────────

/** Minimalna abstrakcja nad @julusian/midi Output — eksportowana do testów (DI) */
export interface MidiOutputPort {
  getPortCount(): number;
  getPortName(index: number): string;
  openPort(index: number): void;
  closePort(): void;
  sendMessage(bytes: number[]): void;
  isPortOpen(): boolean;
}

/** Konstruktor MidiOutputPort — do dependency injection */
export type MidiOutputConstructor = new () => MidiOutputPort;

// ── Dynamiczny import @julusian/midi (graceful fallback) ─

let DefaultMidiOutputClass: MidiOutputConstructor | null = null;
let defaultMidiLoadError: string | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const midiModule = require('@julusian/midi') as { Output: MidiOutputConstructor };
  DefaultMidiOutputClass = midiModule.Output;
  console.log('[MidiSender] Moduł @julusian/midi załadowany pomyślnie');
} catch (err) {
  defaultMidiLoadError = err instanceof Error ? err.message : String(err);
  console.warn(`[MidiSender] Moduł MIDI niedostępny — fallback do logowania: ${defaultMidiLoadError}`);
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
 * Używa @julusian/midi do prawdziwej komunikacji MIDI.
 * Gdy moduł natywny niedostępny — graceful fallback (logowanie + callback onMessage).
 */
export class MidiSender {
  private config: MidiSenderConfig;
  private output: MidiOutputPort | null = null;
  private portOpen = false;
  private openedPortIndex = -1;

  /** Klasa Output — z @julusian/midi lub wstrzyknięta (DI do testów) */
  private readonly OutputClass: MidiOutputConstructor | null;
  private readonly loadError: string | null;

  /** Callback do przechwytywania wiadomości (do testów i przyszłej integracji) */
  onMessage: ((msg: { status: number; data1: number; data2: number; raw: number[] }) => void) | null = null;

  constructor(config: Partial<MidiSenderConfig> = {}, OutputClass?: MidiOutputConstructor | null) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // DI: jeśli podano OutputClass, używaj go; inaczej — domyślny z require()
    if (OutputClass !== undefined) {
      this.OutputClass = OutputClass;
      this.loadError = OutputClass ? null : 'Moduł MIDI nie został podany';
    } else {
      this.OutputClass = DefaultMidiOutputClass;
      this.loadError = defaultMidiLoadError;
    }
  }

  /** Podpina się do engine i nasłuchuje na 'midi-trigger' */
  attach(engine: EventEmitter): void {
    engine.on('midi-trigger', (cue: MidiTriggerCue) => this.handleTrigger(cue));
  }

  /** Czy moduł natywny MIDI jest załadowany */
  isMidiAvailable(): boolean {
    return this.OutputClass !== null;
  }

  /** Zwraca błąd ładowania modułu MIDI (jeśli wystąpił) */
  getMidiLoadError(): string | null {
    return this.loadError;
  }

  /** Pobiera listę dostępnych portów MIDI output */
  listPorts(): MidiPortInfo[] {
    if (!this.OutputClass) return [];

    try {
      // Tworzymy tymczasowy output do skanowania portów
      const tempOutput = new this.OutputClass();
      const count = tempOutput.getPortCount();
      const ports: MidiPortInfo[] = [];

      for (let i = 0; i < count; i++) {
        ports.push({ index: i, name: tempOutput.getPortName(i) });
      }

      tempOutput.closePort();
      return ports;
    } catch (err) {
      console.error('[MidiSender] Błąd listowania portów:', err);
      return [];
    }
  }

  /** Otwiera port MIDI po indeksie */
  openPort(portIndex: number): MidiResult {
    if (!this.OutputClass) {
      return { ok: false, error: `Moduł MIDI niedostępny: ${this.loadError ?? 'nieznany błąd'}` };
    }

    // Zamknij istniejący port
    if (this.portOpen && this.output) {
      this.closePort();
    }

    try {
      this.output = new this.OutputClass();
      const count = this.output.getPortCount();

      if (portIndex < 0 || portIndex >= count) {
        this.output.closePort();
        this.output = null;
        return { ok: false, error: `Port ${portIndex} nie istnieje (dostępne: 0-${count - 1})` };
      }

      this.output.openPort(portIndex);
      this.portOpen = true;
      this.openedPortIndex = portIndex;

      const portName = this.output.getPortName(portIndex);
      console.log(`[MidiSender] Port MIDI otwarty: ${portIndex} (${portName})`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MidiSender] Błąd otwierania portu ${portIndex}:`, err);
      this.output = null;
      this.portOpen = false;
      return { ok: false, error: msg };
    }
  }

  /** Zamyka otwarty port MIDI */
  closePort(): void {
    if (this.output) {
      try {
        this.output.closePort();
      } catch (err) {
        console.error('[MidiSender] Błąd zamykania portu:', err);
      }
      this.output = null;
      this.portOpen = false;
      this.openedPortIndex = -1;
      console.log('[MidiSender] Port MIDI zamknięty');
    }
  }

  /** Czy port MIDI jest otwarty */
  isPortOpen(): boolean {
    return this.portOpen;
  }

  /** Indeks otwartego portu (-1 jeśli brak) */
  getOpenedPortIndex(): number {
    return this.openedPortIndex;
  }

  /**
   * Wysyła testową notę MIDI (C4 vel=1, natychmiast Note Off).
   * Pozwala UI zweryfikować połączenie z urządzeniem MIDI.
   */
  testSend(): Promise<MidiResult> {
    if (!this.config.enabled) {
      return Promise.resolve({ ok: false, error: 'MIDI sender jest wyłączony' });
    }

    if (!this.OutputClass) {
      return Promise.resolve({ ok: false, error: `Moduł MIDI niedostępny: ${this.loadError ?? 'nieznany błąd'}` });
    }

    if (!this.portOpen || !this.output) {
      return Promise.resolve({ ok: false, error: 'Port MIDI nie jest otwarty — najpierw otwórz port' });
    }

    try {
      const ch = Math.max(0, Math.min(15, this.config.defaultChannel - 1));
      // Note On C4 (60) z minimalnym velocity (1) — nie powinno być słyszalne
      this.output.sendMessage([0x90 | ch, 60, 1]);
      // Natychmiast Note Off
      this.output.sendMessage([0x80 | ch, 60, 0]);

      console.log(`[MidiSender] Test wysłany: Note On/Off C4 ch:${this.config.defaultChannel}`);
      return Promise.resolve({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Promise.resolve({ ok: false, error: `Błąd wysyłania MIDI: ${msg}` });
    }
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

    // Wysyłanie: prawdziwy port MIDI → natywny output
    if (this.portOpen && this.output) {
      try {
        this.output.sendMessage(msg.raw);
      } catch (err) {
        console.error(`[MidiSender] Błąd sendMessage:`, err);
      }
    }

    // Callback onMessage — zawsze wywoływany (kompatybilność wsteczna z testami)
    if (this.onMessage) {
      this.onMessage(msg);
    }

    console.log(
      `[MidiSender] ${messageType.toUpperCase()} ch:${channel} ` +
      `note/cc:${noteOrCc} vel/val:${velocityOrVal} → [${msg.raw.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]` +
      (this.portOpen ? ' (hardware)' : ' (no port)'),
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

  /** Zamyka port MIDI i czyści zasoby */
  destroy(): void {
    this.closePort();
    this.onMessage = null;
  }
}
