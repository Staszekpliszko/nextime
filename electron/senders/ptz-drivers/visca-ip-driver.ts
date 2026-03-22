/**
 * ViscaIpDriver — VISCA over IP (TCP socket, port 52381).
 *
 * Kompatybilny z: Sony SRG/BRC, PTZOptics, Panasonic AW-UE, BirdDog.
 * Używa standardowego portu VISCA over IP (52381).
 *
 * Specyfikacja: Sony VISCA over IP specification
 */

import * as net from 'net';
import type { PtzDriver, PtzDriverStatus } from './ptz-driver';
import {
  buildRecallPresetCmd,
  buildPanTiltCmd,
  buildStopCmd,
  parseViscaResponse,
} from './visca-protocol';

// ── Konfiguracja ────────────────────────────────────────

export interface ViscaIpConfig {
  ip: string;
  port: number;
  /** Adres VISCA kamery (1-7, domyślnie 1) */
  address: number;
  /** Timeout na odpowiedź w ms */
  timeout: number;
}

const DEFAULT_CONFIG: ViscaIpConfig = {
  ip: '',
  port: 52381,
  address: 1,
  timeout: 2000,
};

// ── ViscaIpDriver ───────────────────────────────────────

export class ViscaIpDriver implements PtzDriver {
  readonly protocol = 'visca_ip' as const;
  private config: ViscaIpConfig;
  private socket: net.Socket | null = null;
  private _connected = false;
  private _lastError: string | undefined;
  /** Kolejka oczekujących na odpowiedź */
  private responseBuffer: Buffer = Buffer.alloc(0);
  /** Resolve dla aktualnie oczekującej komendy */
  private pendingResolve: ((ok: boolean) => void) | null = null;

  /** Callback do przechwytywania komend (testy) */
  onCommand: ((cmd: Buffer) => void) | null = null;

  constructor(config: Partial<ViscaIpConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async connect(): Promise<{ ok: boolean; error?: string }> {
    if (this._connected) return { ok: true };
    if (!this.config.ip) return { ok: false, error: 'Nie podano adresu IP kamery' };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this._cleanup();
        this._lastError = 'Timeout połączenia';
        resolve({ ok: false, error: 'Timeout połączenia' });
      }, this.config.timeout);

      try {
        this.socket = net.createConnection(
          { host: this.config.ip, port: this.config.port },
          () => {
            clearTimeout(timeout);
            this._connected = true;
            this._lastError = undefined;
            console.log(`[ViscaIp] Połączono: ${this.config.ip}:${this.config.port}`);
            resolve({ ok: true });
          },
        );

        this.socket.on('data', (data: Buffer) => {
          this._handleData(data);
        });

        this.socket.on('error', (err) => {
          clearTimeout(timeout);
          this._lastError = err.message;
          this._connected = false;
          console.error(`[ViscaIp] Błąd: ${err.message}`);
          // Jeśli jeszcze nie resolved
          if (this.pendingResolve) {
            this.pendingResolve(false);
            this.pendingResolve = null;
          }
        });

        this.socket.on('close', () => {
          this._connected = false;
        });
      } catch (err) {
        clearTimeout(timeout);
        const msg = err instanceof Error ? err.message : String(err);
        this._lastError = msg;
        resolve({ ok: false, error: msg });
      }
    });
  }

  async disconnect(): Promise<void> {
    this._cleanup();
    console.log('[ViscaIp] Rozłączono');
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
    if (!this._connected || !this.socket) {
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
        this.socket!.write(cmd);
      } catch (err) {
        clearTimeout(timeout);
        this.pendingResolve = null;
        const msg = err instanceof Error ? err.message : String(err);
        resolve({ ok: false, error: msg });
      }
    });
  }

  private _handleData(data: Buffer): void {
    // Dołącz do bufora i szukaj terminatora 0xFF
    this.responseBuffer = Buffer.concat([this.responseBuffer, data]);

    while (true) {
      const termIdx = this.responseBuffer.indexOf(0xFF);
      if (termIdx < 0) break;

      const packet = this.responseBuffer.subarray(0, termIdx + 1);
      this.responseBuffer = this.responseBuffer.subarray(termIdx + 1);

      const response = parseViscaResponse(packet);

      if (response.type === 'completion' || response.type === 'error') {
        if (this.pendingResolve) {
          this.pendingResolve(response.type === 'completion');
        }
      }
      // ACK — czekamy dalej na Completion
    }
  }

  private _cleanup(): void {
    if (this.socket) {
      try { this.socket.destroy(); } catch { /* ignoruj */ }
      this.socket = null;
    }
    this._connected = false;
    this.responseBuffer = Buffer.alloc(0);
    this.pendingResolve = null;
  }
}
