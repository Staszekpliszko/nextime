import type { PlaybackEngine, EngineState, TimesnapPayload, TimesnapRundownMs, TimesnapTimelineFrames } from '../playback-engine';
import type { SenderManager } from '../senders';
import type { StreamDeckManager } from './streamdeck-manager';
import type { StreamDeckPagesConfig } from './streamdeck-pages';
import type { StreamDeckButtonConfig } from './streamdeck-actions';
import {
  renderTextButton,
  renderCountdownButton,
  renderTallyButton,
  renderInfoButton,
  renderNavButton,
  formatMmSs,
  formatHhMmSsFf,
  COLORS,
} from './streamdeck-button-renderer';

// ── Kolory domyślne akcji ───────────────────────────────

/** Domyślne kolory tła per akcja */
const ACTION_COLORS: Record<string, string> = {
  play: '#006600',
  pause: '#665500',
  next: '#224477',
  prev: '#224477',
  goto: '#444444',
  step_next: '#553377',
  take_shot: '#774400',
  hold: '#664400',
  step_mode: '#443366',
  ftb: '#880000',
  cut: '#CC0000',
  auto_transition: '#BB5500',
  dsk: '#225555',
  macro: '#442266',
  media_play: '#005522',
  media_stop: '#552200',
  vol_up: '#224455',
  vol_down: '#224455',
  ptz_preset: '#335544',
  page_nav: '#1e3a5f',
  none: '#111111',
};

/** Kolor "aktywny" — gdy akcja jest w stanie ON */
const ACTIVE_COLORS: Record<string, string> = {
  play: '#00CC00',        // jasny zielony gdy gra
  pause: '#CCAA00',       // jasny żółty gdy zapauzowane
  hold: '#FF8800',        // pomarańczowy gdy hold aktywny
  step_mode: '#9966FF',   // fiolet gdy step mode aktywny
};

// ── StreamDeckFeedback ──────────────────────────────────

/**
 * Aktualizuje obrazy przycisków StreamDecka w real-time
 * na podstawie eventów z PlaybackEngine i statusu senderów.
 */
export class StreamDeckFeedback {
  private engine: PlaybackEngine | null = null;
  private senderManager: SenderManager | null = null;
  private manager: StreamDeckManager | null = null;
  private pagesConfig: StreamDeckPagesConfig | null = null;

  /** Timer do odświeżania (co 250ms) */
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  /** Faza migania dla countdown <10s */
  private blinkPhase = true;
  /** Timer migania (co 500ms) */
  private blinkTimer: ReturnType<typeof setInterval> | null = null;

  /** Ostatni znany timesnap — cache do odświeżania */
  private lastTimesnap: TimesnapPayload | null = null;

  // Listenery — referencje do odłączenia
  private onStateChanged: ((state: EngineState) => void) | null = null;

  /**
   * Podpina feedback do engine, senderów i managera.
   */
  attach(
    engine: PlaybackEngine,
    senderManager: SenderManager,
    manager: StreamDeckManager,
    pagesConfig: StreamDeckPagesConfig,
  ): void {
    this.engine = engine;
    this.senderManager = senderManager;
    this.manager = manager;
    this.pagesConfig = pagesConfig;

    // Nasłuchuj zmian stanu engine
    this.onStateChanged = () => {
      this.lastTimesnap = engine.buildTimesnap();
      this.refreshAllButtons().catch(() => {});
    };
    engine.on('state-changed', this.onStateChanged);

    // Timer odświeżania — co 250ms buduj timesnap i odśwież dynamiczne przyciski
    this.refreshTimer = setInterval(() => {
      if (!this.engine || !this.manager?.isConnected) return;
      this.lastTimesnap = this.engine.buildTimesnap();
      this.refreshDynamicButtons().catch(() => {});
    }, 250);

    // Timer migania — toggle co 500ms
    this.blinkTimer = setInterval(() => {
      this.blinkPhase = !this.blinkPhase;
    }, 500);

    // Początkowe odświeżenie
    this.refreshAllButtons().catch(() => {});

    console.log('[StreamDeckFeedback] Podpięty do engine');
  }

  /**
   * Odłącza feedback.
   */
  detach(): void {
    if (this.engine && this.onStateChanged) {
      this.engine.off('state-changed', this.onStateChanged);
      this.onStateChanged = null;
    }

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.blinkTimer) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = null;
    }

    this.engine = null;
    this.senderManager = null;
    this.manager = null;
    this.pagesConfig = null;
    this.lastTimesnap = null;

    console.log('[StreamDeckFeedback] Odłączony');
  }

  /** Aktualizuje config stron (po zmianie w settings) */
  updatePagesConfig(config: StreamDeckPagesConfig): void {
    this.pagesConfig = config;
    this.refreshAllButtons().catch(() => {});
  }

  /**
   * Pełna aktualizacja wszystkich przycisków aktywnej strony.
   */
  async refreshAllButtons(): Promise<void> {
    if (!this.manager?.isConnected || !this.pagesConfig) return;

    const page = this.pagesConfig.pages[this.pagesConfig.activePage];
    if (!page) return;

    const iconSize = this.manager.iconSize.width;

    for (let i = 0; i < page.buttons.length; i++) {
      const btnConfig = page.buttons[i];
      if (!btnConfig) continue;

      try {
        const buffer = await this.renderButton(btnConfig, iconSize);
        if (buffer) {
          await this.manager.fillKeyBuffer(i, new Uint8Array(buffer), 'rgba');
        } else {
          await this.manager.clearKey(i);
        }
      } catch (err) {
        console.error(`[StreamDeckFeedback] Błąd render key ${i}:`, err);
      }
    }
  }

  /**
   * Odświeża dynamiczne przyciski (co 250ms).
   */
  private async refreshDynamicButtons(): Promise<void> {
    if (!this.manager?.isConnected || !this.pagesConfig) return;

    const page = this.pagesConfig.pages[this.pagesConfig.activePage];
    if (!page) return;

    const iconSize = this.manager.iconSize.width;

    for (let i = 0; i < page.buttons.length; i++) {
      const btnConfig = page.buttons[i];
      if (!btnConfig) continue;

      // Wszystkie przyciski z akcjami są "stanowe" — odświeżaj wszystko
      // bo kolory się zmieniają w zależności od stanu engine
      if (btnConfig.action === 'none' && !btnConfig.label) continue;

      try {
        const buffer = await this.renderButton(btnConfig, iconSize);
        if (buffer) {
          await this.manager.fillKeyBuffer(i, new Uint8Array(buffer), 'rgba');
        }
      } catch {
        // Ignoruj
      }
    }
  }

  // ── Pobieranie stanu ────────────────────────────────

  /** Czy engine gra */
  private get isPlaying(): boolean {
    const state = this.engine?.getState();
    if (!state) return false;
    return state.is_playing;
  }

  /** Czy hold mode aktywny (timeline) */
  private get isHoldActive(): boolean {
    const state = this.engine?.getState();
    if (!state || state.mode !== 'timeline_frames') return false;
    return state.holdMode;
  }

  /** Czy step mode aktywny (timeline) */
  private get isStepModeActive(): boolean {
    const state = this.engine?.getState();
    if (!state || state.mode !== 'timeline_frames') return false;
    return state.stepMode;
  }

  // ── Renderowanie przycisków ─────────────────────────

  /**
   * Renderuje pojedynczy przycisk — zwraca raw RGBA Buffer.
   * Uwzględnia stan engine (Play zielony gdy gra, Hold pomarańczowy itp.)
   */
  private async renderButton(config: StreamDeckButtonConfig, iconSize: number): Promise<Buffer | null> {
    const { action, label, params, bgColor: customBgColor } = config;

    switch (action) {
      // ── Stanowe przyciski sterowania ─────────────────

      case 'play': {
        const active = this.isPlaying;
        const bg = customBgColor ?? (active ? ACTIVE_COLORS['play']! : ACTION_COLORS['play']!);
        const text = active ? '▶ PLAY' : '▶ Play';
        return renderTextButton({ text, bgColor: bg, size: iconSize, subtext: active ? 'AKTYWNY' : '' });
      }

      case 'pause': {
        const active = !this.isPlaying && this.engine?.getState() !== null;
        const bg = customBgColor ?? (active ? ACTIVE_COLORS['pause']! : ACTION_COLORS['pause']!);
        return renderTextButton({ text: '⏸ Pauza', bgColor: bg, size: iconSize, subtext: active ? 'PAUSED' : '' });
      }

      case 'hold': {
        const active = this.isHoldActive;
        const bg = customBgColor ?? (active ? ACTIVE_COLORS['hold']! : ACTION_COLORS['hold']!);
        return renderTextButton({ text: 'HOLD', bgColor: bg, size: iconSize, subtext: active ? 'AKTYWNY' : '' });
      }

      case 'step_mode': {
        const active = this.isStepModeActive;
        const bg = customBgColor ?? (active ? ACTIVE_COLORS['step_mode']! : ACTION_COLORS['step_mode']!);
        return renderTextButton({ text: 'STEP', bgColor: bg, size: iconSize, subtext: active ? 'AKTYWNY' : 'Mode' });
      }

      // ── Przyciski bez stanu ─────────────────────────

      case 'next':
        return renderTextButton({ text: '▶▶', bgColor: customBgColor ?? ACTION_COLORS['next']!, subtext: 'Następny', size: iconSize });

      case 'prev':
        return renderTextButton({ text: '◀◀', bgColor: customBgColor ?? ACTION_COLORS['prev']!, subtext: 'Poprzedni', size: iconSize });

      case 'goto':
        return renderTextButton({ text: 'GOTO', bgColor: customBgColor ?? ACTION_COLORS['goto']!, size: iconSize });

      case 'step_next':
        return renderTextButton({ text: 'STEP', bgColor: customBgColor ?? ACTION_COLORS['step_next']!, subtext: 'Next', size: iconSize });

      case 'take_shot':
        return renderTextButton({ text: 'TAKE', bgColor: customBgColor ?? ACTION_COLORS['take_shot']!, subtext: 'Shot', size: iconSize });

      case 'ftb':
        return renderTextButton({ text: 'FTB', bgColor: customBgColor ?? ACTION_COLORS['ftb']!, size: iconSize });

      // ── Kamery z tally ──────────────────────────────

      case 'cam_pgm': {
        const camNum = Number(params?.['camera'] ?? 1);
        const atemStatus = this.senderManager?.atem.getStatus();
        const pgm = atemStatus?.programInput === camNum;
        const pvw = atemStatus?.previewInput === camNum;
        return renderTallyButton({ cameraNumber: camNum, pgm, pvw, size: iconSize });
      }

      case 'cam_pvw': {
        const camNum = Number(params?.['camera'] ?? 1);
        const atemStatus = this.senderManager?.atem.getStatus();
        const pvw = atemStatus?.previewInput === camNum;
        return renderTallyButton({ cameraNumber: camNum, pgm: false, pvw, size: iconSize });
      }

      // ── Switcher ────────────────────────────────────

      case 'cut':
        return renderTextButton({ text: 'CUT', bgColor: customBgColor ?? ACTION_COLORS['cut']!, size: iconSize });

      case 'auto_transition':
        return renderTextButton({ text: 'AUTO', bgColor: customBgColor ?? ACTION_COLORS['auto_transition']!, size: iconSize });

      case 'dsk':
        return renderTextButton({ text: 'DSK', bgColor: customBgColor ?? ACTION_COLORS['dsk']!, size: iconSize });

      case 'macro':
        return renderTextButton({ text: label || 'Makro', bgColor: customBgColor ?? ACTION_COLORS['macro']!, size: iconSize });

      // ── Media ───────────────────────────────────────

      case 'media_play':
        return renderTextButton({ text: '▶', bgColor: customBgColor ?? ACTION_COLORS['media_play']!, subtext: 'Media', size: iconSize });

      case 'media_stop':
        return renderTextButton({ text: '⏹', bgColor: customBgColor ?? ACTION_COLORS['media_stop']!, subtext: 'Stop', size: iconSize });

      case 'vol_up':
        return renderTextButton({ text: 'VOL +', bgColor: customBgColor ?? ACTION_COLORS['vol_up']!, size: iconSize });

      case 'vol_down':
        return renderTextButton({ text: 'VOL -', bgColor: customBgColor ?? ACTION_COLORS['vol_down']!, size: iconSize });

      case 'ptz_preset':
        return renderTextButton({ text: label || 'PTZ', bgColor: customBgColor ?? ACTION_COLORS['ptz_preset']!, size: iconSize });

      // ── Nawigacja stron ─────────────────────────────

      case 'page_nav':
        return renderNavButton(label || 'Strona', { size: iconSize });

      // ── Info / None ─────────────────────────────────

      case 'none': {
        if (label) {
          return this.renderInfoFromTimesnap(label, iconSize);
        }
        return renderTextButton({ text: '', bgColor: customBgColor ?? '#111111', size: iconSize });
      }

      default:
        return renderTextButton({ text: label || '?', bgColor: customBgColor ?? '#333333', size: iconSize });
    }
  }

  /**
   * Renderuje przycisk informacyjny z danych timesnap.
   */
  private async renderInfoFromTimesnap(label: string, iconSize: number): Promise<Buffer> {
    const ts = this.lastTimesnap;

    if (!ts) {
      return renderInfoButton({ label, value: '---', size: iconSize });
    }

    if (ts.tc_mode === 'rundown_ms') {
      const rundownTs = ts as TimesnapRundownMs;
      const state = this.engine?.getState();
      const currentCue = state && state.mode === 'rundown_ms'
        ? state.cues[state.currentIndex]
        : null;
      const nextIndex = state && state.mode === 'rundown_ms'
        ? state.currentIndex + 1
        : -1;
      const nextCue = state && state.mode === 'rundown_ms' && nextIndex < state.cues.length
        ? state.cues[nextIndex]
        : null;

      switch (label) {
        case 'Aktualny Cue':
          return renderInfoButton({
            label: 'AKTUALNY',
            value: currentCue?.title ?? '---',
            size: iconSize,
          });

        case 'Następny Cue':
          return renderInfoButton({
            label: 'NASTĘPNY',
            value: nextCue?.title ?? '---',
            size: iconSize,
          });

        case 'Remaining': {
          const now = Date.now();
          const remaining = rundownTs.tc.is_playing
            ? rundownTs.tc.deadline_ms - now
            : rundownTs.tc.deadline_ms - rundownTs.tc.last_stop_ms;
          const total = currentCue?.duration_ms ?? 0;
          return renderCountdownButton({
            remainingMs: remaining,
            totalMs: total,
            overtime: remaining < 0,
            blinkPhase: this.blinkPhase,
            size: iconSize,
          });
        }

        case 'Elapsed': {
          const now = Date.now();
          const elapsed = rundownTs.tc.is_playing
            ? now - rundownTs.tc.kickoff_ms
            : rundownTs.tc.last_stop_ms - rundownTs.tc.kickoff_ms;
          return renderInfoButton({
            label: 'ELAPSED',
            value: formatMmSs(elapsed),
            size: iconSize,
          });
        }

        case 'Timecode':
          return renderInfoButton({ label: 'TC', value: '---', size: iconSize });

        case 'Zegar':
          return renderInfoButton({
            label: 'ZEGAR',
            value: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            bgColor: COLORS.DARK_BG,
            size: iconSize,
          });

        default:
          return renderInfoButton({ label, value: '---', size: iconSize });
      }
    }

    // Timeline mode
    const timelineTs = ts as TimesnapTimelineFrames;
    switch (label) {
      case 'Aktualny Cue':
        return renderInfoButton({
          label: 'VISION',
          value: timelineTs.active_cue_id ? `Cue ${timelineTs.active_cue_id.slice(0, 6)}` : '---',
          size: iconSize,
        });

      case 'Timecode':
        return renderInfoButton({
          label: 'TC',
          value: formatHhMmSsFf(timelineTs.tc.current_frames, timelineTs.tc.fps),
          size: iconSize,
        });

      case 'Zegar':
        return renderInfoButton({
          label: 'ZEGAR',
          value: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          bgColor: COLORS.DARK_BG,
          size: iconSize,
        });

      default:
        return renderInfoButton({ label, value: '---', size: iconSize });
    }
  }
}
