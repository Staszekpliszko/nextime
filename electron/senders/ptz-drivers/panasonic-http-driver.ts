/**
 * PanasonicHttpDriver — sterowanie kamerami Panasonic AW-HE / AW-UE przez HTTP CGI.
 *
 * Obsługiwane kamery: AW-HE130, AW-UE150, AW-UE100 i inne z serii AW
 * z interfejsem HTTP CGI (cgi-bin/aw_ptz, cgi-bin/aw_cam).
 *
 * Komendy CGI:
 *   Recall preset:  GET /cgi-bin/aw_ptz?cmd=%23R{nn}&res=1   (nn = 00-99)
 *   Pan/Tilt:       GET /cgi-bin/aw_ptz?cmd=%23PTS{pptt}&res=1
 *                   pp = 01-99 (50=stop, <50=lewo, >50=prawo)
 *                   tt = 01-99 (50=stop, <50=góra, >50=dół)
 *   Stop:           GET /cgi-bin/aw_ptz?cmd=%23PTS5050&res=1
 *   Zoom:           GET /cgi-bin/aw_ptz?cmd=%23Z{pos}&res=1  (pos = 000-999, 3 cyfry hex-like)
 *   Identyfikacja:  GET /cgi-bin/aw_cam?cmd=QID&res=1        → OID:AW-UE150
 *
 * Nie wymaga dodatkowych zależności — używa wbudowanego http Node.js.
 */

import * as http from 'http';
import type { PtzDriver, PtzDriverStatus } from './ptz-driver';

// ── Konfiguracja ────────────────────────────────────────

export interface PanasonicHttpConfig {
  /** Adres IP kamery Panasonic */
  ip: string;
  /** Port HTTP (domyślnie 80) */
  port: number;
  /** Timeout w ms */
  timeout: number;
}

const DEFAULT_CONFIG: PanasonicHttpConfig = {
  ip: '',
  port: 80,
  timeout: 3000,
};

// ── PanasonicHttpDriver ─────────────────────────────────

export class PanasonicHttpDriver implements PtzDriver {
  readonly protocol = 'panasonic_http' as const;
  private config: PanasonicHttpConfig;
  private _connected = false;
  private _lastError: string | undefined;
  /** Model kamery wykryty przez QID (np. "AW-UE150") */
  private _modelName: string | undefined;

  /** Callback do przechwytywania requestów HTTP (testy) */
  onRequest: ((url: string) => void) | null = null;

  constructor(config: Partial<PanasonicHttpConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Łączy z kamerą — próbuje auto-detect modelu przez QID.
   * Nawet jeśli QID nie odpowie, oznaczamy jako połączony
   * (kamera może blokować QID ale akceptować komendy PTZ).
   */
  async connect(): Promise<{ ok: boolean; error?: string }> {
    if (!this.config.ip) {
      return { ok: false, error: 'Nie podano adresu IP kamery Panasonic' };
    }

    try {
      // Próba auto-detect modelu kamery
      const response = await this._httpGet('/cgi-bin/aw_cam?cmd=QID&res=1');
      // Odpowiedź Panasonic: "OID:AW-UE150" lub podobna
      const match = response.match(/OID:(.+)/);
      if (match && match[1]) {
        this._modelName = match[1].trim();
      }
      this._connected = true;
      this._lastError = undefined;
      console.log(`[PanasonicHttp] Połączono: ${this.config.ip}:${this.config.port} (model: ${this._modelName ?? 'nieznany'})`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = msg;
      // Nawet bez weryfikacji QID — oznaczamy jako połączony
      // (kamera może nie odpowiadać na QID ale na aw_ptz tak)
      this._connected = true;
      console.log(`[PanasonicHttp] Połączono (bez weryfikacji QID): ${this.config.ip}:${this.config.port}`);
      return { ok: true };
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this._modelName = undefined;
    console.log('[PanasonicHttp] Rozłączono');
  }

  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Recall preset — komenda CGI #R{nn}.
   * Preset nr 0-99, formatowany jako dwucyfrowy (00-99).
   * URL: /cgi-bin/aw_ptz?cmd=%23R{nn}&res=1
   * %23 = '#' (URL encoded)
   */
  async recallPreset(presetNr: number): Promise<{ ok: boolean; error?: string }> {
    if (!this._connected) {
      return { ok: false, error: 'Nie połączono z kamerą Panasonic' };
    }

    // Panasonic obsługuje presety 0-99
    const clampedPreset = Math.max(0, Math.min(99, presetNr));
    const nn = clampedPreset.toString().padStart(2, '0');
    const url = `/cgi-bin/aw_ptz?cmd=%23R${nn}&res=1`;

    try {
      await this._httpGet(url);
      console.log(`[PanasonicHttp] Recall preset ${clampedPreset} → ${this.config.ip}`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = msg;
      return { ok: false, error: msg };
    }
  }

  /**
   * Pan/Tilt — komenda CGI #PTS{pptt}.
   * pp = pozycja pan: 01-99 (50 = stop, <50 = lewo, >50 = prawo)
   * tt = pozycja tilt: 01-99 (50 = stop, <50 = góra, >50 = dół)
   *
   * panDir/tiltDir: -1 = lewo/góra, 0 = stop, 1 = prawo/dół
   * panSpeed/tiltSpeed: 1-49 (maksymalna prędkość ruchu)
   */
  async panTilt(
    panSpeed: number,
    tiltSpeed: number,
    panDir: number,
    tiltDir: number,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this._connected) {
      return { ok: false, error: 'Nie połączono z kamerą Panasonic' };
    }

    // Jeśli oba kierunki = 0 → stop
    if (panDir === 0 && tiltDir === 0) {
      return this.stop();
    }

    // Przelicz na format Panasonic: 50 = środek/stop
    // panDir < 0 → lewo (50 - speed), panDir > 0 → prawo (50 + speed)
    const ps = Math.max(1, Math.min(49, panSpeed));
    const ts = Math.max(1, Math.min(49, tiltSpeed));

    const pp = 50 + (panDir * ps);
    const tt = 50 + (tiltDir * ts);

    // Clamp do zakresu 01-99
    const ppClamped = Math.max(1, Math.min(99, pp));
    const ttClamped = Math.max(1, Math.min(99, tt));

    const ppStr = ppClamped.toString().padStart(2, '0');
    const ttStr = ttClamped.toString().padStart(2, '0');

    const url = `/cgi-bin/aw_ptz?cmd=%23PTS${ppStr}${ttStr}&res=1`;

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
   * Stop — komenda CGI #PTS5050 (pan=50, tilt=50 = brak ruchu).
   */
  async stop(): Promise<{ ok: boolean; error?: string }> {
    if (!this._connected) {
      return { ok: false, error: 'Nie połączono z kamerą Panasonic' };
    }

    const url = '/cgi-bin/aw_ptz?cmd=%23PTS5050&res=1';
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

  /** Zwraca wykryty model kamery (po connect) */
  getModelName(): string | undefined {
    return this._modelName;
  }

  async destroy(): Promise<void> {
    await this.disconnect();
    this.onRequest = null;
  }

  // ── Prywatne ────────────────────────────────────────────

  /** Wysyła request HTTP GET do kamery */
  private _httpGet(path: string): Promise<string> {
    // Callback do przechwytywania w testach
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
