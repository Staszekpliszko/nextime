/**
 * GPI Serial Port — prawdziwa komunikacja GPI przez port serial.
 *
 * Graceful fallback: jeśli moduł `serialport` nie jest załadowany
 * (np. brak natywnych bindings), klasa działa w trybie placeholder
 * (loguje do konsoli, nie wysyła na port).
 *
 * Wzorzec DI identyczny jak w midi-sender.ts — konstruktor przyjmuje
 * opcjonalny SerialPortConstructor do testów.
 */

// ── Interfejsy (DI) ────────────────────────────────────────

/** Minimalna abstrakcja nad SerialPort — do testów i DI */
export interface SerialPortLike {
  write(data: Buffer | Uint8Array, callback?: (err: Error | null) => void): void;
  close(callback?: (err: Error | null) => void): void;
  isOpen: boolean;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

/** Konstruktor SerialPort — do DI */
export interface SerialPortConstructor {
  new (options: { path: string; baudRate: number; autoOpen?: boolean }): SerialPortLike;
  list(): Promise<SerialPortInfo[]>;
}

/** Info o porcie serial (uproszczone z @serialport/bindings) */
export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  friendlyName?: string;
}

/** Wynik operacji GPI serial */
export interface GpiSerialResult {
  ok: boolean;
  error?: string;
}

/** Typ wyzwalania GPI */
type GpiTriggerType = 'pulse' | 'on' | 'off';

// ── Dynamiczny import serialport (graceful fallback) ────────

let DefaultSerialPortClass: SerialPortConstructor | null = null;
let defaultSerialLoadError: string | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sp = require('serialport') as { SerialPort: SerialPortConstructor };
  DefaultSerialPortClass = sp.SerialPort;
  console.log('[GpiSerial] Moduł serialport załadowany pomyślnie');
} catch (err) {
  defaultSerialLoadError = err instanceof Error ? err.message : String(err);
  console.warn(`[GpiSerial] Moduł serialport niedostępny — fallback do logowania: ${defaultSerialLoadError}`);
}

// ── GpiSerialPort ───────────────────────────────────────────

export class GpiSerialPort {
  private port: SerialPortLike | null = null;
  private readonly SerialPortClass: SerialPortConstructor | null;
  private readonly loadError: string | null;

  /** Callback do przechwytywania wysyłanych danych (testy) */
  onWrite: ((data: Buffer) => void) | null = null;

  constructor(SerialPortClass?: SerialPortConstructor | null) {
    if (SerialPortClass !== undefined) {
      this.SerialPortClass = SerialPortClass;
      this.loadError = SerialPortClass ? null : 'Moduł serialport nie został podany';
    } else {
      this.SerialPortClass = DefaultSerialPortClass;
      this.loadError = defaultSerialLoadError;
    }
  }

  /** Czy moduł serialport jest załadowany */
  isSerialAvailable(): boolean {
    return this.SerialPortClass !== null;
  }

  /** Błąd ładowania modułu */
  getLoadError(): string | null {
    return this.loadError;
  }

  /** Lista dostępnych portów serial */
  async listPorts(): Promise<SerialPortInfo[]> {
    if (!this.SerialPortClass) return [];
    try {
      return await this.SerialPortClass.list();
    } catch (err) {
      console.error('[GpiSerial] Błąd listowania portów:', err);
      return [];
    }
  }

  /** Otwiera port serial */
  open(portPath: string, baudRate: number): GpiSerialResult {
    if (!this.SerialPortClass) {
      return { ok: false, error: `Moduł serialport niedostępny: ${this.loadError ?? 'nieznany błąd'}` };
    }

    // Zamknij istniejący port
    if (this.port && this.port.isOpen) {
      this.close();
    }

    try {
      this.port = new this.SerialPortClass({ path: portPath, baudRate, autoOpen: true });
      console.log(`[GpiSerial] Port otwarty: ${portPath} @ ${baudRate} baud`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[GpiSerial] Błąd otwierania portu ${portPath}:`, err);
      this.port = null;
      return { ok: false, error: msg };
    }
  }

  /** Zamyka port serial */
  close(): void {
    if (this.port && this.port.isOpen) {
      this.port.close((err) => {
        if (err) console.error('[GpiSerial] Błąd zamykania portu:', err);
      });
    }
    this.port = null;
    console.log('[GpiSerial] Port zamknięty');
  }

  /** Czy port jest otwarty */
  isOpen(): boolean {
    return this.port !== null && this.port.isOpen;
  }

  /**
   * Wysyła trigger GPI na port serial.
   *
   * Protokół: wysyłamy bajt na port serial.
   * Format: [pin_number, state] gdzie state: 0x01=ON, 0x00=OFF
   * Pulse = ON + delay + OFF
   */
  sendTrigger(pin: number, triggerType: GpiTriggerType, pulseMs: number): GpiSerialResult {
    if (!this.port || !this.port.isOpen) {
      return { ok: false, error: 'Port serial nie jest otwarty' };
    }

    const clampedPin = Math.max(1, Math.min(8, pin));

    try {
      if (triggerType === 'on') {
        const buf = Buffer.from([clampedPin, 0x01]);
        this._write(buf);
      } else if (triggerType === 'off') {
        const buf = Buffer.from([clampedPin, 0x00]);
        this._write(buf);
      } else {
        // pulse: ON → delay → OFF
        const onBuf = Buffer.from([clampedPin, 0x01]);
        const offBuf = Buffer.from([clampedPin, 0x00]);
        this._write(onBuf);
        setTimeout(() => {
          if (this.port && this.port.isOpen) {
            this._write(offBuf);
          }
        }, pulseMs);
      }

      console.log(`[GpiSerial] Trigger: pin=${clampedPin} type=${triggerType} pulse=${pulseMs}ms`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  /** Wysyła test trigger (pin 1, pulse 100ms) */
  testSend(): GpiSerialResult {
    return this.sendTrigger(1, 'pulse', 100);
  }

  /** Cleanup */
  destroy(): void {
    this.close();
    this.onWrite = null;
  }

  // ── Prywatne ────────────────────────────────────────────

  private _write(data: Buffer): void {
    if (this.onWrite) {
      this.onWrite(data);
    }
    if (this.port && this.port.isOpen) {
      this.port.write(data);
    }
  }
}
