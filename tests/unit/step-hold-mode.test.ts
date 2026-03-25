import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlaybackEngine } from '../../electron/playback-engine';
import type { ActRepoLike, TimelineCueRepoLike, EngineTimelineFramesState } from '../../electron/playback-engine';
import { MockClock } from '../helpers/mock-clock';

// ── Mocki repozytoriów ────────────────────────────────────

function createMockCueRepo() {
  return { findByRundown: vi.fn().mockReturnValue([]) };
}

function createMockRundownRepo() {
  return { findById: vi.fn().mockReturnValue(undefined) };
}

function createMockActRepo(): ActRepoLike {
  return {
    findById: vi.fn().mockReturnValue({
      id: 'act-001', name: 'Test Act',
      duration_frames: 7500, fps: 25, tc_offset_frames: 0,
    }),
  };
}

function createMockTimelineCueRepo(
  cues: Array<{
    id: string; track_id: string; type: string;
    tc_in_frames: number; tc_out_frames?: number;
    data: Record<string, unknown>;
  }> = [],
): TimelineCueRepoLike {
  return {
    findActiveAtFrame: vi.fn(),
    findByActAndType: vi.fn().mockImplementation((_actId: string, type: string) => {
      return cues.filter(c => c.type === type).sort((a, b) => a.tc_in_frames - b.tc_in_frames);
    }),
    findByAct: vi.fn().mockReturnValue(cues),
  };
}

const visionCues = [
  { id: 'vc-1', track_id: 't1', type: 'vision', tc_in_frames: 0, tc_out_frames: 100, data: { camera_number: 1 } },
  { id: 'vc-2', track_id: 't1', type: 'vision', tc_in_frames: 100, tc_out_frames: 250, data: { camera_number: 2 } },
  { id: 'vc-3', track_id: 't1', type: 'vision', tc_in_frames: 300, tc_out_frames: 500, data: { camera_number: 3 } },
];

// ── Testy ─────────────────────────────────────────────────

describe('PlaybackEngine — Step Mode + Hold Mode (Faza 6)', () => {
  let engine: PlaybackEngine;
  let clock: MockClock;

  beforeEach(() => {
    clock = new MockClock(1_000_000_000_000);
    engine = new PlaybackEngine(createMockCueRepo(), createMockRundownRepo(), clock);
    engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo(visionCues));
    engine.loadAct('act-001');
  });

  afterEach(() => {
    engine.destroy();
  });

  // ── toggleStepMode ────────────────────────────────────

  describe('toggleStepMode', () => {
    it('powinno przełączyć stepMode z false na true', () => {
      engine.toggleStepMode();
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.stepMode).toBe(true);
    });

    it('powinno przełączyć stepMode z powrotem na false', () => {
      engine.toggleStepMode(); // true
      engine.toggleStepMode(); // false
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.stepMode).toBe(false);
    });

    it('powinno zapauzować playback gdy włączany w trakcie grania', () => {
      engine.play();
      expect((engine.getState() as EngineTimelineFramesState).is_playing).toBe(true);

      engine.toggleStepMode();
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.stepMode).toBe(true);
      expect(state.is_playing).toBe(false);
    });

    it('powinno emitować mode-changed i state-changed', () => {
      const modeChanged = vi.fn();
      const stateChanged = vi.fn();
      engine.on('mode-changed', modeChanged);
      engine.on('state-changed', stateChanged);

      engine.toggleStepMode();

      expect(modeChanged).toHaveBeenCalledWith({ stepMode: true, holdMode: false });
      expect(stateChanged).toHaveBeenCalledOnce();
    });
  });

  // ── toggleHoldMode ────────────────────────────────────

  describe('toggleHoldMode', () => {
    it('powinno przełączyć holdMode z false na true', () => {
      engine.toggleHoldMode();
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.holdMode).toBe(true);
    });

    it('powinno przełączyć holdMode z powrotem na false', () => {
      engine.toggleHoldMode(); // true
      engine.toggleHoldMode(); // false
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.holdMode).toBe(false);
    });

    it('powinno emitować mode-changed', () => {
      const modeChanged = vi.fn();
      engine.on('mode-changed', modeChanged);
      engine.toggleHoldMode();
      expect(modeChanged).toHaveBeenCalledWith({ stepMode: false, holdMode: true });
    });
  });

  // ── play() blocked in step mode ───────────────────────

  // Faza 39-A: play() auto-wyłącza stepMode zamiast blokować
  describe('play() auto-disables step mode', () => {
    it('play() w step mode — auto-wyłącza stepMode i startuje', () => {
      engine.toggleStepMode();
      engine.play();
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.stepMode).toBe(false);
      expect(state.is_playing).toBe(true);
    });

    it('play() powinno działać po wyłączeniu step mode', () => {
      engine.toggleStepMode(); // włącz
      engine.toggleStepMode(); // wyłącz
      engine.play();
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.is_playing).toBe(true);
    });
  });

  // ── stepToNextCue ─────────────────────────────────────

  describe('stepToNextCue', () => {
    it('powinno skoczyć do następnego vision cue', () => {
      engine.scrub(50); // wewnątrz vc-1 (0-100)
      engine.stepToNextCue();
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.currentTcFrames).toBe(100); // tc_in vc-2
    });

    it('powinno nic nie robić gdy brak następnego vision cue', () => {
      engine.scrub(400); // wewnątrz vc-3 (300-500), ostatni
      engine.stepToNextCue();
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.currentTcFrames).toBe(400); // bez zmian
    });

    it('powinno wykonac cuey na pozycji docelowej', () => {
      const entered = vi.fn();
      engine.on('cue-entered', entered);

      engine.scrub(50);
      engine.stepToNextCue(); // skacze do 100 = tc_in vc-2

      // Powinno emitować cue-entered dla vc-2
      expect(entered).toHaveBeenCalledWith(expect.objectContaining({ id: 'vc-2' }));
    });

    it('powinno emitować state-changed', () => {
      const stateChanged = vi.fn();
      engine.on('state-changed', stateChanged);
      engine.scrub(50);
      stateChanged.mockClear();

      engine.stepToNextCue();
      expect(stateChanged).toHaveBeenCalledOnce();
    });
  });

  // ── takeNextShot ──────────────────────────────────────

  describe('takeNextShot', () => {
    it('powinno wymusić następny vision cue jako aktywny', () => {
      engine.scrub(50); // wewnątrz vc-1
      engine.takeNextShot();
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.activeVisionCueId).toBe('vc-2');
      expect(state.activeCameraNumber).toBe(2);
    });

    it('powinno ustawić nextVisionCueId na kolejny po wymuszonym', () => {
      engine.scrub(50);
      engine.takeNextShot();
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.nextVisionCueId).toBe('vc-3');
    });

    it('powinno emitować vision-cue-changed', () => {
      const visionChanged = vi.fn();
      engine.on('vision-cue-changed', visionChanged);
      engine.scrub(50);
      visionChanged.mockClear();

      engine.takeNextShot();
      expect(visionChanged).toHaveBeenCalledOnce();
    });
  });

  // ── holdMode blocks vision ────────────────────────────

  describe('holdMode blocks vision cue changes', () => {
    it('powinno zamrozić vision cue w hold mode', () => {
      engine.scrub(50); // vc-1 aktywny
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.activeVisionCueId).toBe('vc-1');

      engine.toggleHoldMode(); // zamroź
      engine.play();
      // Przesuń poza vc-1
      clock.advance(3000); // ~75 klatek → pozycja 125 → w zakresie vc-2, ale HOLD
      engine.tickFrames();

      // Vision cue powinno zostać zamrożone (vc-1 lub niezdefiniowane jeśli recalculate nie zmienia)
      // W hold mode updateVisionCueFromCache zwraca natychmiast — wartość nie zmienia się
      expect(state.activeVisionCueId).toBe('vc-1');
    });
  });

  // ── Rozszerzony timesnap ──────────────────────────────

  describe('rozszerzony timesnap', () => {
    it('powinno zawierać speed, step_mode, hold_mode', () => {
      engine.toggleStepMode();
      engine.toggleHoldMode();
      const snap = engine.buildTimesnap();
      expect(snap).not.toBeNull();
      if (snap && snap.tc_mode === 'timeline_frames') {
        expect(snap.speed).toBe(1.0);
        expect(snap.step_mode).toBe(true);
        expect(snap.hold_mode).toBe(true);
      }
    });

    it('powinno zawierać active_lyric_text', () => {
      // Dodaj lyric cue do cache
      const cueRepo = createMockTimelineCueRepo([
        ...visionCues,
        { id: 'lc-1', track_id: 't2', type: 'lyric', tc_in_frames: 0, tc_out_frames: 100, data: { text: 'Testowy tekst' } },
      ]);
      engine.destroy();
      engine = new PlaybackEngine(createMockCueRepo(), createMockRundownRepo(), clock);
      engine.setTimelineRepos(createMockActRepo(), cueRepo);
      engine.loadAct('act-001');

      const snap = engine.buildTimesnap();
      if (snap && snap.tc_mode === 'timeline_frames') {
        expect(snap.active_lyric_text).toBe('Testowy tekst');
      }
    });
  });
});
