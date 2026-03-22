/**
 * Interfejs PtzDriver — abstrakcja nad protokołami sterowania kamer PTZ.
 *
 * Każdy protokół (VISCA IP, VISCA Serial, Pelco-D, ONVIF, NDI)
 * implementuje ten interfejs.
 */

export interface PtzDriverStatus {
  connected: boolean;
  protocol: PtzProtocol;
  lastError?: string;
}

export type PtzProtocol = 'visca_ip' | 'visca_serial' | 'pelco_d' | 'onvif' | 'ndi' | 'panasonic_http';

export interface PtzDriver {
  /** Nazwa protokołu */
  readonly protocol: PtzProtocol;

  /** Łączy z kamerą */
  connect(): Promise<{ ok: boolean; error?: string }>;

  /** Rozłącza */
  disconnect(): Promise<void>;

  /** Czy jest połączony */
  isConnected(): boolean;

  /** Recall preset (numer presetu 0-255) */
  recallPreset(presetNr: number): Promise<{ ok: boolean; error?: string }>;

  /** Pan/Tilt — speed: 1-24 (VISCA), direction: -1/0/1 */
  panTilt(panSpeed: number, tiltSpeed: number, panDir: number, tiltDir: number): Promise<{ ok: boolean; error?: string }>;

  /** Stop pan/tilt */
  stop(): Promise<{ ok: boolean; error?: string }>;

  /** Zwraca status */
  getStatus(): PtzDriverStatus;

  /** Cleanup */
  destroy(): Promise<void>;
}
