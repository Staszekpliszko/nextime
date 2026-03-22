import { EventEmitter } from 'events';
import { GpiSerialPort } from './gpi-serial';
import type { SerialPortConstructor, SerialPortInfo, GpiSerialResult } from './gpi-serial';

// ── Typy ────────────────────────────────────────────────

export interface GpiSenderConfig {
  /** Czy sender jest aktywny */
  enabled: boolean;
  /** Domyślna długość impulsu w ms (dla trigger_type='pulse') */
  defaultPulseMs: number;
  /** Ścieżka portu serial (np. COM3, /dev/ttyUSB0) */
  portPath: string;
  /** Baud rate portu serial */
  baudRate: number;
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
  portPath: '',
  baudRate: 9600,
};

/**
 * Wysyła sygnały GPI (General Purpose Interface) w odpowiedzi na 'gpi-trigger'.
 *
 * Używa serialport do komunikacji z hardware GPI.
 * Gdy serialport niedostępny — graceful fallback (logowanie + callback onTrigger).
 */
export class GpiSender {
  private config: GpiSenderConfig;
  /** Prawdziwy port serial — obsługa hardware GPI */
  private readonly serial: GpiSerialPort;
  /** Callback do przechwytywania triggerów (do testów i przyszłej integracji) */
  onTrigger: ((trigger: { channel: number; triggerType: GpiTriggerType; pulseMs: number }) => void) | null = null;

  constructor(config: Partial<GpiSenderConfig> = {}, SerialPortClass?: SerialPortConstructor | null) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.serial = new GpiSerialPort(SerialPortClass);
  }

  /** Podpina się do engine i nasłuchuje na 'gpi-trigger' */
  attach(engine: EventEmitter): void {
    engine.on('gpi-trigger', (cue: GpiTriggerCue) => this.handleTrigger(cue));
  }

  /** Czy moduł serialport jest załadowany */
  isSerialAvailable(): boolean {
    return this.serial.isSerialAvailable();
  }

  /** Błąd ładowania serialport */
  getSerialLoadError(): string | null {
    return this.serial.getLoadError();
  }

  /** Lista dostępnych portów serial */
  async listPorts(): Promise<SerialPortInfo[]> {
    return this.serial.listPorts();
  }

  /** Otwiera port serial z aktualnej konfiguracji */
  openPort(portPath?: string, baudRate?: number): GpiSerialResult {
    const path = portPath ?? this.config.portPath;
    const baud = baudRate ?? this.config.baudRate;

    if (!path) {
      return { ok: false, error: 'Nie podano ścieżki portu serial' };
    }

    const result = this.serial.open(path, baud);
    if (result.ok) {
      this.config.portPath = path;
      this.config.baudRate = baud;
    }
    return result;
  }

  /** Zamyka port serial */
  closePort(): void {
    this.serial.close();
  }

  /** Czy port serial jest otwarty */
  isPortOpen(): boolean {
    return this.serial.isOpen();
  }

  /** Wysyła test trigger — pin 1 pulse 100ms */
  testSend(): GpiSerialResult {
    if (!this.serial.isOpen()) {
      // Fallback: loguj test trigger
      console.log('[GpiSender] Test trigger (placeholder — port nie otwarty)');
      return { ok: true };
    }
    return this.serial.testSend();
  }

  /** Obsługuje trigger z engine — wysyła sygnał GPI */
  handleTrigger(cue: GpiTriggerCue): void {
    if (!this.config.enabled) return;

    const data = cue.data as Partial<GpiCueData>;
    const channel = Math.max(1, Math.min(8, data.channel ?? 1));
    const triggerType: GpiTriggerType = data.trigger_type ?? 'pulse';
    const pulseMs = data.pulse_ms ?? this.config.defaultPulseMs;

    const trigger = { channel, triggerType, pulseMs };

    // Callback (testy)
    if (this.onTrigger) {
      this.onTrigger(trigger);
    }

    // Jeśli port serial otwarty — wysyłaj prawdziwy trigger
    if (this.serial.isOpen()) {
      this.serial.sendTrigger(channel, triggerType, pulseMs);
    } else {
      // Fallback: loguj do konsoli
      console.log(
        `[GpiSender] CH:${channel} ${triggerType.toUpperCase()}` +
        (triggerType === 'pulse' ? ` (${pulseMs}ms)` : ''),
      );
    }
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
    this.serial.destroy();
    this.onTrigger = null;
  }
}
