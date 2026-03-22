import { EventEmitter } from 'events';

// ── Typy ────────────────────────────────────────────────

export interface AtemSenderConfig {
  /** Adres IP ATEM switchera (domyślnie: '192.168.10.240') */
  ip: string;
  /** ME (Mix Effect) bus number: 0-3 (domyślnie: 0) */
  meIndex: number;
  /** Czy auto-switch na vision cue change jest włączony */
  autoSwitch: boolean;
  /** Typ tranzycji: 'cut' | 'mix' (domyślnie: 'cut') */
  transitionType: 'cut' | 'mix';
  /** Czas tranzycji mix w klatkach (domyślnie: 25 = 1s @ 25fps) */
  mixDurationFrames: number;
  /** Czy sender jest aktywny */
  enabled: boolean;
}

/** Stan połączenia ATEM */
export interface AtemStatus {
  connected: boolean;
  /** Aktualny source na Program output */
  programInput: number | null;
  /** Aktualny source na Preview output */
  previewInput: number | null;
  /** Model switchera (jeśli podłączony) */
  modelName: string | null;
  /** IP z konfiga */
  ip: string;
  /** ME index z konfiga */
  meIndex: number;
  /** Auto-switch aktywny */
  autoSwitch: boolean;
}

/** Lokalna podzbiór danych vision cue — osobna nazwa, żeby nie kolidować z docs/types.ts VisionCueData */
interface AtemVisionPayload {
  camera_number?: number;
  shot_name?: string;
  color?: string;
}

// ── Dynamiczny import atem-connection (graceful fallback) ────

interface AtemInstance {
  connect(ip: string): Promise<void>;
  destroy(): Promise<void>;
  changeProgramInput(input: number, me?: number): Promise<void>;
  changePreviewInput(input: number, me?: number): Promise<void>;
  cut(me?: number): Promise<void>;
  autoTransition(me?: number): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeAllListeners(): void;
  state?: {
    info?: {
      model?: number;
      productIdentifier?: string;
    };
    video?: {
      mixEffects?: Record<number, {
        programInput?: number;
        previewInput?: number;
        transitionPosition?: { inTransition?: boolean };
      }>;
    };
  };
}

/** Próbuje załadować atem-connection. Zwraca null jeśli niedostępny. */
function tryLoadAtemModule(): (new () => AtemInstance) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('atem-connection');
    return mod.Atem as new () => AtemInstance;
  } catch {
    return null;
  }
}

// ── AtemSender ───────────────────────────────────────────

const DEFAULT_CONFIG: AtemSenderConfig = {
  ip: '192.168.10.240',
  meIndex: 0,
  autoSwitch: true,
  transitionType: 'cut',
  mixDurationFrames: 25,
  enabled: true,
};

/** Stała do konwersji ATEM model ID na nazwy */
const ATEM_MODELS: Record<number, string> = {
  0: 'ATEM Television Studio',
  1: 'ATEM 1 M/E Production Switcher',
  2: 'ATEM 2 M/E Production Switcher',
  3: 'ATEM Production Studio 4K',
  4: 'ATEM Mini',
  5: 'ATEM Mini Pro',
  6: 'ATEM Mini Pro ISO',
  7: 'ATEM Mini Extreme',
  8: 'ATEM Mini Extreme ISO',
};

/**
 * Kontroluje BlackMagic ATEM switcher w odpowiedzi na vision cue changes.
 *
 * Prawdziwe połączenie via atem-connection npm z graceful fallback
 * na placeholder jeśli pakiet niedostępny.
 *
 * Callback `onCommand` pozwala testom przechwytywać komendy.
 */
export class AtemSender extends EventEmitter {
  private config: AtemSenderConfig;
  private _connected = false;
  private _programInput: number | null = null;
  private _previewInput: number | null = null;
  private _modelName: string | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _atem: AtemInstance | null = null;
  private _AtemClass: (new () => AtemInstance) | null = null;
  private _useRealAtem = false;
  private _destroying = false;

  /** Callback do przechwytywania komend (testy + integracja) */
  onCommand: ((cmd: { type: string; input?: number; me?: number; duration?: number }) => void) | null = null;

  /**
   * @param config Konfiguracja
   * @param options.forcePlaceholder Wymuś tryb placeholder (do testów — pomija ładowanie atem-connection)
   */
  constructor(config: Partial<AtemSenderConfig> = {}, options?: { forcePlaceholder?: boolean }) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (options?.forcePlaceholder) {
      this._useRealAtem = false;
      this._AtemClass = null;
    } else {
      // Próbuj załadować prawdziwy moduł
      this._AtemClass = tryLoadAtemModule();
      this._useRealAtem = this._AtemClass !== null;
    }

    if (this._useRealAtem) {
      console.log('[AtemSender] atem-connection załadowany — używam prawdziwego ATEM');
    } else {
      console.log('[AtemSender] Tryb placeholder');
    }
  }

  /**
   * Podpina się do engine.
   * UWAGA: Od Fazy 27 vision-cue-changed jest obsługiwane przez VisionRouter,
   * nie bezpośrednio przez AtemSender. Ta metoda jest zachowana dla kompatybilności
   * z SenderManager.attach() — nie dodaje już listenera vision-cue-changed.
   */
  attach(_engine: EventEmitter): void {
    // Vision routing przeniesiony do VisionRouter (Faza 27)
    console.log('[AtemSender] Podpięty do engine (vision routing przez VisionRouter)');
  }

  /** Łączy się z ATEM */
  connect(): void {
    if (!this.config.enabled) return;
    this._destroying = false;

    if (this._useRealAtem && this._AtemClass) {
      this.connectReal();
    } else {
      this.connectPlaceholder();
    }
  }

  /** Prawdziwe połączenie z ATEM via atem-connection */
  private async connectReal(): Promise<void> {
    if (!this._AtemClass) return;

    // Wyczyść poprzednie połączenie
    if (this._atem) {
      try { await this._atem.destroy(); } catch { /* ignore */ }
      this._atem = null;
    }

    console.log(`[AtemSender] Łączę z ATEM: ${this.config.ip} (ME${this.config.meIndex})...`);

    const atem = new this._AtemClass();
    this._atem = atem;

    // Nasłuchuj na zdarzenia ATEM
    atem.on('connected', () => {
      if (this._destroying) return;
      this._connected = true;

      // Pobierz model
      const info = atem.state?.info;
      if (info) {
        this._modelName = info.productIdentifier ?? ATEM_MODELS[info.model ?? 0] ?? 'ATEM';
      }

      // Pobierz aktualny stan ME
      this.syncStateFromAtem();

      this.emit('connected');
      console.log(`[AtemSender] Połączono z ATEM: ${this._modelName} @ ${this.config.ip}`);
    });

    atem.on('disconnected', () => {
      if (this._destroying) return;
      this._connected = false;
      this._programInput = null;
      this._previewInput = null;
      this._modelName = null;
      this.emit('disconnected');
      console.log('[AtemSender] ATEM rozłączono');

      // Auto-reconnect co 5s
      this.scheduleReconnect();
    });

    // Nasłuchuj na zmiany stanu (program/preview)
    atem.on('stateChanged', (...args: unknown[]) => {
      const pathsChanged = (args[1] ?? []) as string[];
      if (this._destroying || !this._connected) return;

      // Sprawdź czy zmienił się ME którego słuchamy
      const mePrefix = `video.mixEffects.${this.config.meIndex}`;
      const relevant = pathsChanged.some(p => p.startsWith(mePrefix));
      if (relevant) {
        this.syncStateFromAtem();
      }
    });

    try {
      await atem.connect(this.config.ip);
    } catch (err) {
      console.error(`[AtemSender] Błąd połączenia z ${this.config.ip}:`, err);
      this.scheduleReconnect();
    }
  }

  /** Synchronizuje lokalny stan z ATEM state */
  private syncStateFromAtem(): void {
    if (!this._atem?.state?.video?.mixEffects) return;
    const me = this._atem.state.video.mixEffects[this.config.meIndex];
    if (!me) return;

    const prevPgm = this._programInput;
    const prevPvw = this._previewInput;

    this._programInput = me.programInput ?? null;
    this._previewInput = me.previewInput ?? null;

    if (prevPgm !== this._programInput) {
      this.emit('program-changed', { input: this._programInput, me: this.config.meIndex });
    }
    if (prevPvw !== this._previewInput) {
      this.emit('preview-changed', { input: this._previewInput, me: this.config.meIndex });
    }
  }

  /** Auto-reconnect co 5s */
  private scheduleReconnect(): void {
    if (this._destroying || this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._destroying && !this._connected) {
        this.connect();
      }
    }, 5000);
  }

  /** Placeholder connect (gdy brak atem-connection) */
  private connectPlaceholder(): void {
    console.log(`[AtemSender] Łączę z ATEM: ${this.config.ip} (ME${this.config.meIndex}) [placeholder]...`);
    this._connected = true;
    this._modelName = 'ATEM Placeholder';
    this._programInput = 1;
    this._previewInput = 2;
    this.emit('connected');
    console.log(`[AtemSender] Połączono z ATEM (placeholder)`);
  }

  /** Rozłącza się z ATEM */
  disconnect(): void {
    this._destroying = true;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this._atem) {
      this._atem.destroy().catch(() => { /* ignore */ });
      this._atem = null;
    }

    this._connected = false;
    this._programInput = null;
    this._previewInput = null;
    this._modelName = null;
    this.emit('disconnected');
    console.log('[AtemSender] Rozłączono z ATEM');
  }

  /** Obsługuje zmianę vision cue — auto-switch do kamery */
  handleVisionCueChanged(activeCue: { data: Record<string, unknown> } | null): void {
    if (!this.config.enabled || !this.config.autoSwitch || !this._connected) return;
    if (!activeCue) return;

    const data = activeCue.data as Partial<AtemVisionPayload>;
    const cameraNumber = data.camera_number;
    if (cameraNumber === undefined || cameraNumber === null) return;

    // Mapuj camera_number na ATEM input (1:1 mapping — rozszerzane przez CameraPreset)
    const atemInput = cameraNumber;

    if (atemInput === this._programInput) return; // już na programie

    if (this.config.transitionType === 'cut') {
      this.performCut(atemInput);
    } else {
      this.performMix(atemInput, this.config.mixDurationFrames);
    }
  }

  /** Wykonuje CUT do wskazanego inputu na danym ME */
  performCut(input: number): void {
    if (!this._connected) return;

    const cmd = { type: 'cut', input, me: this.config.meIndex };
    if (this.onCommand) this.onCommand(cmd);

    if (this._atem && this._useRealAtem) {
      // Prawdziwy ATEM: ustaw preview → cut
      this._atem.changePreviewInput(input, this.config.meIndex)
        .then(() => this._atem!.cut(this.config.meIndex))
        .catch(err => console.error('[AtemSender] Błąd CUT:', err));
    } else {
      // Placeholder: natychmiastowa zmiana
      this._previewInput = input;
      this._programInput = input;
      this.emit('program-changed', { input, me: this.config.meIndex });
    }

    console.log(`[AtemSender] CUT → Input ${input} (ME${this.config.meIndex})`);
  }

  /** Wykonuje MIX (auto transition) do wskazanego inputu */
  performMix(input: number, durationFrames: number): void {
    if (!this._connected) return;

    const cmd = { type: 'mix', input, me: this.config.meIndex, duration: durationFrames };
    if (this.onCommand) this.onCommand(cmd);

    if (this._atem && this._useRealAtem) {
      // Prawdziwy ATEM: ustaw preview → auto transition
      this._atem.changePreviewInput(input, this.config.meIndex)
        .then(() => this._atem!.autoTransition(this.config.meIndex))
        .catch(err => console.error('[AtemSender] Błąd MIX:', err));
    } else {
      // Placeholder
      this._previewInput = input;
      this._programInput = input;
      this.emit('program-changed', { input, me: this.config.meIndex });
    }

    console.log(`[AtemSender] MIX → Input ${input} (${durationFrames} frames, ME${this.config.meIndex})`);
  }

  /** Ręczne ustawienie Preview inputu */
  setPreview(input: number): void {
    if (!this._connected) return;

    const cmd = { type: 'preview', input, me: this.config.meIndex };
    if (this.onCommand) this.onCommand(cmd);

    if (this._atem && this._useRealAtem) {
      this._atem.changePreviewInput(input, this.config.meIndex)
        .catch(err => console.error('[AtemSender] Błąd PREVIEW:', err));
    } else {
      this._previewInput = input;
      this.emit('preview-changed', { input, me: this.config.meIndex });
    }

    console.log(`[AtemSender] PREVIEW → Input ${input} (ME${this.config.meIndex})`);
  }

  /** Zwraca aktualny status ATEM */
  getStatus(): AtemStatus {
    return {
      connected: this._connected,
      programInput: this._programInput,
      previewInput: this._previewInput,
      modelName: this._modelName,
      ip: this.config.ip,
      meIndex: this.config.meIndex,
      autoSwitch: this.config.autoSwitch,
    };
  }

  /** Aktualizuje konfigurację w runtime */
  updateConfig(config: Partial<AtemSenderConfig>): void {
    const wasConnected = this._connected;
    const ipChanged = config.ip !== undefined && config.ip !== this.config.ip;

    this.config = { ...this.config, ...config };

    // Jeśli zmienił się IP i byliśmy połączeni — reconnect
    if (ipChanged && wasConnected) {
      this.disconnect();
      this.connect();
    }
  }

  /** Zwraca aktualną konfigurację */
  getConfig(): AtemSenderConfig {
    return { ...this.config };
  }

  /** Cleanup */
  destroy(): void {
    this.disconnect();
    this.onCommand = null;
    this.removeAllListeners();
  }
}
