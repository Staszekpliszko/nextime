import type { PlaybackEngine } from '../playback-engine';
import type { SenderManager } from '../senders';
import type { SettingsManager } from '../settings-manager';

// ── Typy akcji ──────────────────────────────────────────

export type StreamDeckActionType =
  | 'play'
  | 'pause'
  | 'next'
  | 'prev'
  | 'goto'
  | 'ftb'
  | 'cam_pgm'
  | 'cam_pvw'
  | 'cut'
  | 'auto_transition'
  | 'media_play'
  | 'media_stop'
  | 'vol_up'
  | 'vol_down'
  | 'ptz_preset'
  | 'page_nav'
  | 'step_next'
  | 'take_shot'
  | 'hold'
  | 'step_mode'
  | 'dsk'
  | 'macro'
  | 'none';

export interface StreamDeckButtonConfig {
  action: StreamDeckActionType;
  label: string;
  /** Parametry akcji — np. numer kamery, numer presetu, numer strony */
  params?: Record<string, unknown>;
  /** Kolor tła przycisku (hex) — nadpisuje domyślny kolor akcji */
  bgColor?: string;
}

export interface ActionCatalogEntry {
  type: StreamDeckActionType;
  label: string;
  description: string;
  /** Czy akcja wymaga parametrów */
  hasParams: boolean;
  /** Nazwa parametru (do wyświetlenia w UI) */
  paramLabel?: string;
}

// ── Katalog akcji ───────────────────────────────────────

export const ACTION_CATALOG: ActionCatalogEntry[] = [
  { type: 'play', label: 'Play', description: 'Uruchom odtwarzanie', hasParams: false },
  { type: 'pause', label: 'Pauza', description: 'Zatrzymaj odtwarzanie', hasParams: false },
  { type: 'next', label: 'Następny', description: 'Przejdź do następnego cue', hasParams: false },
  { type: 'prev', label: 'Poprzedni', description: 'Przejdź do poprzedniego cue', hasParams: false },
  { type: 'goto', label: 'Goto', description: 'Skocz do cue po numerze', hasParams: true, paramLabel: 'Numer cue' },
  { type: 'step_next', label: 'Step Next', description: 'Następny krok (step mode)', hasParams: false },
  { type: 'take_shot', label: 'Take Shot', description: 'Weź ujęcie', hasParams: false },
  { type: 'hold', label: 'Hold', description: 'Przytrzymaj vision cue', hasParams: false },
  { type: 'step_mode', label: 'Step Mode', description: 'Przełącz tryb krokowy', hasParams: false },
  { type: 'ftb', label: 'FTB', description: 'Fade to Black', hasParams: false },
  { type: 'cam_pgm', label: 'Kamera PGM', description: 'Kamera na program (LIVE)', hasParams: true, paramLabel: 'Nr kamery' },
  { type: 'cam_pvw', label: 'Kamera PVW', description: 'Kamera na podgląd', hasParams: true, paramLabel: 'Nr kamery' },
  { type: 'cut', label: 'CUT', description: 'Przełącz natychmiast (cut)', hasParams: false },
  { type: 'auto_transition', label: 'AUTO', description: 'Automatyczne przejście', hasParams: false },
  { type: 'dsk', label: 'DSK', description: 'Toggle Downstream Key', hasParams: true, paramLabel: 'Nr DSK' },
  { type: 'macro', label: 'Makro', description: 'Uruchom makro ATEM', hasParams: true, paramLabel: 'Nr makra' },
  { type: 'media_play', label: 'Media Play', description: 'Odtwórz media', hasParams: false },
  { type: 'media_stop', label: 'Media Stop', description: 'Zatrzymaj media', hasParams: false },
  { type: 'vol_up', label: 'Głośność +', description: 'Zwiększ głośność', hasParams: false },
  { type: 'vol_down', label: 'Głośność -', description: 'Zmniejsz głośność', hasParams: false },
  { type: 'ptz_preset', label: 'PTZ Preset', description: 'Przywołaj preset PTZ', hasParams: true, paramLabel: 'Nr presetu' },
  { type: 'page_nav', label: 'Strona', description: 'Przejdź do strony', hasParams: true, paramLabel: 'Nr strony' },
  { type: 'none', label: 'Brak', description: 'Pusty przycisk', hasParams: false },
];

// ── Wykonywanie akcji ───────────────────────────────────

export interface ActionContext {
  engine: PlaybackEngine;
  senderManager: SenderManager;
  settingsManager?: SettingsManager;
  /** Callback do zmiany strony (index) */
  onPageChange?: (pageIndex: number) => void;
}

/** Pobiera aktywny typ switchera z ustawień */
function getTargetSwitcher(context: ActionContext): 'atem' | 'obs' | 'vmix' | 'none' {
  return context.settingsManager?.getSection('vision')?.targetSwitcher ?? 'none';
}

/** Przełącza kamerę na PGM przez aktywny switcher */
function switcherCut(camNum: number, context: ActionContext): void {
  const target = getTargetSwitcher(context);
  const { senderManager } = context;
  switch (target) {
    case 'atem':
      senderManager.atem.performCut(camNum);
      break;
    case 'obs':
      // OBS: numer kamery → nazwa sceny z mapy
      senderManager.obs.setScene(String(camNum)).catch(() => {});
      break;
    case 'vmix':
      senderManager.vmix.cut(camNum).catch(() => {});
      break;
  }
}

/** Ustawia kamerę na PVW przez aktywny switcher */
function switcherPreview(camNum: number, context: ActionContext): void {
  const target = getTargetSwitcher(context);
  const { senderManager } = context;
  switch (target) {
    case 'atem':
      senderManager.atem.setPreview(camNum);
      break;
    case 'obs':
      senderManager.obs.setPreviewScene(String(camNum)).catch(() => {});
      break;
    case 'vmix':
      senderManager.vmix.setPreview(camNum).catch(() => {});
      break;
  }
}

/** Wykonuje CUT (PVW → PGM) przez aktywny switcher */
function switcherPerformCut(context: ActionContext): void {
  const target = getTargetSwitcher(context);
  const { senderManager } = context;
  switch (target) {
    case 'atem': {
      const status = senderManager.atem.getStatus();
      if (status.connected && status.previewInput !== null) {
        senderManager.atem.performCut(status.previewInput);
      }
      break;
    }
    case 'vmix':
      // vMix CUT: przełącz PVW na PGM
      senderManager.vmix.cut(0).catch(() => {});
      break;
    case 'obs':
      senderManager.obs.triggerTransition().catch(() => {});
      break;
  }
}

/** Wykonuje AUTO transition przez aktywny switcher */
function switcherPerformAuto(context: ActionContext): void {
  const target = getTargetSwitcher(context);
  const { senderManager } = context;
  switch (target) {
    case 'atem': {
      const status = senderManager.atem.getStatus();
      if (status.connected && status.previewInput !== null) {
        senderManager.atem.performMix(status.previewInput, 25);
      }
      break;
    }
    case 'vmix':
      senderManager.vmix.fade(0, 1000).catch(() => {});
      break;
    case 'obs':
      senderManager.obs.triggerTransition(undefined, 1000).catch(() => {});
      break;
  }
}

/**
 * Wykonuje akcję StreamDecka — dispatching do engine/senderów.
 */
export function executeAction(
  config: StreamDeckButtonConfig,
  context: ActionContext,
): void {
  const { engine, senderManager, onPageChange } = context;
  const params = config.params ?? {};

  console.log(`[StreamDeck] Akcja: ${config.action} (label: "${config.label}", params: ${JSON.stringify(config.params ?? {})})`);

  try {
    switch (config.action) {
      case 'play': {
        console.log('[StreamDeck] → engine.play() + switcher resume');
        engine.play();
        // Wyślij Play do aktywnego switchera (vMix/OBS)
        const playTarget = getTargetSwitcher(context);
        if (playTarget === 'vmix') {
          senderManager.vmix.resumePlayback().catch(e => console.error('[StreamDeck] vMix resume:', e));
        }
        break;
      }

      case 'pause': {
        console.log('[StreamDeck] → engine.pause() + switcher pause');
        engine.pause();
        // Wyślij Pause do aktywnego switchera (vMix/OBS)
        const pauseTarget = getTargetSwitcher(context);
        if (pauseTarget === 'vmix') {
          senderManager.vmix.pausePlayback().catch(e => console.error('[StreamDeck] vMix pause:', e));
        }
        break;
      }

      case 'next': {
        console.log('[StreamDeck] → engine.next() + switcher next');
        engine.next();
        // Wyślij Next do aktywnego switchera
        const nextTarget = getTargetSwitcher(context);
        if (nextTarget === 'vmix') {
          senderManager.vmix.nextInput().catch(e => console.error('[StreamDeck] vMix next:', e));
        }
        break;
      }

      case 'prev': {
        console.log('[StreamDeck] → engine.prev() + switcher prev');
        engine.prev();
        // Wyślij Prev do aktywnego switchera
        const prevTarget = getTargetSwitcher(context);
        if (prevTarget === 'vmix') {
          senderManager.vmix.prevInput().catch(e => console.error('[StreamDeck] vMix prev:', e));
        }
        break;
      }

      case 'goto': {
        const cueId = String(params['cueId'] ?? '');
        if (cueId) {
          engine.goto(cueId);
        }
        break;
      }

      case 'step_next':
        engine.stepToNextCue();
        break;

      case 'take_shot':
        engine.takeNextShot();
        break;

      case 'hold':
        engine.toggleHoldMode();
        break;

      case 'step_mode':
        engine.toggleStepMode();
        break;

      case 'ftb': {
        // FTB: przełącz na czarny (input 0) przez aktywny switcher
        switcherCut(0, context);
        break;
      }

      case 'cam_pgm': {
        const camNum = Number(params['camera'] ?? 1);
        // Routuje przez aktywny switcher (ATEM/OBS/vMix)
        switcherCut(camNum, context);
        break;
      }

      case 'cam_pvw': {
        const camNum = Number(params['camera'] ?? 1);
        switcherPreview(camNum, context);
        break;
      }

      case 'cut': {
        // CUT (PVW → PGM) przez aktywny switcher
        switcherPerformCut(context);
        break;
      }

      case 'auto_transition': {
        // AUTO transition przez aktywny switcher
        switcherPerformAuto(context);
        break;
      }

      case 'dsk': {
        const dskIndex = Number(params['index'] ?? 0);
        // Toggle DSK — sprawdź aktualny stan i przełącz
        senderManager.atem.setDownstreamKey(dskIndex, true);
        break;
      }

      case 'macro': {
        const macroIndex = Number(params['index'] ?? 0);
        senderManager.atem.runMacro(macroIndex);
        break;
      }

      case 'media_play':
        // Trigger media play via engine
        engine.emit('media-play-request');
        break;

      case 'media_stop':
        engine.emit('media-stop-request');
        break;

      case 'vol_up':
        engine.emit('media-volume-change', 10);
        break;

      case 'vol_down':
        engine.emit('media-volume-change', -10);
        break;

      case 'ptz_preset': {
        const camNum = Number(params['camera'] ?? 1);
        const presetNr = Number(params['preset'] ?? 1);
        senderManager.ptz.recallPreset(camNum, presetNr).catch(err => {
          console.error('[StreamDeck] Błąd PTZ recall:', err);
        });
        break;
      }

      case 'page_nav': {
        const pageIndex = Number(params['page'] ?? 0);
        if (onPageChange) {
          onPageChange(pageIndex);
        }
        break;
      }

      case 'none':
        // Nic nie rób
        break;

      default:
        console.warn(`[StreamDeck] Nieznana akcja: ${config.action}`);
    }
  } catch (err) {
    console.error(`[StreamDeck] Błąd wykonania akcji ${config.action}:`, err);
  }
}
