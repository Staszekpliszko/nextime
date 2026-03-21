import { EventEmitter } from 'events';

// ── Typy ────────────────────────────────────────────────

export interface GpiSenderConfig {
  /** Czy sender jest aktywny */
  enabled: boolean;
  /** Domyślna długość impulsu w ms (dla trigger_type='pulse') */
  defaultPulseMs: number;
}

interface GpiTriggerCue {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

/** Typ wyzwalania GPI — zgodny z docs/types.ts GpiTriggerType */
type GpiTriggerType = 'pulse' | 'on' | 'off';

interface GpiCueData {
  channel: number;
  trigger_type: GpiTriggerType;
  pulse_ms?: number;
}

// ── GpiSender ───────────────────────────────────────────

const DEFAULT_CONFIG: GpiSenderConfig = {
  enabled: true,
  defaultPulseMs: 100,
};

/**
 * Wysyła sygnały GPI (General Purpose Interface) w odpowiedzi na 'gpi-trigger'.
 *
 * UWAGA: To jest placeholder — prawdziwy GPI wymaga hardware (np. GPIO,
 * serial port, lub dedykowane urządzenie GPI). Na razie loguje do konsoli.
 * Callback onTrigger pozwala na testowanie i przyszłą integrację.
 */
export class GpiSender {
  private config: GpiSenderConfig;
  /** Callback do przechwytywania triggerów (do testów i przyszłej integracji) */
  onTrigger: ((trigger: { channel: number; triggerType: GpiTriggerType; pulseMs: number }) => void) | null = null;

  constructor(config: Partial<GpiSenderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Podpina się do engine i nasłuchuje na 'gpi-trigger' */
  attach(engine: EventEmitter): void {
    engine.on('gpi-trigger', (cue: GpiTriggerCue) => this.handleTrigger(cue));
  }

  /** Obsługuje trigger z engine — wysyła sygnał GPI */
  handleTrigger(cue: GpiTriggerCue): void {
    if (!this.config.enabled) return;

    const data = cue.data as Partial<GpiCueData>;
    const channel = Math.max(1, Math.min(8, data.channel ?? 1));
    const triggerType: GpiTriggerType = data.trigger_type ?? 'pulse';
    const pulseMs = data.pulse_ms ?? this.config.defaultPulseMs;

    const trigger = { channel, triggerType, pulseMs };

    // Wyślij przez callback (jeśli ustawiony) lub loguj
    if (this.onTrigger) {
      this.onTrigger(trigger);
    }

    console.log(
      `[GpiSender] CH:${channel} ${triggerType.toUpperCase()}` +
      (triggerType === 'pulse' ? ` (${pulseMs}ms)` : ''),
    );
  }

  /** Aktualizuje konfigurację w runtime */
  updateConfig(config: Partial<GpiSenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Zwraca aktualną konfigurację */
  getConfig(): GpiSenderConfig {
    return { ...this.config };
  }

  /** Cleanup */
  destroy(): void {
    this.onTrigger = null;
  }
}
