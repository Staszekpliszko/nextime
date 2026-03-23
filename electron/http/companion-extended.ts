import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PlaybackEngine, EngineRundownMsState, EngineTimelineFramesState } from '../playback-engine';
import type { SenderManager } from '../senders';

// ── Typ odpowiedzi ────────────────────────────────────────

interface CompanionExtendedResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

// ── Interfejs zależności (dependency injection) ────────────

export interface CompanionExtendedDeps {
  engine: PlaybackEngine;
  /** SenderManager — opcjonalny, bo w testach może nie być senderów */
  senderManager?: SenderManager | null;
}

// ── Factory ───────────────────────────────────────────────

/**
 * Tworzy Express Router z rozszerzonymi endpointami Companion/StreamDeck.
 *
 * 11 endpointów GET zgodnych z docs/braki.md (sekcja "StreamDeck / Companion — plan"):
 * - Rundown: goto, state, cues, speed
 * - Act (timeline): step_next, take_shot, hold_toggle, step_toggle
 * - ATEM: cut, preview
 * - PTZ: recall preset
 */
export function createCompanionExtendedRouter(deps: CompanionExtendedDeps): Router {
  const router = Router();
  const { engine, senderManager } = deps;

  // ── Helpery ──────────────────────────────────────────

  /** Bezpieczna odpowiedź JSON */
  function jsonOk(res: Response, data?: unknown): void {
    const body: CompanionExtendedResponse = { ok: true };
    if (data !== undefined) body.data = data;
    res.json(body);
  }

  function jsonError(res: Response, status: number, error: string): void {
    const body: CompanionExtendedResponse = { ok: false, error };
    res.status(status).json(body);
  }

  /** Walidacja: rundown musi być załadowany i ID musi się zgadzać */
  function validateRundown(req: Request, res: Response): EngineRundownMsState | null {
    const state = engine.getState();
    if (!state || state.mode !== 'rundown_ms') {
      jsonError(res, 404, 'Rundown nie jest załadowany');
      return null;
    }
    if (state.rundownId !== req.params.id) {
      jsonError(res, 404, 'Rundown ID nie pasuje do załadowanego');
      return null;
    }
    return state;
  }

  /** Walidacja: act/timeline musi być załadowany i ID musi się zgadzać */
  function validateAct(req: Request, res: Response): EngineTimelineFramesState | null {
    const state = engine.getState();
    if (!state || state.mode !== 'timeline_frames') {
      jsonError(res, 404, 'Act/timeline nie jest załadowany');
      return null;
    }
    if (state.actId !== req.params.id) {
      jsonError(res, 404, 'Act ID nie pasuje do załadowanego');
      return null;
    }
    return state;
  }

  /** Bezpieczne pobranie parametru route jako string */
  function getParam(req: Request, name: string): string {
    const val = req.params[name];
    if (typeof val !== 'string') return '';
    return val;
  }

  /** Parsuje parametr jako liczbę całkowitą, zwraca null jeśli niepoprawny */
  function parseIntParam(value: string): number | null {
    const n = parseInt(value, 10);
    if (isNaN(n)) return null;
    return n;
  }

  // ── 1. Goto cue ──────────────────────────────────────

  router.get('/api/rundown/:id/goto/:cueId', (req: Request, res: Response) => {
    const state = validateRundown(req, res);
    if (!state) return;

    const cueId = getParam(req, 'cueId');
    if (!cueId) {
      jsonError(res, 400, 'Brak cueId');
      return;
    }

    // Sprawdź czy cue istnieje w rundownie
    const cueExists = state.cues.some(c => c.id === cueId);
    if (!cueExists) {
      jsonError(res, 400, `Cue ${cueId} nie istnieje w rundownie`);
      return;
    }

    try {
      engine.goto(cueId);
      jsonOk(res, { current_cue_id: cueId });
    } catch (err) {
      jsonError(res, 500, err instanceof Error ? err.message : 'Nieznany błąd');
    }
  });

  // ── 2. State — pełny stan rundownu ───────────────────

  router.get('/api/rundown/:id/state', (req: Request, res: Response) => {
    const state = validateRundown(req, res);
    if (!state) return;

    const now = Date.now();
    const currentCue = state.currentIndex >= 0 && state.currentIndex < state.cues.length
      ? state.cues[state.currentIndex]
      : null;

    // Oblicz remaining i elapsed
    let remaining_ms = 0;
    let elapsed_ms = 0;

    if (currentCue) {
      if (state.is_playing) {
        elapsed_ms = now - state.kickoff_epoch_ms;
        remaining_ms = state.deadline_epoch_ms - now;
      } else {
        elapsed_ms = state.last_stop_epoch_ms - state.kickoff_epoch_ms;
        remaining_ms = state.deadline_epoch_ms - state.last_stop_epoch_ms;
      }
    }

    const over_under_ms = currentCue ? elapsed_ms - currentCue.duration_ms : 0;

    // Następny cue
    const nextCue = state.currentIndex < state.cues.length - 1
      ? state.cues[state.currentIndex + 1]
      : null;

    jsonOk(res, {
      rundown_id: state.rundownId,
      is_playing: state.is_playing,
      current_cue: currentCue ? {
        id: currentCue.id,
        title: currentCue.title,
        subtitle: currentCue.subtitle,
        index: state.currentIndex,
        duration_ms: currentCue.duration_ms,
        status: currentCue.status,
      } : null,
      next_cue: nextCue ? {
        id: nextCue.id,
        title: nextCue.title,
      } : null,
      remaining_ms: Math.round(remaining_ms),
      elapsed_ms: Math.round(elapsed_ms),
      over_under_ms: Math.round(over_under_ms),
      total_cues: state.cues.length,
    });
  });

  // ── 3. Cues — lista cue'ów ──────────────────────────

  router.get('/api/rundown/:id/cues', (req: Request, res: Response) => {
    const state = validateRundown(req, res);
    if (!state) return;

    const cues = state.cues.map((c, i) => ({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      duration_ms: c.duration_ms,
      status: c.status,
      sort_order: c.sort_order,
      is_current: i === state.currentIndex,
    }));

    jsonOk(res, { cues });
  });

  // ── 4. Speed — zmiana prędkości playback ─────────────

  router.get('/api/rundown/:id/speed/:value', (req: Request, res: Response) => {
    // Speed działa tylko w trybie timeline — ale endpoint jest pod /rundown dla kompatybilności
    // Walidacja: rundown musi być załadowany (sprawdzamy tylko ID)
    const engineState = engine.getState();
    if (!engineState) {
      jsonError(res, 404, 'Brak załadowanego stanu');
      return;
    }

    const speed = parseFloat(getParam(req, 'value'));
    if (isNaN(speed) || speed < 0.1 || speed > 10.0) {
      jsonError(res, 400, 'Niepoprawna wartość speed (zakres: 0.1–10.0)');
      return;
    }

    try {
      engine.setSpeed(speed);
      jsonOk(res, { speed });
    } catch (err) {
      jsonError(res, 400, err instanceof Error ? err.message : 'Nieznany błąd');
    }
  });

  // ── 5. Step next — następny vision cue ───────────────

  router.get('/api/act/:id/step_next', (req: Request, res: Response) => {
    const state = validateAct(req, res);
    if (!state) return;

    try {
      engine.stepToNextCue();
      jsonOk(res);
    } catch (err) {
      jsonError(res, 500, err instanceof Error ? err.message : 'Nieznany błąd');
    }
  });

  // ── 6. Take shot — force next vision cue ─────────────

  router.get('/api/act/:id/take_shot', (req: Request, res: Response) => {
    const state = validateAct(req, res);
    if (!state) return;

    try {
      engine.takeNextShot();
      jsonOk(res);
    } catch (err) {
      jsonError(res, 500, err instanceof Error ? err.message : 'Nieznany błąd');
    }
  });

  // ── 7. Hold toggle ──────────────────────────────────

  router.get('/api/act/:id/hold_toggle', (req: Request, res: Response) => {
    const state = validateAct(req, res);
    if (!state) return;

    try {
      engine.toggleHoldMode();
      const newState = engine.getState() as EngineTimelineFramesState;
      jsonOk(res, { hold_mode: newState.holdMode });
    } catch (err) {
      jsonError(res, 500, err instanceof Error ? err.message : 'Nieznany błąd');
    }
  });

  // ── 8. Step toggle ──────────────────────────────────

  router.get('/api/act/:id/step_toggle', (req: Request, res: Response) => {
    const state = validateAct(req, res);
    if (!state) return;

    try {
      engine.toggleStepMode();
      const newState = engine.getState() as EngineTimelineFramesState;
      jsonOk(res, { step_mode: newState.stepMode });
    } catch (err) {
      jsonError(res, 500, err instanceof Error ? err.message : 'Nieznany błąd');
    }
  });

  // ── 9. ATEM CUT ─────────────────────────────────────

  router.get('/api/atem/cut/:input', (req: Request, res: Response) => {
    const input = parseIntParam(getParam(req, 'input'));
    if (input === null || input < 0) {
      jsonError(res, 400, 'Niepoprawny numer inputu ATEM (wymagana liczba >= 0)');
      return;
    }

    if (!senderManager) {
      jsonError(res, 503, 'SenderManager niedostępny');
      return;
    }

    try {
      senderManager.atem.performCut(input);
      jsonOk(res, { action: 'cut', input });
    } catch (err) {
      jsonError(res, 500, err instanceof Error ? err.message : 'Nieznany błąd');
    }
  });

  // ── 10. ATEM PREVIEW ────────────────────────────────

  router.get('/api/atem/preview/:input', (req: Request, res: Response) => {
    const input = parseIntParam(getParam(req, 'input'));
    if (input === null || input < 0) {
      jsonError(res, 400, 'Niepoprawny numer inputu ATEM (wymagana liczba >= 0)');
      return;
    }

    if (!senderManager) {
      jsonError(res, 503, 'SenderManager niedostępny');
      return;
    }

    try {
      senderManager.atem.setPreview(input);
      jsonOk(res, { action: 'preview', input });
    } catch (err) {
      jsonError(res, 500, err instanceof Error ? err.message : 'Nieznany błąd');
    }
  });

  // ── 11. PTZ Recall Preset ───────────────────────────

  router.get('/api/ptz/:camera/preset/:nr', (req: Request, res: Response) => {
    const camera = parseIntParam(getParam(req, 'camera'));
    const nr = parseIntParam(getParam(req, 'nr'));

    if (camera === null || camera < 1 || camera > 16) {
      jsonError(res, 400, 'Niepoprawny numer kamery (zakres: 1–16)');
      return;
    }
    if (nr === null || nr < 0) {
      jsonError(res, 400, 'Niepoprawny numer presetu (wymagana liczba >= 0)');
      return;
    }

    if (!senderManager) {
      jsonError(res, 503, 'SenderManager niedostępny');
      return;
    }

    try {
      // recallPreset jest async ale nie czekamy na wynik — fire and forget
      void senderManager.ptz.recallPreset(camera, nr);
      jsonOk(res, { action: 'recall_preset', camera, preset: nr });
    } catch (err) {
      jsonError(res, 500, err instanceof Error ? err.message : 'Nieznany błąd');
    }
  });

  return router;
}
