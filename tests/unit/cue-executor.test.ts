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

// ── Testy ─────────────────────────────────────────────────

describe('PlaybackEngine — Cue Executor (Faza 6)', () => {
  let engine: PlaybackEngine;
  let clock: MockClock;

  afterEach(() => {
    engine.destroy();
  });

  // ── Vision cue enter/exit ─────────────────────────────

  describe('vision cue enter/exit', () => {
    beforeEach(() => {
      clock = new MockClock(1_000_000_000_000);
      engine = new PlaybackEngine(createMockCueRepo(), createMockRundownRepo(), clock);
      engine.setTimelineRepos(
        createMockActRepo(),
        createMockTimelineCueRepo([
          { id: 'vc-1', track_id: 't1', type: 'vision', tc_in_frames: 10, tc_out_frames: 50, data: { camera_number: 1 } },
          { id: 'vc-2', track_id: 't1', type: 'vision', tc_in_frames: 50, tc_out_frames: 100, data: { camera_number: 2 } },
        ]),
      );
      engine.loadAct('act-001');
    });

    it('powinno emitować cue-entered gdy playhead wchodzi w vision cue', () => {
      const entered = vi.fn();
      engine.on('cue-entered', entered);

      engine.scrub(0); // reset
      engine.play();
      // Przesuwamy czas o ~0.5s = 12.5 klatek → pozycja ~12 → w zakresie vc-1 (10-50)
      clock.advance(500);
      engine.tickFrames();

      expect(entered).toHaveBeenCalledWith(expect.objectContaining({ id: 'vc-1' }));
    });

    it('powinno emitować cue-exited gdy playhead opuszcza vision cue', () => {
      const exited = vi.fn();

      // Ustaw playhead wewnątrz vc-1
      engine.scrub(20);
      engine.play();
      engine.on('cue-exited', exited);

      // Przesuwamy daleko poza vc-1 (tc_out=50)
      clock.advance(2000); // ~50 klatek dalej
      engine.tickFrames();

      expect(exited).toHaveBeenCalledWith(expect.objectContaining({ id: 'vc-1' }));
    });
  });

  // ── Lyric cue enter/exit ──────────────────────────────

  describe('lyric cue enter/exit', () => {
    beforeEach(() => {
      clock = new MockClock(1_000_000_000_000);
      engine = new PlaybackEngine(createMockCueRepo(), createMockRundownRepo(), clock);
      engine.setTimelineRepos(
        createMockActRepo(),
        createMockTimelineCueRepo([
          { id: 'lc-1', track_id: 't2', type: 'lyric', tc_in_frames: 10, tc_out_frames: 30, data: { text: 'Cześć świecie' } },
        ]),
      );
      engine.loadAct('act-001');
    });

    it('powinno emitować lyric-changed z tekstem przy wejściu', () => {
      const lyricChanged = vi.fn();
      engine.on('lyric-changed', lyricChanged);

      engine.scrub(0);
      engine.play();
      clock.advance(500); // pozycja ~12 → w zakresie lc-1
      engine.tickFrames();

      expect(lyricChanged).toHaveBeenCalledWith('Cześć świecie', undefined);
    });

    it('powinno emitować lyric-changed z null przy wyjściu', () => {
      const lyricChanged = vi.fn();

      engine.scrub(15); // wewnątrz lc-1
      engine.play();
      engine.on('lyric-changed', lyricChanged);

      clock.advance(1000); // ~25 klatek dalej → pozycja 40 → poza lc-1 (tc_out=30)
      engine.tickFrames();

      expect(lyricChanged).toHaveBeenCalledWith(null, undefined);
    });
  });

  // ── Marker pre-warning ────────────────────────────────

  describe('marker pre-warning', () => {
    beforeEach(() => {
      clock = new MockClock(1_000_000_000_000);
      engine = new PlaybackEngine(createMockCueRepo(), createMockRundownRepo(), clock);
      engine.setTimelineRepos(
        createMockActRepo(),
        createMockTimelineCueRepo([
          { id: 'mk-1', track_id: 't3', type: 'marker', tc_in_frames: 100, tc_out_frames: 120, data: { label: 'GO', color: '#ff0000', pre_warn_frames: 25 } },
        ]),
      );
      engine.loadAct('act-001');
    });

    it('powinno emitować cue-pre-warning N klatek przed tc_in', () => {
      const preWarning = vi.fn();
      engine.on('cue-pre-warning', preWarning);

      // Ustaw playhead na 74 (1 klatkę przed pre-warn: 100-25=75)
      engine.scrub(74);
      engine.play();
      clock.advance(80); // ~2 klatki dalej → pozycja ~76 → w zakresie pre-warn (75-100)
      engine.tickFrames();

      expect(preWarning).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'mk-1' }),
        expect.any(Number),
      );
    });
  });

  // ── Point cue single fire ─────────────────────────────

  describe('point cue single fire', () => {
    beforeEach(() => {
      clock = new MockClock(1_000_000_000_000);
      engine = new PlaybackEngine(createMockCueRepo(), createMockRundownRepo(), clock);
      engine.setTimelineRepos(
        createMockActRepo(),
        createMockTimelineCueRepo([
          // Point cue — brak tc_out_frames
          { id: 'pc-1', track_id: 't4', type: 'osc', tc_in_frames: 50, data: { channel: '/cue/1/go' } },
        ]),
      );
      engine.loadAct('act-001');
    });

    it('powinno odpalić point cue dokładnie raz', () => {
      const entered = vi.fn();
      engine.on('cue-entered', entered);

      // Ustaw playhead tuż przed point cue i play
      engine.scrub(49);
      engine.play();
      clock.advance(40); // 1 klatka dalej → pozycja 50 = tc_in
      engine.tickFrames();

      expect(entered).toHaveBeenCalledWith(expect.objectContaining({ id: 'pc-1' }));

      // Kolejny tick na tej samej pozycji — nie powinno odpalić ponownie
      entered.mockClear();
      clock.advance(40);
      engine.tickFrames();
      expect(entered).not.toHaveBeenCalled();
    });
  });

  // ── Multiple active cues ──────────────────────────────

  describe('multiple active cues', () => {
    it('powinno obsługiwać wiele aktywnych cue jednocześnie', () => {
      clock = new MockClock(1_000_000_000_000);
      engine = new PlaybackEngine(createMockCueRepo(), createMockRundownRepo(), clock);
      engine.setTimelineRepos(
        createMockActRepo(),
        createMockTimelineCueRepo([
          { id: 'vc-1', track_id: 't1', type: 'vision', tc_in_frames: 10, tc_out_frames: 100, data: { camera_number: 1 } },
          { id: 'lc-1', track_id: 't2', type: 'lyric', tc_in_frames: 20, tc_out_frames: 80, data: { text: 'Hello' } },
        ]),
      );
      engine.loadAct('act-001');

      const entered = vi.fn();
      engine.on('cue-entered', entered);

      engine.scrub(0);
      engine.play();
      clock.advance(1200); // ~30 klatek → oba cue'y aktywne
      engine.tickFrames();

      // Oba powinny zostać "entered"
      const enteredIds = entered.mock.calls.map(c => c[0].id);
      expect(enteredIds).toContain('vc-1');
      expect(enteredIds).toContain('lc-1');
    });
  });

  // ── scrub() no events ─────────────────────────────────

  describe('scrub() no enter/exit events', () => {
    it('powinno przeliczać aktywne cue bez emitowania enter/exit', () => {
      clock = new MockClock(1_000_000_000_000);
      engine = new PlaybackEngine(createMockCueRepo(), createMockRundownRepo(), clock);
      engine.setTimelineRepos(
        createMockActRepo(),
        createMockTimelineCueRepo([
          { id: 'vc-1', track_id: 't1', type: 'vision', tc_in_frames: 10, tc_out_frames: 100, data: { camera_number: 1 } },
        ]),
      );
      engine.loadAct('act-001');

      const entered = vi.fn();
      const exited = vi.fn();
      engine.on('cue-entered', entered);
      engine.on('cue-exited', exited);

      engine.scrub(50); // wewnątrz vc-1 — bez emitowania
      engine.scrub(200); // poza vc-1 — bez emitowania

      expect(entered).not.toHaveBeenCalled();
      expect(exited).not.toHaveBeenCalled();
    });
  });

  // ── reloadTimelineCues ────────────────────────────────

  describe('reloadTimelineCues', () => {
    it('powinno przeładować cache i przeliczyć aktywne cue', () => {
      clock = new MockClock(1_000_000_000_000);
      engine = new PlaybackEngine(createMockCueRepo(), createMockRundownRepo(), clock);
      const repo = createMockTimelineCueRepo([
        { id: 'vc-1', track_id: 't1', type: 'vision', tc_in_frames: 0, tc_out_frames: 100, data: { camera_number: 1 } },
      ]);
      engine.setTimelineRepos(createMockActRepo(), repo);
      engine.loadAct('act-001');

      const state = engine.getState() as EngineTimelineFramesState;
      expect(state.activeVisionCueId).toBe('vc-1');

      // Zmień dane w repo (symulacja CRUD)
      (repo.findByAct as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 'vc-2', track_id: 't1', type: 'vision', tc_in_frames: 0, tc_out_frames: 100, data: { camera_number: 2 } },
      ]);

      engine.reloadTimelineCues();
      expect(state.activeVisionCueId).toBe('vc-2');
    });
  });
});
