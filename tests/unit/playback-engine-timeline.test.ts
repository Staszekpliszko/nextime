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

function createMockActRepo(overrides: Partial<ReturnType<typeof defaultAct>> = {}): ActRepoLike {
  return {
    findById: vi.fn().mockReturnValue({ ...defaultAct(), ...overrides }),
  };
}

function defaultAct() {
  return {
    id: 'act-001',
    name: 'Test Act',
    duration_frames: 7500, // 5 minut @ 25fps
    fps: 25,
    tc_offset_frames: 0,
  };
}

function createMockTimelineCueRepo(visionCues: Array<{
  id: string;
  tc_in_frames: number;
  tc_out_frames?: number;
  data: Record<string, unknown>;
}> = []): TimelineCueRepoLike {
  return {
    findActiveAtFrame: vi.fn().mockImplementation((_actId: string, type: string, frame: number) => {
      if (type !== 'vision') return undefined;
      return visionCues.find(c =>
        c.tc_in_frames <= frame &&
        (c.tc_out_frames === undefined ? c.tc_in_frames === frame : c.tc_out_frames > frame)
      );
    }),
    findByActAndType: vi.fn().mockImplementation((_actId: string, type: string) => {
      if (type !== 'vision') return [];
      return [...visionCues].sort((a, b) => a.tc_in_frames - b.tc_in_frames);
    }),
    findByAct: vi.fn().mockReturnValue(
      visionCues.map(c => ({ ...c, track_id: 't1', type: 'vision' })),
    ),
  };
}

// ── Testy ─────────────────────────────────────────────────

describe('PlaybackEngine — timeline_frames mode', () => {
  let engine: PlaybackEngine;
  let clock: MockClock;

  beforeEach(() => {
    clock = new MockClock(1_000_000_000_000);
    engine = new PlaybackEngine(
      createMockCueRepo(),
      createMockRundownRepo(),
      clock,
    );
  });

  afterEach(() => {
    engine.destroy();
  });

  // ── loadAct ─────────────────────────────────────────────

  describe('loadAct', () => {
    it('powinno rzucić błąd bez ustawionych timeline repos', () => {
      expect(() => engine.loadAct('act-001')).toThrow('Timeline repos not configured');
    });

    it('powinno rzucić błąd dla nieistniejącego aktu', () => {
      const actRepo: ActRepoLike = { findById: vi.fn().mockReturnValue(undefined) };
      engine.setTimelineRepos(actRepo, createMockTimelineCueRepo());
      expect(() => engine.loadAct('missing')).toThrow('Act missing not found');
    });

    it('powinno załadować akt i przełączyć w tryb timeline_frames', () => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      engine.loadAct('act-001');

      const state = engine.getState() as EngineTimelineFramesState;
      expect(state).not.toBeNull();
      expect(state.mode).toBe('timeline_frames');
      expect(state.actId).toBe('act-001');
      expect(state.actName).toBe('Test Act');
      expect(state.actDurationFrames).toBe(7500);
      expect(state.fps).toBe(25);
      expect(state.is_playing).toBe(false);
      expect(state.speed).toBe(1.0);
      expect(state.ltcSource).toBe('internal');
    });

    it('powinno ustawić currentTcFrames na tc_offset_frames', () => {
      engine.setTimelineRepos(
        createMockActRepo({ tc_offset_frames: 100 }),
        createMockTimelineCueRepo(),
      );
      engine.loadAct('act-001');

      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.currentTcFrames).toBe(100);
    });

    it('powinno emitować state-changed', () => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      const listener = vi.fn();
      engine.on('state-changed', listener);

      engine.loadAct('act-001');
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ── play / pause w timeline mode ────────────────────────

  describe('play / pause (timeline mode)', () => {
    beforeEach(() => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      engine.loadAct('act-001');
    });

    it('powinno rozpocząć odtwarzanie', () => {
      engine.play();
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.is_playing).toBe(true);
    });

    it('nie powinno nic robić przy ponownym play', () => {
      engine.play();
      const listener = vi.fn();
      engine.on('state-changed', listener);
      engine.play(); // drugie wywołanie
      expect(listener).not.toHaveBeenCalled();
    });

    it('powinno pauzować odtwarzanie', () => {
      engine.play();
      engine.pause();
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.is_playing).toBe(false);
    });
  });

  // ── scrub ───────────────────────────────────────────────

  describe('scrub', () => {
    beforeEach(() => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      engine.loadAct('act-001');
    });

    it('powinno przeskoczyć do podanej pozycji', () => {
      engine.scrub(1000);
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.currentTcFrames).toBe(1000);
    });

    it('powinno clampować do 0', () => {
      engine.scrub(-100);
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.currentTcFrames).toBe(0);
    });

    it('powinno clampować do duration', () => {
      engine.scrub(99999);
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.currentTcFrames).toBe(7500);
    });

    it('powinno rzucić błąd w trybie rundown', () => {
      // Nowy engine bez timeline mode
      const eng2 = new PlaybackEngine(createMockCueRepo(), createMockRundownRepo(), clock);
      expect(() => eng2.scrub(100)).toThrow('Not in timeline_frames mode');
      eng2.destroy();
    });

    it('powinno emitować state-changed', () => {
      const listener = vi.fn();
      engine.on('state-changed', listener);
      engine.scrub(500);
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ── setSpeed ────────────────────────────────────────────

  describe('setSpeed', () => {
    beforeEach(() => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      engine.loadAct('act-001');
    });

    it('powinno zmienić prędkość', () => {
      engine.setSpeed(2.0);
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.speed).toBe(2.0);
    });

    it('powinno emitować state-changed', () => {
      const listener = vi.fn();
      engine.on('state-changed', listener);
      engine.setSpeed(0.5);
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ── tickFrames ──────────────────────────────────────────

  describe('tickFrames', () => {
    beforeEach(() => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      engine.loadAct('act-001');
    });

    it('nie powinno nic robić gdy nie gra', () => {
      const state = engine.getState() as EngineTimelineFramesState;
      const before = state.currentTcFrames;
      clock.advance(40);
      engine.tickFrames();
      expect(state.currentTcFrames).toBe(before);
    });

    it('powinno przesuwać pozycję w takt zegara', () => {
      engine.play();
      clock.advance(1000); // 1 sekunda
      engine.tickFrames();
      const state = engine.getState() as EngineTimelineFramesState;
      // 25fps * 1s = 25 klatek
      expect(state.currentTcFrames).toBeCloseTo(25, 0);
    });

    it('powinno uwzględniać speed', () => {
      engine.setSpeed(2.0);
      engine.play();
      clock.advance(1000); // 1 sekunda
      engine.tickFrames();
      const state = engine.getState() as EngineTimelineFramesState;
      // 25fps * 2.0 * 1s = 50 klatek
      expect(state.currentTcFrames).toBeCloseTo(50, 0);
    });

    it('powinno zatrzymać się na końcu aktu', () => {
      engine.play();
      // Przeskoczymy prawie na koniec
      engine.scrub(7499);
      engine.play();
      clock.advance(1000); // 1 sekunda dalej niż koniec
      engine.tickFrames();
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.currentTcFrames).toBe(7500);
      expect(state.is_playing).toBe(false);
    });

    it('powinno emitować playback-ended na końcu aktu', () => {
      const listener = vi.fn();
      engine.on('playback-ended', listener);
      engine.scrub(7499);
      engine.play();
      clock.advance(1000);
      engine.tickFrames();
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ── tick() deleguje do tickFrames w timeline mode ───────

  describe('tick() w timeline mode', () => {
    it('powinno delegować do tickFrames', () => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      engine.loadAct('act-001');
      engine.play();
      clock.advance(1000);
      engine.tick(); // powinno wywołać tickFrames
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.currentTcFrames).toBeCloseTo(25, 0);
    });
  });

  // ── buildTimesnap (timeline_frames) ─────────────────────

  describe('buildTimesnap (timeline mode)', () => {
    it('powinno zwrócić timesnap z tc_mode timeline_frames', () => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      engine.loadAct('act-001');

      const snap = engine.buildTimesnap();
      expect(snap).not.toBeNull();
      expect(snap!.tc_mode).toBe('timeline_frames');
    });

    it('powinno zawierać poprawne pola timeline', () => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      engine.loadAct('act-001');
      engine.scrub(500);

      const snap = engine.buildTimesnap()!;
      expect(snap.tc_mode).toBe('timeline_frames');

      if (snap.tc_mode === 'timeline_frames') {
        expect(snap.act_id).toBe('act-001');
        expect(snap.tc.current_frames).toBe(500);
        expect(snap.tc.act_duration_frames).toBe(7500);
        expect(snap.tc.fps).toBe(25);
        expect(snap.tc.is_playing).toBe(false);
        expect(snap.tc.ltc_source).toBe('internal');
      }
    });
  });

  // ── Vision cue tracking ─────────────────────────────────

  describe('vision cue tracking', () => {
    const visionCues = [
      { id: 'vc-1', tc_in_frames: 0, tc_out_frames: 100, data: { camera_number: 1 } },
      { id: 'vc-2', tc_in_frames: 100, tc_out_frames: 250, data: { camera_number: 2 } },
      { id: 'vc-3', tc_in_frames: 300, tc_out_frames: 500, data: { camera_number: 3 } },
    ];

    beforeEach(() => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo(visionCues));
    });

    it('powinno ustawić aktywny vision cue przy loadAct', () => {
      engine.loadAct('act-001');
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.activeVisionCueId).toBe('vc-1');
      expect(state.activeCameraNumber).toBe(1);
    });

    it('powinno znaleźć następny vision cue', () => {
      engine.loadAct('act-001');
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.nextVisionCueId).toBe('vc-2');
    });

    it('powinno aktualizować vision cue przy scrub', () => {
      engine.loadAct('act-001');
      engine.scrub(150);
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.activeVisionCueId).toBe('vc-2');
      expect(state.activeCameraNumber).toBe(2);
    });

    it('powinno ustawić undefined gdy brak aktywnego vision cue', () => {
      engine.loadAct('act-001');
      engine.scrub(260); // między vc-2 (ends 250) a vc-3 (starts 300)
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.activeVisionCueId).toBeUndefined();
      expect(state.activeCameraNumber).toBeUndefined();
    });

    it('powinno emitować vision-cue-changed przy zmianie', () => {
      engine.loadAct('act-001');
      const listener = vi.fn();
      engine.on('vision-cue-changed', listener);
      engine.scrub(150); // zmiana z vc-1 na vc-2
      expect(listener).toHaveBeenCalledOnce();
    });

    it('nie powinno emitować vision-cue-changed bez zmiany', () => {
      engine.loadAct('act-001');
      engine.scrub(50); // nadal vc-1
      const listener = vi.fn();
      engine.on('vision-cue-changed', listener);
      engine.scrub(60); // nadal vc-1
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ── Przełączanie trybów ─────────────────────────────────

  describe('przełączanie trybów', () => {
    it('loadAct nadpisuje stan rundown', () => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      engine.loadAct('act-001');
      expect(engine.getState()!.mode).toBe('timeline_frames');
    });

    it('next/prev/goto ignorowane w timeline mode', () => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      engine.loadAct('act-001');
      engine.next();
      engine.prev();
      engine.goto('some-cue');
      expect(engine.getState()!.mode).toBe('timeline_frames');
    });
  });

  // ── Faza 6: stepMode/holdMode w stanie początkowym ────

  describe('Faza 6: stepMode i holdMode w loadAct', () => {
    it('powinno inicjalizować stepMode i holdMode na false', () => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      engine.loadAct('act-001');
      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.stepMode).toBe(false);
      expect(state.holdMode).toBe(false);
    });
  });

  // ── Faza 6: rozszerzony timesnap ──────────────────────

  describe('Faza 6: rozszerzony timesnap', () => {
    it('powinno zawierać nowe pola speed, step_mode, hold_mode', () => {
      engine.setTimelineRepos(createMockActRepo(), createMockTimelineCueRepo());
      engine.loadAct('act-001');
      const snap = engine.buildTimesnap();
      expect(snap).not.toBeNull();
      if (snap && snap.tc_mode === 'timeline_frames') {
        expect(snap.speed).toBe(1.0);
        expect(snap.step_mode).toBe(false);
        expect(snap.hold_mode).toBe(false);
        expect(snap.active_lyric_text).toBeUndefined();
      }
    });
  });
});
