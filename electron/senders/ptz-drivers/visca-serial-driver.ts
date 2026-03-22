/**
 * ViscaSerialDriver — VISCA over Serial (RS-422/RS-232).
 *
 * Używany przez starsze kamery Sony BRC, kamery z RS-422.
 * Graceful fallback jeśli moduł serialport niedostępny.
 */

import type { PtzDriver, PtzDriverStatus } from './ptz-driver';
import type { SerialPortLike, SerialPortConstructor } from '../gpi-serial';
import {
  buildRecallPresetCmd,
  buildPanTiltCmd,
  buildStopCmd,
  parseViscaResponse,
  VISCA_TERMINATOR,
} from './visca-protocol';

// ── Dynamiczny import serialport ────────────────────────

let DefaultSerialPortClass: SerialPortConstructor | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sp = require('serialport') as { SerialPort: SerialPortConstructor };
  DefaultSerialPortClass = sp.SerialPort;
} catch {
  // Graceful fallback — serialport niedostępny
}

// ── Konfiguracja ────────────────────────────────────────

export interface ViscaSerialConfig {
  portPath: string;
  baudRate: number;
  /** Adres VISCA kamery (1-7, domyślnie 1) */
  address: number;
  /** Timeout na odpowiedź w ms */
  timeout: number;
}

const DEFAULT_CONFIG: ViscaSerialConfig = {
  portPath: '',
  baudRate: 9600,
  address: 1,
  timeout: 2000,
};

// ── ViscaSerialDriver ───────────────────────────────────

export class ViscaSerialDriver implements PtzDriver {
  readonly protocol = 'visca_serial' as const;
  private config: ViscaSerialConfig;
  private port: SerialPortLike | null = null;
  private _connected = false;
  private _lastError: string | undefined;
  private responseBuffer: Buffer = Buffer.alloc(0);
  private pendingResolve: ((ok: boolean) => void) | null = null;
  private readonly SerialPortClass: SerialPortConstructor | null;

  /** Callback do przechwytywania komend (testy) */
  onCommand: ((cmd: Buffer) => void) | null = null;

  constructor(config: Partial<ViscaSerialConfig> = {}, SerialPortClass?: SerialPortConstructor | null) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (SerialPortClass !== undefined) {
      this.SerialPortClass = SerialPortClass;
    } else {
      this.SerialPortClass = DefaultSerialPortClass;
    }
  }

  async connect(): Promise<{ ok: boolean; error?: string }> {
    if (this._connected) return { ok: true };
    if (!this.SerialPortClass) {
      return { ok: false, error: 'Moduł serialport niedostępny' };
    }
    if (!this.config.portPath) {
      return { ok: false, error: 'Nie podano ścieżki portu serial' };
    }

    try {
      this.port = new this.SerialPortClass({
        path: this.config.portPath,
        baudRate: this.config.baudRate,
        autoOpen: true,
      });

      this.port.on('data', (data: unknown) => {
        this._handleData(data as Buffer);
      });

      this._connected = true;
      this._lastError = undefined;
      console.log(`[ViscaSerial] Połączono: ${this.config.portPath} @ ${this.config.baudRate}`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = msg;
      return { ok: false, error: msg };
    }
  }

  async disconnect(): Promise<void> {
    if (this.port && this.port.isOpen) {
      this.port.close();
    }
    this.port = null;
    this._connected = false;
    this.responseBuffer = Buffer.alloc(0);
    this.pendingResolve = null;
    console.log('[ViscaSerial] Rozłączono');
  }

  isConnected(): boolean {
    return this._connected;
  }

  async recallPreset(presetNr: number): Promise<{ ok: boolean; error?: string }> {
    const cmd = buildRecallPresetCmd(this.config.address, presetNr);
    return this._sendCommand(cmd);
  }

  async panTilt(
    panSpeed: number,
    tiltSpeed: number,
    panDir: number,
    tiltDir: number,
  ): Promise<{ ok: boolean; error?: string }> {
    const cmd = buildPanTiltCmd(this.config.address, panSpeed, tiltSpeed, panDir, tiltDir);
    return this._sendCommand(cmd);
  }

  async stop(): Promise<{ ok: boolean; error?: string }> {
    const cmd = buildStopCmd(this.config.address);
    return this._sendCommand(cmd);
  }

  getStatus(): PtzDriverStatus {
    return {
      connected: this._connected,
      protocol: this.protocol,
      lastError: this._lastError,
    };
  }

  async destroy(): Promise<void> {
    await this.disconnect();
    this.onCommand = null;
  }

  // ── Prywatne ────────────────────────────────────────────

  private async _sendCommand(cmd: Buffer): Promise<{ ok: boolean; error?: string }> {
    if (!this._connected || !this.port || !this.port.isOpen) {
      return { ok: false, error: 'Nie połączono z kamerą' };
    }

    if (this.onCommand) {
      this.onCommand(cmd);
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingResolve = null;
        resolve({ ok: false, error: 'Timeout odpowiedzi kamery' });
      }, this.config.timeout);

      this.pendingResolve = (ok) => {
        clearTimeout(timeout);
        this.pendingResolve = null;
        resolve(ok ? { ok: true } : { ok: false, error: 'Błąd odpowiedzi kamery' });
      };

      try {
        this.port!.write(cmd);
      } catch (err) {
        clearTimeout(timeout);
        this.pendingResolve = null;
        const msg = err instanceof Error ? err.message : String(err);
        resolve({ ok: false, error: msg });
      }
    });
  }

  private _handleData(data: Buffer): void {
    this.responseBuffer = Buffer.concat([this.responseBuffer, data]);

    while (true) {
      const termIdx = this.responseBuffer.indexOf(VISCA_TERMINATOR);
      if (termIdx < 0) break;

      const packet = this.responseBuffer.subarray(0, termIdx + 1);
      this.responseBuffer = this.responseBuffer.subarray(termIdx + 1);

      const response = parseViscaResponse(packet);
      if (response.type === 'completion' || response.type === 'error') {
        if (this.pendingResolve) {
          this.pendingResolve(response.type === 'completion');
        }
      }
    }
  }
}
