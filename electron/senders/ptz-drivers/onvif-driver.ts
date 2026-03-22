/**
 * OnvifDriver — ONVIF Profile S (HTTP/SOAP) do sterowania kamerami PTZ.
 *
 * ONVIF to otwarty standard dla kamer IP. Profile S obejmuje
 * sterowanie PTZ przez HTTP SOAP.
 *
 * Nie wymaga dodatkowych zależności — używa wbudowanego http/https Node.js.
 * Komendy SOAP budowane jako XML string.
 *
 * Specyfikacja: ONVIF PTZ Service Specification
 */

import * as http from 'http';
import type { PtzDriver, PtzDriverStatus } from './ptz-driver';

// ── Konfiguracja ────────────────────────────────────────

export interface OnvifConfig {
  ip: string;
  port: number;
  /** Ścieżka serwisu PTZ (domyślnie: /onvif/ptz_service) */
  ptzServicePath: string;
  /** Profile token (domyślnie: Profile_1) */
  profileToken: string;
  /** Credentials (opcjonalne — wiele kamer wymaga auth) */
  username: string;
  password: string;
  /** Timeout w ms */
  timeout: number;
}

const DEFAULT_CONFIG: OnvifConfig = {
  ip: '',
  port: 80,
  ptzServicePath: '/onvif/ptz_service',
  profileToken: 'Profile_1',
  username: '',
  password: '',
  timeout: 5000,
};

// ── SOAP helpers ────────────────────────────────────────

function soapEnvelope(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
            xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>${body}</s:Body>
</s:Envelope>`;
}

function gotoPresetBody(profileToken: string, presetToken: string): string {
  return `
    <tptz:GotoPreset>
      <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
      <tptz:PresetToken>${presetToken}</tptz:PresetToken>
    </tptz:GotoPreset>`;
}

function continuousMoveBody(
  profileToken: string,
  panSpeed: number,
  tiltSpeed: number,
): string {
  return `
    <tptz:ContinuousMove>
      <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
      <tptz:Velocity>
        <tt:PanTilt x="${panSpeed.toFixed(2)}" y="${tiltSpeed.toFixed(2)}" />
      </tptz:Velocity>
    </tptz:ContinuousMove>`;
}

function stopBody(profileToken: string): string {
  return `
    <tptz:Stop>
      <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
      <tptz:PanTilt>true</tptz:PanTilt>
      <tptz:Zoom>true</tptz:Zoom>
    </tptz:Stop>`;
}

// ── OnvifDriver ─────────────────────────────────────────

export class OnvifDriver implements PtzDriver {
  readonly protocol = 'onvif' as const;
  private config: OnvifConfig;
  private _connected = false;
  private _lastError: string | undefined;

  /** Callback do przechwytywania requestów (testy) */
  onRequest: ((soap: string) => void) | null = null;

  constructor(config: Partial<OnvifConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async connect(): Promise<{ ok: boolean; error?: string }> {
    if (!this.config.ip) {
      return { ok: false, error: 'Nie podano adresu IP kamery' };
    }

    // Testowe połączenie — próbujemy GetStatus
    try {
      const testSoap = soapEnvelope(`
        <tptz:GetStatus>
          <tptz:ProfileToken>${this.config.profileToken}</tptz:ProfileToken>
        </tptz:GetStatus>`);

      await this._sendSoap(testSoap);
      this._connected = true;
      this._lastError = undefined;
      console.log(`[ONVIF] Połączono: ${this.config.ip}:${this.config.port}`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = msg;
      return { ok: false, error: msg };
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    console.log('[ONVIF] Rozłączono');
  }

  isConnected(): boolean {
    return this._connected;
  }

  async recallPreset(presetNr: number): Promise<{ ok: boolean; error?: string }> {
    // ONVIF presety są identyfikowane tokenem — konwencja: "Preset_N"
    const presetToken = `Preset_${presetNr}`;
    const soap = soapEnvelope(gotoPresetBody(this.config.profileToken, presetToken));

    try {
      await this._sendSoap(soap);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = msg;
      return { ok: false, error: msg };
    }
  }

  async panTilt(
    panSpeed: number,
    tiltSpeed: number,
    panDir: number,
    tiltDir: number,
  ): Promise<{ ok: boolean; error?: string }> {
    // ONVIF: speed jako float -1.0..1.0
    const maxSpeed = 1.0;
    const normalizedPan = (panDir * Math.min(panSpeed, 24) / 24) * maxSpeed;
    const normalizedTilt = (tiltDir * Math.min(tiltSpeed, 24) / 24) * maxSpeed;

    const soap = soapEnvelope(continuousMoveBody(this.config.profileToken, normalizedPan, normalizedTilt));

    try {
      await this._sendSoap(soap);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = msg;
      return { ok: false, error: msg };
    }
  }

  async stop(): Promise<{ ok: boolean; error?: string }> {
    const soap = soapEnvelope(stopBody(this.config.profileToken));

    try {
      await this._sendSoap(soap);
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

  private _sendSoap(soap: string): Promise<string> {
    if (this.onRequest) {
      this.onRequest(soap);
    }

    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: this.config.ip,
        port: this.config.port,
        path: this.config.ptzServicePath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(soap),
        },
        timeout: this.config.timeout,
      };

      // Dodaj auth jeśli podano credentials
      if (this.config.username) {
        const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
        options.headers = { ...options.headers, 'Authorization': `Basic ${auth}` };
      }

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`ONVIF HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('ONVIF timeout'));
      });

      req.write(soap);
      req.end();
    });
  }
}
