import { EventEmitter } from 'events';
import type { PtzDriver, PtzDriverStatus, PtzProtocol } from './ptz-drivers/ptz-driver';
import { ViscaIpDriver } from './ptz-drivers/visca-ip-driver';
import { ViscaSerialDriver } from './ptz-drivers/visca-serial-driver';
import { OnvifDriver } from './ptz-drivers/onvif-driver';
import { NdiPtzDriver } from './ptz-drivers/ndi-ptz-driver';

// ── Typy ────────────────────────────────────────────────

export interface PtzCameraConfig {
  /** Numer kamery (1-16) */
  number: number;
  /** Adres IP kamery PTZ (dla visca_ip, onvif, ndi) */
  ip: string;
  /** Port (domyślnie: 52381 dla VISCA IP, 80 dla ONVIF) */
  port: number;
  /** Protokół sterowania */
  protocol: PtzProtocol;
  /** Ścieżka portu serial (dla visca_serial) */
  serialPath?: string;
  /** Baud rate (dla visca_serial, domyślnie 9600) */
  serialBaudRate?: number;
  /** Nazwa źródła NDI (dla ndi) */
  ndiSourceName?: string;
  /** ONVIF profile token (dla onvif) */
  onvifProfileToken?: string;
  /** ONVIF username (dla onvif) */
  onvifUsername?: string;
  /** ONVIF password (dla onvif) */
  onvifPassword?: string;
}

export interface PtzSenderConfig {
  /** Czy sender jest aktywny */
  enabled: boolean;
  /** Lista skonfigurowanych kamer PTZ */
  cameras: PtzCameraConfig[];
}

/** Status jednej kamery PTZ */
export interface PtzCameraStatus {
  cameraNumber: number;
  protocol: PtzProtocol;
  connected: boolean;
  lastError?: string;
}

/** Lokalna podzbiór danych vision cue */
interface PtzVisionPayload {
  camera_number?: number;
  shot_name?: string;
}

// ── PtzSender ──────────────────────────────────────────

const DEFAULT_CONFIG: PtzSenderConfig = {
  enabled: false,
  cameras: [],
};

/**
 * Kontroluje kamery PTZ w odpowiedzi na zmianę vision cue.
 *
 * Obsługuje 4 protokoły: VISCA IP, VISCA Serial, ONVIF, NDI.
 * Każda kamera ma własną instancję PtzDriver.
 */
export class PtzSender extends EventEmitter {
  private config: PtzSenderConfig;
  /** Mapa driverów: cameraNumber → PtzDriver */
  private drivers: Map<number, PtzDriver> = new Map();

  /** Callback do przechwytywania komend (testy + integracja) */
  onCommand: ((cmd: { type: string; cameraNumber: number; ip?: string; port?: number }) => void) | null = null;

  constructor(config: Partial<PtzSenderConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Podpina się do engine — nasłuchuje na 'vision-cue-changed' */
  attach(engine: EventEmitter): void {
    engine.on('vision-cue-changed', (activeCue: { data: Record<string, unknown> } | null, _nextCue: unknown) => {
      this.handleVisionCueChanged(activeCue);
    });
    console.log('[PtzSender] Podpięty do engine (vision-cue-changed)');
  }

  /** Obsługuje zmianę vision cue — recall preset na kamerze */
  handleVisionCueChanged(activeCue: { data: Record<string, unknown> } | null): void {
    if (!this.config.enabled || !activeCue) return;

    const data = activeCue.data as Partial<PtzVisionPayload>;
    const cameraNumber = data.camera_number;
    if (cameraNumber === undefined || cameraNumber === null) return;

    this.recallPreset(cameraNumber);
  }

  /** Tworzy driver na podstawie konfiguracji kamery */
  private createDriver(cam: PtzCameraConfig): PtzDriver {
    switch (cam.protocol) {
      case 'visca_ip':
        return new ViscaIpDriver({
          ip: cam.ip,
          port: cam.port || 52381,
          address: 1,
          timeout: 2000,
        });

      case 'visca_serial':
        return new ViscaSerialDriver({
          portPath: cam.serialPath ?? '',
          baudRate: cam.serialBaudRate ?? 9600,
          address: 1,
          timeout: 2000,
        });

      case 'onvif':
        return new OnvifDriver({
          ip: cam.ip,
          port: cam.port || 80,
          profileToken: cam.onvifProfileToken ?? 'Profile_1',
          username: cam.onvifUsername ?? '',
          password: cam.onvifPassword ?? '',
          timeout: 5000,
        });

      case 'ndi':
        return new NdiPtzDriver({
          ip: cam.ip,
          port: cam.port || 80,
          timeout: 3000,
        });

      default:
        // Fallback do VISCA IP
        return new ViscaIpDriver({
          ip: cam.ip,
          port: cam.port || 52381,
        });
    }
  }

  /** Łączy z kamerą (tworzy driver i wywołuje connect) */
  async connectCamera(cameraNumber: number): Promise<{ ok: boolean; error?: string }> {
    const cam = this.config.cameras.find(c => c.number === cameraNumber);
    if (!cam) {
      return { ok: false, error: `Kamera ${cameraNumber} nie jest skonfigurowana` };
    }

    // Rozłącz istniejący driver
    await this.disconnectCamera(cameraNumber);

    const driver = this.createDriver(cam);
    this.drivers.set(cameraNumber, driver);

    const result = await driver.connect();
    if (!result.ok) {
      this.drivers.delete(cameraNumber);
    }
    return result;
  }

  /** Rozłącza kamerę */
  async disconnectCamera(cameraNumber: number): Promise<void> {
    const driver = this.drivers.get(cameraNumber);
    if (driver) {
      await driver.destroy();
      this.drivers.delete(cameraNumber);
    }
  }

  /** Rozłącza wszystkie kamery */
  async disconnectAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [num] of this.drivers) {
      promises.push(this.disconnectCamera(num));
    }
    await Promise.all(promises);
  }

  /** Recall preset na kamerze o danym numerze */
  async recallPreset(cameraNumber: number, presetNr?: number): Promise<void> {
    if (!this.config.enabled) return;

    const cam = this.config.cameras.find(c => c.number === cameraNumber);

    const cmd = {
      type: 'recall_preset',
      cameraNumber,
      ip: cam?.ip,
      port: cam?.port,
    };

    if (this.onCommand) {
      this.onCommand(cmd);
    }

    // Szukaj drivera
    const driver = this.drivers.get(cameraNumber);
    if (driver && driver.isConnected()) {
      // Preset nr = numer kamery (konwencja) lub podany
      const preset = presetNr ?? cameraNumber;
      const result = await driver.recallPreset(preset);
      if (!result.ok) {
        console.warn(`[PtzSender] Błąd recall preset cam:${cameraNumber}: ${result.error}`);
      }
    } else if (cam) {
      console.log(`[PtzSender] RECALL PRESET cam:${cameraNumber} → ${cam.ip}:${cam.port} (${cam.protocol}, niepołączony)`);
    } else {
      console.log(`[PtzSender] RECALL PRESET cam:${cameraNumber} (brak konfiguracji — pomijam)`);
    }
  }

  /** Status kamery */
  getCameraStatus(cameraNumber: number): PtzCameraStatus | null {
    const cam = this.config.cameras.find(c => c.number === cameraNumber);
    if (!cam) return null;

    const driver = this.drivers.get(cameraNumber);
    const driverStatus = driver?.getStatus();

    return {
      cameraNumber,
      protocol: cam.protocol,
      connected: driverStatus?.connected ?? false,
      lastError: driverStatus?.lastError,
    };
  }

  /** Status wszystkich kamer */
  getAllCameraStatuses(): PtzCameraStatus[] {
    return this.config.cameras.map(cam => {
      const driver = this.drivers.get(cam.number);
      const driverStatus = driver?.getStatus();
      return {
        cameraNumber: cam.number,
        protocol: cam.protocol,
        connected: driverStatus?.connected ?? false,
        lastError: driverStatus?.lastError,
      };
    });
  }

  /** Lista portów serial (dla visca_serial) */
  async listSerialPorts(): Promise<Array<{ path: string; manufacturer?: string }>> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sp = require('serialport') as { SerialPort: { list(): Promise<Array<{ path: string; manufacturer?: string }>> } };
      return await sp.SerialPort.list();
    } catch {
      return [];
    }
  }

  /** Aktualizuje konfigurację */
  updateConfig(config: Partial<PtzSenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Zwraca aktualną konfigurację */
  getConfig(): PtzSenderConfig {
    return { ...this.config, cameras: [...this.config.cameras] };
  }

  /** Cleanup */
  destroy(): void {
    this.disconnectAll().catch(() => {});
    this.onCommand = null;
    this.removeAllListeners();
  }
}
