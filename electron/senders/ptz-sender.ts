import { EventEmitter } from 'events';

// ── Typy ────────────────────────────────────────────────

export interface PtzCameraConfig {
  /** Numer kamery (1-16) */
  number: number;
  /** Adres IP kamery PTZ */
  ip: string;
  /** Port VISCA over IP (domyślnie: 52381) */
  port: number;
  /** Protokół sterowania (na razie tylko visca_ip) */
  protocol: 'visca_ip';
}

export interface PtzSenderConfig {
  /** Czy sender jest aktywny */
  enabled: boolean;
  /** Lista skonfigurowanych kamer PTZ */
  cameras: PtzCameraConfig[];
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
 * Kontroluje kamery PTZ via VISCA over IP w odpowiedzi na zmianę vision cue.
 *
 * PLACEHOLDER: Nie używa prawdziwego VISCA.
 * Interfejs gotowy do podpięcia biblioteki VISCA over IP.
 * Przy zmianie vision cue → recall preset na kamerze odpowiadającej camera_number.
 *
 * Callback `onCommand` pozwala testom przechwytywać komendy.
 */
export class PtzSender extends EventEmitter {
  private config: PtzSenderConfig;

  /** Callback do przechwytywania komend (testy + przyszła integracja) */
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

  /** Recall preset na kamerze o danym numerze (placeholder) */
  recallPreset(cameraNumber: number): void {
    if (!this.config.enabled) return;

    // Znajdź konfigurację kamery
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

    if (cam) {
      console.log(`[PtzSender] RECALL PRESET cam:${cameraNumber} → ${cam.ip}:${cam.port}`);
    } else {
      console.log(`[PtzSender] RECALL PRESET cam:${cameraNumber} (brak konfiguracji IP — pomijam)`);
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
    this.onCommand = null;
    this.removeAllListeners();
  }
}
