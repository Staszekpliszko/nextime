import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlaybackEngine } from '../../electron/playback-engine';
import type { ActRepoLike, TimelineCueRepoLike } from '../../electron/playback-engine';
import { MockClock } from '../helpers/mock-clock';

// ── Mocki repozytoriów ────────────────────────────────────

function createMockCueRepo() {
  return { findByRundown: vi.fn().mockReturnValue([]) };
}

function createMockRundownRepo() {
  return { findById: vi.fn().mockReturnValue(undefined) };
}

function defaultAct() {
  return {
    id: 'act-001',
    name: 'Test Act',
    duration_frames: 7500,
    fps: 25,
    tc_offset_frames: 0,
  };
}

function createMockActRepo(): ActRepoLike {
  return {
    findById: vi.fn().mockReturnValue(defaultAct()),
  };
}

function createMockTimelineCueRepo(cues: Array<{
  id: string;
  tc_in_frames: number;
  tc_out_frames?: number;
  data: Record<string, unknown>;
  type?: string;
}> = []): TimelineCueRepoLike {
  return {
    findActiveAtFrame: vi.fn().mockImplementation((_actId: string, type: string, frame: number) => {
      return cues.find(c =>
        (c.type ?? 'vision') === type &&
        c.tc_in_frames <= frame &&
        (c.tc_out_frames === undefined ? c.tc_in_frames === frame : c.tc_out_frames > frame)
      );
    }),
    findByActAndType: vi.fn().mockImplementation((_actId: string, type: string) => {
      return cues.filter(c => (c.type ?? 'vision') === type)
        .sort((a, b) => a.tc_in_frames - b.tc_in_frames);
    }),
    findByAct: vi.fn().mockReturnValue(
      cues.map(c => ({ ...c, track_id: 't1', type: c.type ?? 'vision' })),
    ),
  };
}

// ── Testy Faza 39-A: play() auto-wyłącza stepMode ────────

describe('Faza 39-A: play() automatycznie wyłącza stepMode', () => {
  let engine: PlaybackEngine;
  let clock: MockClock;

  beforeEach(() => {
    clock = new MockClock(1_000_000_000_000);
    engine = new PlaybackEngine(
      createMockCueRepo(),
      createMockRundownRepo(),
      clock,
    );
    engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
    engine.loadAct('act-001');
  });

  afterEach(() => engine.destroy());

  it('play() po włączeniu stepMode — auto-wyłącza stepMode i startuje', () => {
    engine.toggleStepMode();
    const stateBefore = engine.getState();
    expect(stateBefore?.mode === 'timeline_frames' && stateBefore.stepMode).toBe(true);

    engine.play();
    const stateAfter = engine.getState();
    expect(stateAfter?.mode === 'timeline_frames' && stateAfter.stepMode).toBe(false);
    expect(stateAfter?.mode === 'timeline_frames' && stateAfter.is_playing).toBe(true);
  });

  it('play() emituje mode-changed przy wyłączaniu stepMode', () => {
    engine.toggleStepMode();
    const listener = vi.fn();
    engine.on('mode-changed', listener);

    engine.play();
    expect(listener).toHaveBeenCalledWith({ stepMode: false, holdMode: false });
  });

  it('play() bez stepMode — normalne uruchomienie', () => {
    engine.play();
    const state = engine.getState();
    expect(state?.mode === 'timeline_frames' && state.is_playing).toBe(true);
  });
});

// ── Testy Faza 39-B: stepToPrevCue ────────────────────────

describe('Faza 39-B: stepToPrevCue()', () => {
  let engine: PlaybackEngine;
  let clock: MockClock;

  const visionCues = [
    { id: 'v1', tc_in_frames: 100, tc_out_frames: 200, data: { camera_number: 1 } },
    { id: 'v2', tc_in_frames: 300, tc_out_frames: 400, data: { camera_number: 2 } },
    { id: 'v3', tc_in_frames: 500, tc_out_frames: 600, data: { camera_number: 3 } },
  ];

  beforeEach(() => {
    clock = new MockClock(1_000_000_000_000);
    engine = new PlaybackEngine(
      createMockCueRepo(),
      createMockRundownRepo(),
      clock,
    );
    engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo(visionCues));
    engine.loadAct('act-001');
  });

  afterEach(() => engine.destroy());

  it('skacze do poprzedniego vision cue', () => {
    // Ustaw pozycję na klatkę 350 (w środku v2)
    engine.scrub(350);
    engine.stepToPrevCue();
    const state = engine.getState();
    // Powinien skoczyć do v2 (tc_in=300) bo 300 < 350
    expect(state?.mode === 'timeline_frames' && state.currentTcFrames).toBe(300);
  });

  it('skacze do v1 gdy pozycja jest na v2.tc_in', () => {
    engine.scrub(300);
    engine.stepToPrevCue();
    const state = engine.getState();
    expect(state?.mode === 'timeline_frames' && state.currentTcFrames).toBe(100);
  });

  it('nie robi nic gdy już na pierwszym cue', () => {
    engine.scrub(100);
    engine.stepToPrevCue();
    const state = engine.getState();
    // Powinien zostać na 100 — brak cue przed 100
    expect(state?.mode === 'timeline_frames' && state.currentTcFrames).toBe(100);
  });

  it('emituje state-changed po skoku', () => {
    engine.scrub(500);
    const listener = vi.fn();
    engine.on('state-changed', listener);
    engine.stepToPrevCue();
    expect(listener).toHaveBeenCalled();
  });

  it('nie robi nic w trybie rundown', () => {
    const rundownEngine = new PlaybackEngine(
      { findByRundown: vi.fn().mockReturnValue([{ id: 'c1', title: 'Cue 1', subtitle: '', duration_ms: 5000, sort_order: 0, start_type: 'soft', auto_start: false, locked: false, status: 'ready' }]) },
      { findById: vi.fn().mockReturnValue({ id: 'r1', name: 'Rundown' }) },
      clock,
    );
    rundownEngine.loadRundown('r1');
    // stepToPrevCue nie powinno nic robić w rundown mode
    rundownEngine.stepToPrevCue();
    const state = rundownEngine.getState();
    expect(state?.mode).toBe('rundown_ms');
    rundownEngine.destroy();
  });
});
