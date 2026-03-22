import { EventEmitter } from 'events';
import http from 'http';
import { parseVmixXml } from './vmix-xml-parser';
import type { VmixInput, VmixState } from './vmix-xml-parser';

// ── Re-eksport typów parsera ────────────────────────────

export type { VmixInput, VmixState };

// ── Typy ────────────────────────────────────────────────

/** Typ przejścia vMix */
export type VmixTransitionType = 'Cut' | 'Fade' | 'Merge' | 'Wipe' | 'Zoom' | 'Stinger1' | 'Stinger2';

/** Konfiguracja VmixSender */
export interface VmixSenderConfig {
  /** Adres IP vMix (domyślnie: '127.0.0.1') */
  ip: string;
  /** Port HTTP API vMix (domyślnie: 8088) */
  port: number;
  /** Czy sender jest aktywny */
  enabled: boolean;
  /** Czy auto-switch na vision cue change jest włączony */
  autoSwitch: boolean;
  /**
   * Mapping camera_number → numer inputu vMix.
   * Np. { 1: 1, 2: 2, 3: 5 }
   */
  inputMap: Record<number, number>;
  /** Domyślny typ przejścia */
  transitionType: VmixTransitionType;
  /** Domyślny czas przejścia w ms (0 = natychmiastowe) */
  transitionDuration: number;
}

/** Status połączenia vMix */
export interface VmixStatus {
  connected: boolean;
  /** Numer aktywnego inputu na Program */
  activeInput: number | null;
  /** Numer inputu na Preview */
  previewInput: number | null;
  /** Lista inputów */
  inputs: VmixInput[];
  /** Czy streaming aktywny */
  streaming: boolean;
  /** Czy nagrywanie aktywne */
  recording: boolean;
  /** Wersja vMix */
  version: string;
  /** IP z konfiguracji */
  ip: string;
  /** Port z konfiguracji */
  port: number;
}

/** Payload vision cue — podzbiór VisionCueData */
interface VmixVisionPayload {
  camera_number?: number;
  shot_name?: string;
}

// ── VmixSender ──────────────────────────────────────────

const DEFAULT_CONFIG: VmixSenderConfig = {
  ip: '127.0.0.1',
  port: 8088,
  enabled: false,
  autoSwitch: true,
  inputMap: {},
  transitionType: 'Cut',
  transitionDuration: 0,
};

/**
 * Kontroluje vMix przez HTTP API w odpowiedzi na vision cue changes.
 *
 * vMix HTTP API: GET /api/?Function=<cmd>&Input=<N>&Duration=<ms>
 * Stan vMix: GET /api/ → XML z pełnym stanem
 *
 * Graceful fallback — jeśli vMix niedostępny, działa w trybie placeholder.
 * Callback `onCommand` pozwala testom przechwytywać komendy.
 */
export class VmixSender extends EventEmitter {
  private config: VmixSenderConfig;
  private _connected = false;
  private _state: VmixState | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _destroying = false;

  /** Callback do przechwytywania komend (testy + integracja) */
  onCommand: ((cmd: { type: string; input?: number; duration?: number; function?: string }) => void) | null = null;

  constructor(config: Partial<VmixSenderConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Połączenie ──────────────────────────────────────────

  /**
   * Podpina się do engine.
   * UWAGA: Od Fazy 27 vision-cue-changed jest obsługiwane przez VisionRouter,
   * nie bezpośrednio przez VmixSender.
   */
  attach(_engine: EventEmitter): void {
    // Vision routing przeniesiony do VisionRouter (Faza 27)
    console.log('[VmixSender] Podpięty do engine (vision routing przez VisionRouter)');
  }

  /** Łączy się z vMix — sprawdza dostępność API */
  async connect(): Promise<void> {
    if (!this.config.enabled) return;
    this._destroying = false;

    try {
      // Sprawdź dostępność vMix przez pobranie stanu XML
      const xml = await this.httpGet('/api/');
      this._state = parseVmixXml(xml);
      this._connected = true;
      this.emit('connected');
      console.log(`[VmixSender] Połączono z vMix @ ${this.config.ip}:${this.config.port} (v${this._state.version})`);
    } catch (err) {
      console.error(`[VmixSender] Błąd połączenia z vMix ${this.config.ip}:${this.config.port}:`, err);
      this.emit('error', err);
      this.scheduleReconnect();
    }
  }

  /** Rozłącza się z vMix */
  disconnect(): void {
    this._destroying = true;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this._connected = false;
    this._state = null;
    this.emit('disconnected');
    console.log('[VmixSender] Rozłączono z vMix');
  }

  /** Auto-reconnect co 5s */
  private scheduleReconnect(): void {
    if (this._destroying || this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._destroying && !this._connected) {
        this.connect().catch(err => {
          console.error('[VmixSender] Auto-reconnect nieudany:', err);
        });
      }
    }, 5000);
  }

  // ── Komendy vMix ────────────────────────────────────────

  /** CUT — natychmiastowe przełączenie na input (Preview → Cut dla niezawodności) */
  async cut(input: number): Promise<void> {
    await this.sendFunction('PreviewInput', input);
    await this.sendFunction('Cut', input);
  }

  /** Fade (dissolve) na input z opcjonalnym czasem */
  async fade(input: number, durationMs?: number): Promise<void> {
    await this.sendFunction('PreviewInput', input);
    await this.sendFunction('Fade', input, durationMs ?? this.config.transitionDuration);
  }

  /** Merge na input z opcjonalnym czasem */
  async merge(input: number, durationMs?: number): Promise<void> {
    await this.sendFunction('PreviewInput', input);
    await this.sendFunction('Merge', input, durationMs ?? this.config.transitionDuration);
  }

  /** Wipe na input z opcjonalnym czasem */
  async wipe(input: number, durationMs?: number): Promise<void> {
    await this.sendFunction('PreviewInput', input);
    await this.sendFunction('Wipe', input, durationMs ?? this.config.transitionDuration);
  }

  /** Zoom transition na input z opcjonalnym czasem */
  async zoom(input: number, durationMs?: number): Promise<void> {
    await this.sendFunction('PreviewInput', input);
    await this.sendFunction('Zoom', input, durationMs ?? this.config.transitionDuration);
  }

  /** Stinger transition na input */
  async stinger(input: number, stingerNr: 1 | 2 = 1): Promise<void> {
    await this.sendFunction('PreviewInput', input);
    const fn = stingerNr === 2 ? 'Stinger2' : 'Stinger1';
    await this.sendFunction(fn, input);
  }

  /** Ustawia input na Preview (PRV) */
  async setPreview(input: number): Promise<void> {
    await this.sendFunction('PreviewInput', input);
  }

  /** Play media na danym inpucie */
  async playMedia(input: number): Promise<void> {
    await this.sendFunction('Play', input);
  }

  /** Pause media na danym inpucie */
  async pauseMedia(input: number): Promise<void> {
    await this.sendFunction('Pause', input);
  }

  /** Ustaw głośność inputu (0-100) */
  async setVolume(input: number, volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    await this.sendFunctionRaw(`Function=SetVolume&Input=${input}&Value=${clamped}`);
  }

  // ── Odczyt stanu ────────────────────────────────────────

  /** Pobiera listę inputów (z cache lub live) */
  getInputList(): VmixInput[] {
    return this._state ? [...this._state.inputs] : [];
  }

  /** Pobiera pełny stan vMix (z cache) */
  getCurrentState(): VmixState | null {
    return this._state ? { ...this._state, inputs: [...this._state.inputs] } : null;
  }

  /** Zwraca aktualny status vMix */
  getStatus(): VmixStatus {
    return {
      connected: this._connected,
      activeInput: this._state?.activeInput ?? null,
      previewInput: this._state?.previewInput ?? null,
      inputs: this._state ? [...this._state.inputs] : [],
      streaming: this._state?.streaming ?? false,
      recording: this._state?.recording ?? false,
      version: this._state?.version ?? '',
      ip: this.config.ip,
      port: this.config.port,
    };
  }

  /** Odświeża stan z vMix (live HTTP request) */
  async refreshState(): Promise<VmixState | null> {
    if (!this._connected) return null;

    try {
      const xml = await this.httpGet('/api/');
      this._state = parseVmixXml(xml);
      return { ...this._state, inputs: [...this._state.inputs] };
    } catch (err) {
      console.error('[VmixSender] Błąd odświeżania stanu:', err);
      return null;
    }
  }

  /** Odświeża i zwraca listę inputów */
  async refreshInputs(): Promise<VmixInput[]> {
    const state = await this.refreshState();
    return state ? [...state.inputs] : [];
  }

  // ── Vision cue handling ─────────────────────────────────

  /** Obsługuje zmianę vision cue — auto-switch do inputu vMix */
  handleVisionCueChanged(activeCue: { data: Record<string, unknown> } | null): void {
    if (!this.config.enabled || !this.config.autoSwitch || !this._connected) return;
    if (!activeCue) return;

    const data = activeCue.data as Partial<VmixVisionPayload>;
    const cameraNumber = data.camera_number;
    if (cameraNumber === undefined || cameraNumber === null) return;

    // Mapuj camera_number → input vMix
    const vmixInput = this.config.inputMap[cameraNumber];
    if (vmixInput === undefined) {
      console.log(`[VmixSender] Brak mappingu dla kamery ${cameraNumber} w inputMap`);
      return;
    }

    // Wykonaj przejście wg domyślnego typu
    this.executeTransition(vmixInput, this.config.transitionType, this.config.transitionDuration)
      .then(() => {
        // Aktualizuj lokalny stan po przełączeniu
        if (this._state) {
          this._state.previewInput = this._state.activeInput;
          this._state.activeInput = vmixInput;
        }
        this.emit('input-changed', { input: vmixInput, cameraNumber });
      })
      .catch(err => {
        console.error(`[VmixSender] Błąd przełączania na input ${vmixInput}:`, err);
      });
  }

  /** Wykonuje przejście odpowiedniego typu */
  private async executeTransition(input: number, type: VmixTransitionType, durationMs: number): Promise<void> {
    switch (type) {
      case 'Cut':
        await this.cut(input);
        break;
      case 'Fade':
        await this.fade(input, durationMs);
        break;
      case 'Merge':
        await this.merge(input, durationMs);
        break;
      case 'Wipe':
        await this.wipe(input, durationMs);
        break;
      case 'Zoom':
        await this.zoom(input, durationMs);
        break;
      case 'Stinger1':
        await this.stinger(input, 1);
        break;
      case 'Stinger2':
        await this.stinger(input, 2);
        break;
    }
  }

  // ── Konfiguracja ────────────────────────────────────────

  /** Aktualizuje konfigurację w runtime */
  updateConfig(config: Partial<VmixSenderConfig>): void {
    const wasConnected = this._connected;
    const connectionChanged = (
      (config.ip !== undefined && config.ip !== this.config.ip) ||
      (config.port !== undefined && config.port !== this.config.port)
    );

    this.config = { ...this.config, ...config };

    // Jeśli zmienił się IP/port i byliśmy połączeni — reconnect
    if (connectionChanged && wasConnected) {
      this.disconnect();
      this.connect().catch(err => {
        console.error('[VmixSender] Reconnect po zmianie konfiguracji nieudany:', err);
      });
    }
  }

  /** Zwraca aktualną konfigurację */
  getConfig(): VmixSenderConfig {
    return { ...this.config, inputMap: { ...this.config.inputMap } };
  }

  /** Cleanup */
  destroy(): void {
    this.disconnect();
    this.onCommand = null;
    this.removeAllListeners();
  }

  // ── HTTP transport ──────────────────────────────────────

  /**
   * Wysyła funkcję vMix przez HTTP API.
   * Format: GET /api/?Function=<fn>&Input=<input>&Duration=<ms>
   */
  private async sendFunction(fn: string, input: number, durationMs?: number): Promise<void> {
    let query = `Function=${fn}&Input=${input}`;
    if (durationMs !== undefined && durationMs > 0) {
      query += `&Duration=${durationMs}`;
    }
    await this.sendFunctionRaw(query);
  }

  /** Wysyła surowe zapytanie do vMix API */
  private async sendFunctionRaw(query: string): Promise<void> {
    if (!this._connected) return;

    // Callback dla testów
    const cmd = this.parseCommandFromQuery(query);
    if (this.onCommand) this.onCommand(cmd);

    try {
      await this.httpGet(`/api/?${query}`);
    } catch (err) {
      console.error(`[VmixSender] Błąd wysyłania: /api/?${query}:`, err);
      throw err;
    }

    console.log(`[VmixSender] → ${query}`);
  }

  /** Parsuje query string do obiektu komendy (do callback onCommand) */
  private parseCommandFromQuery(query: string): { type: string; input?: number; duration?: number; function?: string } {
    const params = new URLSearchParams(query);
    const fn = params.get('Function') ?? 'unknown';
    const inputStr = params.get('Input');
    const durationStr = params.get('Duration');
    const valueStr = params.get('Value');

    return {
      type: fn.toLowerCase(),
      function: fn,
      input: inputStr ? parseInt(inputStr, 10) : undefined,
      duration: durationStr ? parseInt(durationStr, 10) : (valueStr ? parseInt(valueStr, 10) : undefined),
    };
  }

  /** Wykonuje HTTP GET do vMix API */
  private httpGet(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: this.config.ip,
        port: this.config.port,
        path,
        method: 'GET',
        timeout: 5000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`vMix HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('vMix HTTP timeout (5s)'));
      });

      req.end();
    });
  }
}
