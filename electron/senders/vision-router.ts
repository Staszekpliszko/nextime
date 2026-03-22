import { EventEmitter } from 'events';
import type { AtemSender } from './atem-sender';
import type { ObsSender } from './obs-sender';
import type { VmixSender } from './vmix-sender';

// ── Typy ────────────────────────────────────────────────

/** Aktywny switcher wizji */
export type TargetSwitcher = 'atem' | 'obs' | 'vmix' | 'none';

/** Znormalizowany typ przejścia — wspólny dla wszystkich switcherów */
export type VisionTransitionType = 'Cut' | 'Fade' | 'Merge' | 'Wipe' | 'Zoom' | 'Stinger1' | 'Stinger2';

/** Konfiguracja VisionRouter */
export interface VisionRouterConfig {
  targetSwitcher: TargetSwitcher;
}

/** Dane vision cue z polami transition (opcjonalne — fallback na domyślne) */
interface VisionCuePayload {
  camera_number?: number;
  shot_name?: string;
  color?: string;
  transition_type?: VisionTransitionType;
  transition_duration_ms?: number;
}

// ── VisionRouter ──────────────────────────────────────────

/**
 * Centralny router vision cue → aktywny switcher.
 *
 * Nasłuchuje na 'vision-cue-changed' z PlaybackEngine i kieruje
 * komendy do odpowiedniego sendera (ATEM/OBS/vMix) z prawidłowym
 * typem przejścia i czasem trwania.
 *
 * Sendery NIE nasłuchują bezpośrednio na vision-cue-changed —
 * VisionRouter jest jedynym punktem routingu.
 */
export class VisionRouter {
  private config: VisionRouterConfig;
  private _atem: AtemSender | null = null;
  private _obs: ObsSender | null = null;
  private _vmix: VmixSender | null = null;
  private _engine: EventEmitter | null = null;
  private _boundHandler: ((activeCue: { data: Record<string, unknown> } | null, nextCue: unknown) => void) | null = null;

  /** Callback do przechwytywania komend routingu (testy) */
  onRoute: ((info: { target: TargetSwitcher; cameraNumber: number; transitionType: VisionTransitionType; durationMs: number }) => void) | null = null;

  constructor(config: Partial<VisionRouterConfig> = {}) {
    this.config = {
      targetSwitcher: config.targetSwitcher ?? 'none',
    };
  }

  /** Ustawia referencje do senderów */
  setSenders(senders: { atem?: AtemSender; obs?: ObsSender; vmix?: VmixSender }): void {
    this._atem = senders.atem ?? null;
    this._obs = senders.obs ?? null;
    this._vmix = senders.vmix ?? null;
  }

  /** Podpina się do engine — nasłuchuje 'vision-cue-changed' */
  attach(engine: EventEmitter): void {
    this._engine = engine;
    this._boundHandler = (activeCue, _nextCue) => {
      this.handleVisionCueChanged(activeCue);
    };
    engine.on('vision-cue-changed', this._boundHandler);
    console.log(`[VisionRouter] Podpięty do engine (target: ${this.config.targetSwitcher})`);
  }

  /** Obsługuje zmianę vision cue — routing do aktywnego switchera */
  handleVisionCueChanged(activeCue: { data: Record<string, unknown> } | null): void {
    if (this.config.targetSwitcher === 'none') return;
    if (!activeCue) return;

    const data = activeCue.data as Partial<VisionCuePayload>;
    const cameraNumber = data.camera_number;
    if (cameraNumber === undefined || cameraNumber === null) return;

    // Odczytaj transition z danych cue (lub fallback na domyślne sendera)
    const transitionType = data.transition_type ?? this.getDefaultTransitionType();
    const durationMs = data.transition_duration_ms ?? this.getDefaultDurationMs();

    // Callback dla testów
    if (this.onRoute) {
      this.onRoute({ target: this.config.targetSwitcher, cameraNumber, transitionType, durationMs });
    }

    // Routing do odpowiedniego sendera
    switch (this.config.targetSwitcher) {
      case 'atem':
        this.routeToAtem(cameraNumber, transitionType, durationMs);
        break;
      case 'obs':
        this.routeToObs(cameraNumber, transitionType, durationMs);
        break;
      case 'vmix':
        this.routeToVmix(cameraNumber, transitionType, durationMs);
        break;
    }
  }

  /** Routing do ATEM — CUT lub MIX */
  private routeToAtem(cameraNumber: number, transitionType: VisionTransitionType, durationMs: number): void {
    if (!this._atem) return;

    const status = this._atem.getStatus();
    if (!status.connected || !status.autoSwitch) return;

    // ATEM obsługuje tylko Cut i Mix — reszta → fallback na Mix
    const input = cameraNumber;
    if (input === status.programInput) return; // już na PGM

    if (transitionType === 'Cut') {
      this._atem.performCut(input);
    } else {
      // Wszystkie inne typy → Mix z duration w klatkach (ms → frames @ 25fps)
      const frames = durationMs > 0 ? Math.round(durationMs / 40) : this._atem.getConfig().mixDurationFrames;
      this._atem.performMix(input, frames);
    }
  }

  /** Routing do OBS — setScene + triggerTransition */
  private routeToObs(cameraNumber: number, transitionType: VisionTransitionType, durationMs: number): void {
    if (!this._obs) return;

    const status = this._obs.getStatus();
    if (!status.connected || !this._obs.getConfig().autoSwitch) return;

    // Mapuj camera_number → scena OBS
    const sceneMap = this._obs.getConfig().sceneMap;
    const sceneName = sceneMap[cameraNumber];
    if (!sceneName) {
      console.log(`[VisionRouter] OBS: brak mappingu dla kamery ${cameraNumber}`);
      return;
    }

    if (sceneName === status.currentScene) return; // już na tej scenie

    // Mapowanie typów przejścia na OBS
    const obsTransition = this.mapTransitionToObs(transitionType);

    if (status.studioMode) {
      // Studio Mode: preview → transition
      this._obs.setPreviewScene(sceneName)
        .then(() => this._obs!.triggerTransition(obsTransition, durationMs > 0 ? durationMs : undefined))
        .catch(err => console.error('[VisionRouter] OBS transition error:', err));
    } else {
      // Zwykły tryb: bezpośrednia zmiana sceny
      this._obs.setScene(sceneName)
        .catch(err => console.error('[VisionRouter] OBS setScene error:', err));
    }
  }

  /** Routing do vMix — executeTransition */
  private routeToVmix(cameraNumber: number, transitionType: VisionTransitionType, durationMs: number): void {
    if (!this._vmix) return;

    const status = this._vmix.getStatus();
    if (!status.connected || !this._vmix.getConfig().autoSwitch) return;

    // Mapuj camera_number → input vMix
    const inputMap = this._vmix.getConfig().inputMap;
    const vmixInput = inputMap[cameraNumber];
    if (vmixInput === undefined) {
      console.log(`[VisionRouter] vMix: brak mappingu dla kamery ${cameraNumber}`);
      return;
    }

    // Wykonaj przejście odpowiedniego typu
    this.executeVmixTransition(vmixInput, transitionType, durationMs)
      .catch(err => console.error('[VisionRouter] vMix transition error:', err));
  }

  /** Wykonuje przejście vMix odpowiedniego typu */
  private async executeVmixTransition(input: number, type: VisionTransitionType, durationMs: number): Promise<void> {
    if (!this._vmix) return;

    switch (type) {
      case 'Cut':
        await this._vmix.cut(input);
        break;
      case 'Fade':
        await this._vmix.fade(input, durationMs);
        break;
      case 'Merge':
        await this._vmix.merge(input, durationMs);
        break;
      case 'Wipe':
        await this._vmix.wipe(input, durationMs);
        break;
      case 'Zoom':
        await this._vmix.zoom(input, durationMs);
        break;
      case 'Stinger1':
        await this._vmix.stinger(input, 1);
        break;
      case 'Stinger2':
        await this._vmix.stinger(input, 2);
        break;
    }
  }

  /** Mapuje VisionTransitionType na nazwę OBS transition */
  private mapTransitionToObs(type: VisionTransitionType): string {
    switch (type) {
      case 'Cut': return 'Cut';
      case 'Fade': return 'Fade';
      case 'Wipe': return 'Luma_Wipe';
      case 'Stinger1':
      case 'Stinger2': return 'Stinger';
      // OBS nie ma Merge/Zoom — fallback na Fade
      case 'Merge':
      case 'Zoom':
      default: return 'Fade';
    }
  }

  /** Domyślny typ przejścia sendera */
  private getDefaultTransitionType(): VisionTransitionType {
    switch (this.config.targetSwitcher) {
      case 'atem':
        if (this._atem) {
          return this._atem.getConfig().transitionType === 'mix' ? 'Fade' : 'Cut';
        }
        return 'Cut';
      case 'vmix':
        if (this._vmix) {
          return this._vmix.getConfig().transitionType;
        }
        return 'Cut';
      case 'obs':
      default:
        return 'Cut';
    }
  }

  /** Domyślny czas trwania przejścia sendera (ms) */
  private getDefaultDurationMs(): number {
    switch (this.config.targetSwitcher) {
      case 'atem':
        if (this._atem) {
          return this._atem.getConfig().mixDurationFrames * 40; // frames → ms @ 25fps
        }
        return 0;
      case 'vmix':
        if (this._vmix) {
          return this._vmix.getConfig().transitionDuration;
        }
        return 0;
      case 'obs':
      default:
        return 0;
    }
  }

  /** Aktualizuje konfigurację */
  updateConfig(config: Partial<VisionRouterConfig>): void {
    if (config.targetSwitcher !== undefined) {
      this.config.targetSwitcher = config.targetSwitcher;
      console.log(`[VisionRouter] Aktywny switcher: ${this.config.targetSwitcher}`);
    }
  }

  /** Zwraca aktualną konfigurację */
  getConfig(): VisionRouterConfig {
    return { ...this.config };
  }

  /** Cleanup */
  destroy(): void {
    if (this._engine && this._boundHandler) {
      this._engine.removeListener('vision-cue-changed', this._boundHandler);
    }
    this._engine = null;
    this._boundHandler = null;
    this._atem = null;
    this._obs = null;
    this._vmix = null;
    this.onRoute = null;
  }
}
