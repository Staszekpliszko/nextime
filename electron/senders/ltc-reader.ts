import { EventEmitter } from 'events';

// ── Typy ────────────────────────────────────────────────

export type LtcSourceType = 'internal' | 'ltc' | 'mtc' | 'manual';

export interface LtcReaderConfig {
  /** Czy reader jest aktywny */
  enabled: boolean;
  /** Aktualny źródło TC */
  source: LtcSourceType;
}

/** Status LTC readera */
export interface LtcReaderStatus {
  /** Aktualny źródło TC */
  source: LtcSourceType;
  /** Czy jest połączony z zewnętrznym źródłem (LTC/MTC) */
  connected: boolean;
  /** Ostatnia odebrana pozycja w klatkach */
  lastTcFrames: number | null;
  /** Timestamp ostatniego odbioru TC */
  lastReceivedAt: number | null;
}

// ── LtcReader ──────────────────────────────────────────

const DEFAULT_CONFIG: LtcReaderConfig = {
  enabled: true,
  source: 'internal',
};

/**
 * Czytnik zewnętrznego timecodu (LTC audio / MTC MIDI / manual).
 *
 * PLACEHOLDER: Nie używa prawdziwego hardware.
 * Interfejs gotowy do podpięcia ltc-reader npm (audio LTC)
 * lub node-midi / serialport (MTC).
 *
 * Emituje:
 * - 'tc-received' (frames: number) — nowa pozycja TC
 * - 'tc-lost' — brak sygnału TC
 * - 'source-changed' (source: LtcSourceType) — zmiana źródła
 */
export class LtcReader extends EventEmitter {
  private config: LtcReaderConfig;
  private _connected = false;
  private _lastTcFrames: number | null = null;
  private _lastReceivedAt: number | null = null;

  /** Callback do testów — przechwytuje tc-received */
  onTcReceived: ((frames: number) => void) | null = null;

  constructor(config: Partial<LtcReaderConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Podpina się do engine — LTC reader nie nasłuchuje engine, ale KARMIA go danymi */
  attach(_engine: EventEmitter): void {
    console.log(`[LtcReader] Podpięty (source: ${this.config.source})`);
  }

  /** Łączy z zewnętrznym źródłem LTC/MTC (placeholder) */
  connect(): void {
    if (!this.config.enabled) return;
    if (this.config.source === 'internal' || this.config.source === 'manual') {
      // Internal i manual nie wymagają połączenia
      return;
    }

    console.log(`[LtcReader] Łączę z ${this.config.source.toUpperCase()} (placeholder)...`);
    // Placeholder: symulowane połączenie
    this._connected = true;
    this.emit('connected');
    console.log(`[LtcReader] Połączono z ${this.config.source.toUpperCase()} (placeholder)`);
  }

  /** Rozłącza zewnętrzne źródło */
  disconnect(): void {
    this._connected = false;
    this._lastTcFrames = null;
    this._lastReceivedAt = null;
    this.emit('disconnected');
    console.log('[LtcReader] Rozłączono');
  }

  /** Zmienia źródło TC */
  setSource(source: LtcSourceType): void {
    const prev = this.config.source;
    this.config.source = source;

    // Rozłącz jeśli zmienił się source i byliśmy połączeni
    if (prev !== source && this._connected) {
      this.disconnect();
    }

    this.emit('source-changed', source);
    console.log(`[LtcReader] Źródło zmienione: ${prev} → ${source}`);
  }

  /** Ręczne ustawienie pozycji TC (manual mode lub symulowany odbiór) */
  feedTc(frames: number): void {
    if (!this.config.enabled) return;

    this._lastTcFrames = frames;
    this._lastReceivedAt = Date.now();

    this.emit('tc-received', frames);
    if (this.onTcReceived) {
      this.onTcReceived(frames);
    }
  }

  /** Zwraca aktualny status */
  getStatus(): LtcReaderStatus {
    return {
      source: this.config.source,
      connected: this._connected,
      lastTcFrames: this._lastTcFrames,
      lastReceivedAt: this._lastReceivedAt,
    };
  }

  /** Zwraca aktualną konfigurację */
  getConfig(): LtcReaderConfig {
    return { ...this.config };
  }

  /** Aktualizuje konfigurację */
  updateConfig(config: Partial<LtcReaderConfig>): void {
    if (config.source !== undefined && config.source !== this.config.source) {
      this.setSource(config.source);
    }
    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
    }
  }

  /** Cleanup */
  destroy(): void {
    this.disconnect();
    this.onTcReceived = null;
    this.removeAllListeners();
  }
}
