/**
 * NdiPtzDriver — NDI/HTTP PTZ Control.
 *
 * Kamery NDI PTZ (PTZOptics, BirdDog, Kiloview) oprócz protokołu NDI
 * obsługują sterowanie PTZ przez HTTP CGI API.
 *
 * PTZOptics CGI API:
 *   GET http://{ip}/cgi-bin/ptzctrl.cgi?ptzcmd&poscall&{preset}
 *   GET http://{ip}/cgi-bin/ptzctrl.cgi?ptzcmd&left&{speed}&{speed}
 *   GET http://{ip}/cgi-bin/ptzctrl.cgi?ptzcmd&ptzstop
 *
 * BirdDog CGI API (kompatybilny z PTZOptics):
 *   GET http://{ip}/birddogptzsetup?Ession=1&preset={nr}
 *
 * Nie wymaga dodatkowych zależności — używa wbudowanego http Node.js.
 */

import * as http from 'http';
import type { PtzDriver, PtzDriverStatus } from './ptz-driver';

// ── Konfiguracja ────────────────────────────────────────

export interface NdiPtzConfig {
  /** Adres IP kamery NDI */
  ip: string;
  /** Port HTTP (domyślnie 80) */
  port: number;
  /** Timeout w ms */
  timeout: number;
}

const DEFAULT_CONFIG: NdiPtzConfig = {
  ip: '',
  port: 80,
  timeout: 3000,
};

// ── NdiPtzDriver ────────────────────────────────────────

export class NdiPtzDriver implements PtzDriver {
  readonly protocol = 'ndi' as const;
  private config: NdiPtzConfig;
  private _connected = false;
  private _lastError: string | undefined;

  /** Callback do przechwytywania requestów (testy) */
  onRequest: ((url: string) => void) | null = null;

  constructor(config: Partial<NdiPtzConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async connect(): Promise<{ ok: boolean; error?: string }> {
    if (!this.config.ip) {
      return { ok: false, error: 'Nie podano adresu IP kamery NDI' };
    }

    // Testowe połączenie — próbujemy odpytać kamerę
    try {
      await this._httpGet('/');
      this._connected = true;
      this._lastError = undefined;
      console.log(`[NdiPtz] Połączono: ${this.config.ip}:${this.config.port}`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = msg;
      // Nawet jeśli test się nie powiódł, oznaczamy jako "połączony"
      // bo kamera może nie odpowiadać na / ale na CGI tak
      this._connected = true;
      console.log(`[NdiPtz] Połączono (bez weryfikacji): ${this.config.ip}:${this.config.port}`);
      return { ok: true };
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    console.log('[NdiPtz] Rozłączono');
  }

  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Recall preset — PTZOptics CGI API.
   * URL: /cgi-bin/ptzctrl.cgi?ptzcmd&poscall&{presetNr}
   */
  async recallPreset(presetNr: number): Promise<{ ok: boolean; error?: string }> {
    if (!this._connected) {
      return { ok: false, error: 'Nie połączono z kamerą NDI' };
    }

    const url = `/cgi-bin/ptzctrl.cgi?ptzcmd&poscall&${presetNr}`;
    try {
      await this._httpGet(url);
      console.log(`[NdiPtz] Recall preset ${presetNr} → ${this.config.ip}`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = msg;
      return { ok: false, error: msg };
    }
  }

  /**
   * Pan/Tilt — PTZOptics CGI API.
   * Kierunki: left, right, up, down, leftup, leftdown, rightup, rightdown
   * URL: /cgi-bin/ptzctrl.cgi?ptzcmd&{direction}&{panSpeed}&{tiltSpeed}
   */
  async panTilt(
    panSpeed: number,
    tiltSpeed: number,
    panDir: number,
    tiltDir: number,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this._connected) {
      return { ok: false, error: 'Nie połączono z kamerą NDI' };
    }

    // Buduj komendę kierunku
    let direction: string;
    if (panDir === 0 && tiltDir === 0) {
      return this.stop();
    } else if (panDir < 0 && tiltDir < 0) {
      direction = 'leftup';
    } else if (panDir < 0 && tiltDir > 0) {
      direction = 'leftdown';
    } else if (panDir > 0 && tiltDir < 0) {
      direction = 'rightup';
    } else if (panDir > 0 && tiltDir > 0) {
      direction = 'rightdown';
    } else if (panDir < 0) {
      direction = 'left';
    } else if (panDir > 0) {
      direction = 'right';
    } else if (tiltDir < 0) {
      direction = 'up';
    } else {
      direction = 'down';
    }

    // Prędkości CGI: 1-24 (VISCA compatible)
    const ps = Math.max(1, Math.min(24, panSpeed));
    const ts = Math.max(1, Math.min(20, tiltSpeed));

    const url = `/cgi-bin/ptzctrl.cgi?ptzcmd&${direction}&${ps}&${ts}`;
    try {
      await this._httpGet(url);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = msg;
      return { ok: false, error: msg };
    }
  }

  /**
   * Stop — PTZOptics CGI API.
   * URL: /cgi-bin/ptzctrl.cgi?ptzcmd&ptzstop
   */
  async stop(): Promise<{ ok: boolean; error?: string }> {
    if (!this._connected) {
      return { ok: false, error: 'Nie połączono z kamerą NDI' };
    }

    const url = '/cgi-bin/ptzctrl.cgi?ptzcmd&ptzstop';
    try {
      await this._httpGet(url);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = msg;
      return { ok: false, error: msg };
    }
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
    this.onRequest = null;
  }

  // ── Prywatne ────────────────────────────────────────────

  private _httpGet(path: string): Promise<string> {
    if (this.onRequest) {
      this.onRequest(path);
    }

    return new Promise((resolve, reject) => {
      const req = http.get(
        {
          hostname: this.config.ip,
          port: this.config.port,
          path,
          timeout: this.config.timeout,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          res.on('end', () => resolve(body));
        },
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('HTTP timeout'));
      });
    });
  }
}
