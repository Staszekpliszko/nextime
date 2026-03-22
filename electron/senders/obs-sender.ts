import { EventEmitter } from 'events';

// ── Typy ────────────────────────────────────────────────

export interface ObsSenderConfig {
  /** Adres IP OBS WebSocket (domyślnie: '127.0.0.1') */
  ip: string;
  /** Port OBS WebSocket (domyślnie: 4455) */
  port: number;
  /** Hasło do OBS WebSocket (opcjonalne — jeśli ustawione w OBS) */
  password: string;
  /** Czy sender jest aktywny */
  enabled: boolean;
  /** Czy auto-switch na vision cue change jest włączony */
  autoSwitch: boolean;
  /**
   * Mapping camera_number → nazwa sceny OBS.
   * Np. { 1: 'Kamera Wide', 2: 'Close-up', 3: 'Grafika' }
   */
  sceneMap: Record<number, string>;
}

/** Stan połączenia OBS */
export interface ObsStatus {
  connected: boolean;
  /** Aktualnie aktywna scena na Program */
  currentScene: string | null;
  /** Aktualnie aktywna scena na Preview (Studio Mode) */
  previewScene: string | null;
  /** Lista dostępnych scen */
  scenes: string[];
  /** Czy OBS jest w Studio Mode */
  studioMode: boolean;
  /** IP z konfiga */
  ip: string;
  /** Port z konfiga */
  port: number;
}

/** Payload vision cue — podzbiór VisionCueData */
interface ObsVisionPayload {
  camera_number?: number;
  shot_name?: string;
}

// ── Dynamiczny import obs-websocket-js (graceful fallback) ────

/**
 * Interfejs wrappujący obs-websocket-js, żeby uniknąć
 * bezpośredniej zależności od ESM modułu w runtime.
 */
interface ObsWebSocketInstance {
  connect(url: string, password?: string, identificationParams?: Record<string, unknown>): Promise<void>;
  disconnect(): void;
  call(requestType: string, requestData?: Record<string, unknown>): Promise<Record<string, unknown>>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  removeAllListeners(): void;
}

/** Próbuje załadować obs-websocket-js. Zwraca konstruktor lub null jeśli niedostępny. */
async function tryLoadObsModule(): Promise<(new () => ObsWebSocketInstance) | null> {
  try {
    // obs-websocket-js jest ESM, więc dynamiczny import
    const mod = await import('obs-websocket-js');
    return (mod.default ?? mod) as unknown as new () => ObsWebSocketInstance;
  } catch {
    return null;
  }
}

// ── ObsSender ───────────────────────────────────────────

const DEFAULT_CONFIG: ObsSenderConfig = {
  ip: '127.0.0.1',
  port: 4455,
  password: '',
  enabled: false,
  autoSwitch: true,
  sceneMap: {},
};

/**
 * Kontroluje OBS Studio przez WebSocket API v5 w odpowiedzi na vision cue changes.
 *
 * Prawdziwe połączenie via obs-websocket-js z graceful fallback
 * na placeholder jeśli pakiet niedostępny.
 *
 * Callback `onCommand` pozwala testom przechwytywać komendy.
 */
export class ObsSender extends EventEmitter {
  private config: ObsSenderConfig;
  private _connected = false;
  private _currentScene: string | null = null;
  private _previewScene: string | null = null;
  private _scenes: string[] = [];
  private _studioMode = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _obs: ObsWebSocketInstance | null = null;
  private _ObsClass: (new () => ObsWebSocketInstance) | null = null;
  private _useRealObs = false;
  private _destroying = false;
  private _moduleLoaded = false;
  private _moduleLoadPromise: Promise<void> | null = null;

  /** Callback do przechwytywania komend (testy + integracja) */
  onCommand: ((cmd: { type: string; scene?: string; transition?: string; duration?: number }) => void) | null = null;

  /**
   * @param config Konfiguracja
   * @param options.forcePlaceholder Wymuś tryb placeholder (do testów — pomija ładowanie obs-websocket-js)
   */
  constructor(config: Partial<ObsSenderConfig> = {}, options?: { forcePlaceholder?: boolean }) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (options?.forcePlaceholder) {
      this._useRealObs = false;
      this._ObsClass = null;
      this._moduleLoaded = true;
    } else {
      // Ładowanie asynchroniczne — obs-websocket-js to ESM
      this._moduleLoadPromise = this.loadModule();
    }
  }

  /** Asynchroniczne ładowanie modułu obs-websocket-js */
  private async loadModule(): Promise<void> {
    const cls = await tryLoadObsModule();
    if (cls) {
      this._ObsClass = cls;
      this._useRealObs = true;
      console.log('[ObsSender] obs-websocket-js załadowany — używam prawdziwego OBS');
    } else {
      console.log('[ObsSender] obs-websocket-js niedostępny — tryb placeholder');
    }
    this._moduleLoaded = true;
  }

  /** Czeka na załadowanie modułu (jeśli jeszcze nie gotowy) */
  private async ensureModuleLoaded(): Promise<void> {
    if (this._moduleLoaded) return;
    if (this._moduleLoadPromise) {
      await this._moduleLoadPromise;
    }
  }

  /** Podpina się do engine — nasłuchuje na 'vision-cue-changed' */
  attach(engine: EventEmitter): void {
    engine.on('vision-cue-changed', (activeCue: { data: Record<string, unknown> } | null, _nextCue: unknown) => {
      this.handleVisionCueChanged(activeCue);
    });
    console.log('[ObsSender] Podpięty do engine (vision-cue-changed)');
  }

  /** Łączy się z OBS WebSocket */
  async connect(): Promise<void> {
    if (!this.config.enabled) return;
    this._destroying = false;

    await this.ensureModuleLoaded();

    if (this._useRealObs && this._ObsClass) {
      await this.connectReal();
    } else {
      this.connectPlaceholder();
    }
  }

  /** Prawdziwe połączenie z OBS via obs-websocket-js */
  private async connectReal(): Promise<void> {
    if (!this._ObsClass) return;

    // Wyczyść poprzednie połączenie
    if (this._obs) {
      try { this._obs.disconnect(); } catch { /* ignore */ }
      this._obs = null;
    }

    console.log(`[ObsSender] Łączę z OBS: ws://${this.config.ip}:${this.config.port}...`);

    const obs = new this._ObsClass();
    this._obs = obs;

    // Nasłuchuj na zdarzenia OBS
    obs.on('ConnectionOpened', () => {
      // Połączenie TCP otwarte — czekamy na identyfikację
    });

    obs.on('Identified', () => {
      if (this._destroying) return;
      this._connected = true;
      this.emit('connected');
      console.log(`[ObsSender] Połączono z OBS @ ${this.config.ip}:${this.config.port}`);

      // Pobierz początkowy stan
      this.refreshState().catch(err => {
        console.error('[ObsSender] Błąd pobierania stanu:', err);
      });
    });

    obs.on('ConnectionClosed', () => {
      if (this._destroying) return;
      const wasConnected = this._connected;
      this._connected = false;
      this._currentScene = null;
      this._previewScene = null;
      this._scenes = [];
      this._studioMode = false;
      if (wasConnected) {
        this.emit('disconnected');
        console.log('[ObsSender] OBS rozłączono');
      }
      this.scheduleReconnect();
    });

    obs.on('ConnectionError', (err: unknown) => {
      if (this._destroying) return;
      console.error('[ObsSender] Błąd połączenia z OBS:', err);
      this.emit('error', err);
    });

    // Nasłuchuj na zmiany scen
    obs.on('CurrentProgramSceneChanged', (data: unknown) => {
      if (this._destroying) return;
      const event = data as { sceneName?: string };
      if (event.sceneName) {
        this._currentScene = event.sceneName;
        this.emit('scene-changed', { scene: event.sceneName, type: 'program' });
      }
    });

    obs.on('CurrentPreviewSceneChanged', (data: unknown) => {
      if (this._destroying) return;
      const event = data as { sceneName?: string };
      if (event.sceneName) {
        this._previewScene = event.sceneName;
        this.emit('scene-changed', { scene: event.sceneName, type: 'preview' });
      }
    });

    obs.on('StudioModeStateChanged', (data: unknown) => {
      if (this._destroying) return;
      const event = data as { studioModeEnabled?: boolean };
      if (event.studioModeEnabled !== undefined) {
        this._studioMode = event.studioModeEnabled;
      }
    });

    obs.on('SceneListChanged', () => {
      if (this._destroying) return;
      // Odśwież listę scen
      this.refreshSceneList().catch(() => {});
    });

    try {
      const url = `ws://${this.config.ip}:${this.config.port}`;
      await obs.connect(url, this.config.password || undefined, { rpcVersion: 1 });
    } catch (err) {
      console.error(`[ObsSender] Błąd połączenia z OBS ${this.config.ip}:${this.config.port}:`, err);
      this.emit('error', err);
      this.scheduleReconnect();
    }
  }

  /** Odświeża pełny stan OBS (sceny, Studio Mode, aktywna scena) */
  private async refreshState(): Promise<void> {
    if (!this._obs || !this._connected) return;

    await this.refreshSceneList();

    // Pobierz aktualną scenę na Program
    try {
      const pgm = await this._obs.call('GetCurrentProgramScene');
      this._currentScene = (pgm.sceneName ?? pgm.currentProgramSceneName ?? null) as string | null;
    } catch { /* ignore */ }

    // Sprawdź czy Studio Mode jest aktywny
    try {
      const sm = await this._obs.call('GetStudioModeEnabled');
      this._studioMode = (sm.studioModeEnabled ?? false) as boolean;

      if (this._studioMode) {
        try {
          const pvw = await this._obs.call('GetCurrentPreviewScene');
          this._previewScene = (pvw.sceneName ?? pvw.currentPreviewSceneName ?? null) as string | null;
        } catch { /* ignore */ }
      }
    } catch {
      this._studioMode = false;
    }
  }

  /** Odświeża listę scen z OBS */
  private async refreshSceneList(): Promise<void> {
    if (!this._obs || !this._connected) return;

    try {
      const result = await this._obs.call('GetSceneList');
      const rawScenes = result.scenes as Array<{ sceneName?: string; sceneIndex?: number }> | undefined;
      if (Array.isArray(rawScenes)) {
        // OBS zwraca sceny w odwrotnej kolejności (najnowsza pierwsza) — odwracamy
        this._scenes = rawScenes
          .map(s => (s.sceneName ?? '') as string)
          .filter(name => name.length > 0)
          .reverse();
      }
    } catch (err) {
      console.error('[ObsSender] Błąd pobierania listy scen:', err);
    }
  }

  /** Placeholder connect (gdy brak obs-websocket-js) */
  private connectPlaceholder(): void {
    console.log(`[ObsSender] Łączę z OBS: ${this.config.ip}:${this.config.port} [placeholder]...`);
    this._connected = true;
    this._currentScene = 'Scena 1';
    this._previewScene = null;
    this._scenes = ['Scena 1', 'Scena 2', 'Scena 3'];
    this._studioMode = false;
    this.emit('connected');
    console.log('[ObsSender] Połączono z OBS (placeholder)');
  }

  /** Auto-reconnect co 5s */
  private scheduleReconnect(): void {
    if (this._destroying || this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._destroying && !this._connected) {
        this.connect().catch(err => {
          console.error('[ObsSender] Auto-reconnect failed:', err);
        });
      }
    }, 5000);
  }

  /** Rozłącza się z OBS */
  disconnect(): void {
    this._destroying = true;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this._obs) {
      try { this._obs.disconnect(); } catch { /* ignore */ }
      this._obs = null;
    }

    this._connected = false;
    this._currentScene = null;
    this._previewScene = null;
    this._scenes = [];
    this._studioMode = false;
    this.emit('disconnected');
    console.log('[ObsSender] Rozłączono z OBS');
  }

  /** Obsługuje zmianę vision cue — auto-switch do sceny OBS */
  handleVisionCueChanged(activeCue: { data: Record<string, unknown> } | null): void {
    if (!this.config.enabled || !this.config.autoSwitch || !this._connected) return;
    if (!activeCue) return;

    const data = activeCue.data as Partial<ObsVisionPayload>;
    const cameraNumber = data.camera_number;
    if (cameraNumber === undefined || cameraNumber === null) return;

    // Mapuj camera_number → scena OBS
    const sceneName = this.config.sceneMap[cameraNumber];
    if (!sceneName) {
      console.log(`[ObsSender] Brak mappingu dla kamery ${cameraNumber} w sceneMap`);
      return;
    }

    if (sceneName === this._currentScene) return; // już na tej scenie

    this.setScene(sceneName).catch(err => {
      console.error(`[ObsSender] Błąd przełączania sceny na ${sceneName}:`, err);
    });
  }

  /** Przełącza scenę na Program (PGM) */
  async setScene(sceneName: string): Promise<void> {
    if (!this._connected) return;

    const cmd = { type: 'setScene', scene: sceneName };
    if (this.onCommand) this.onCommand(cmd);

    if (this._obs && this._useRealObs) {
      try {
        await this._obs.call('SetCurrentProgramScene', { sceneName });
        this._currentScene = sceneName;
      } catch (err) {
        console.error(`[ObsSender] Błąd SetCurrentProgramScene(${sceneName}):`, err);
        throw err;
      }
    } else {
      // Placeholder
      this._currentScene = sceneName;
      this.emit('scene-changed', { scene: sceneName, type: 'program' });
    }

    console.log(`[ObsSender] PGM → ${sceneName}`);
  }

  /** Ustawia scenę na Preview (PRV) — wymaga Studio Mode */
  async setPreviewScene(sceneName: string): Promise<void> {
    if (!this._connected) return;

    const cmd = { type: 'setPreview', scene: sceneName };
    if (this.onCommand) this.onCommand(cmd);

    if (this._obs && this._useRealObs) {
      try {
        await this._obs.call('SetCurrentPreviewScene', { sceneName });
        this._previewScene = sceneName;
      } catch (err) {
        console.error(`[ObsSender] Błąd SetCurrentPreviewScene(${sceneName}):`, err);
        throw err;
      }
    } else {
      // Placeholder
      this._previewScene = sceneName;
      this.emit('scene-changed', { scene: sceneName, type: 'preview' });
    }

    console.log(`[ObsSender] PRV → ${sceneName}`);
  }

  /** Wykonuje przejście w Studio Mode (z Preview na Program) */
  async triggerTransition(transitionName?: string, durationMs?: number): Promise<void> {
    if (!this._connected) return;

    const cmd = { type: 'transition', transition: transitionName, duration: durationMs };
    if (this.onCommand) this.onCommand(cmd);

    if (this._obs && this._useRealObs) {
      try {
        // Opcjonalnie ustaw typ przejścia
        if (transitionName) {
          await this._obs.call('SetCurrentSceneTransition', { transitionName });
        }
        // Opcjonalnie ustaw czas trwania przejścia
        if (durationMs !== undefined && durationMs > 0) {
          await this._obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: durationMs });
        }
        // Wykonaj przejście Studio Mode
        await this._obs.call('TriggerStudioModeTransition');
      } catch (err) {
        console.error('[ObsSender] Błąd TriggerStudioModeTransition:', err);
        throw err;
      }
    } else {
      // Placeholder: przenieś preview na program
      if (this._previewScene) {
        this._currentScene = this._previewScene;
        this._previewScene = null;
        this.emit('scene-changed', { scene: this._currentScene, type: 'program' });
      }
    }

    console.log(`[ObsSender] Transition: ${transitionName ?? 'default'} (${durationMs ?? 'auto'}ms)`);
  }

  /** Pobiera listę scen z OBS (z cache) */
  getSceneList(): string[] {
    return [...this._scenes];
  }

  /** Pobiera nazwę aktualnej sceny na Program */
  getCurrentScene(): string | null {
    return this._currentScene;
  }

  /** Zwraca aktualny status OBS */
  getStatus(): ObsStatus {
    return {
      connected: this._connected,
      currentScene: this._currentScene,
      previewScene: this._previewScene,
      scenes: [...this._scenes],
      studioMode: this._studioMode,
      ip: this.config.ip,
      port: this.config.port,
    };
  }

  /** Aktualizuje konfigurację w runtime */
  updateConfig(config: Partial<ObsSenderConfig>): void {
    const wasConnected = this._connected;
    const connectionChanged = (
      (config.ip !== undefined && config.ip !== this.config.ip) ||
      (config.port !== undefined && config.port !== this.config.port) ||
      (config.password !== undefined && config.password !== this.config.password)
    );

    this.config = { ...this.config, ...config };

    // Jeśli zmienił się IP/port/hasło i byliśmy połączeni — reconnect
    if (connectionChanged && wasConnected) {
      this.disconnect();
      this.connect().catch(err => {
        console.error('[ObsSender] Reconnect po zmianie konfiguracji failed:', err);
      });
    }
  }

  /** Zwraca aktualną konfigurację */
  getConfig(): ObsSenderConfig {
    return { ...this.config, sceneMap: { ...this.config.sceneMap } };
  }

  /** Wymusza odświeżenie listy scen z OBS (live) */
  async refreshScenes(): Promise<string[]> {
    if (!this._connected) return [];

    if (this._obs && this._useRealObs) {
      await this.refreshSceneList();
    }

    return [...this._scenes];
  }

  /** Cleanup */
  destroy(): void {
    this.disconnect();
    this.onCommand = null;
    this.removeAllListeners();
  }
}
