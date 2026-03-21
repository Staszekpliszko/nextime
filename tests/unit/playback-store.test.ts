import { describe, it, expect, beforeEach } from 'vitest';
import { usePlaybackStore } from '../../src/store/playback.store';
import type { TimesnapPayload, TimesnapRundownMs, CueSummary } from '../../src/store/playback.store';

// ── Helpers ──────────────────────────────────────────────────

function makeCue(overrides: Partial<CueSummary> = {}): CueSummary {
  return {
    id: 'cue-1',
    title: 'Otwarcie',
    subtitle: 'Powitanie gości',
    duration_ms: 60_000,
    start_type: 'soft',
    auto_start: false,
    locked: false,
    status: 'ready',
    sort_order: 0,
    ...overrides,
  };
}

function makeTimesnap(overrides: Partial<TimesnapRundownMs> = {}): TimesnapPayload {
  return {
    tc_mode: 'rundown_ms' as const,
    tc: {
      tc_mode: 'rundown_ms' as const,
      kickoff_ms: 1_000_000_000_000,
      deadline_ms: 1_000_000_060_000,
      last_stop_ms: 1_000_000_000_000,
      is_playing: true,
    },
    rundown_id: 'rundown-1',
    rundown_cue_id: 'cue-1',
    next_cue_id: 'cue-2',
    over_under_ms: 0,
    ...overrides,
  };
}

// ── Testy ────────────────────────────────────────────────────

describe('playback.store', () => {
  beforeEach(() => {
    // Reset store do stanu początkowego
    const store = usePlaybackStore.getState();
    store.setPlayback(null);
    store.setCurrentCue(null);
    store.setNextCue(null);
    store.setCues([]);
    store.setClockDrift(0);
    store.setConnected(false);
  });

  describe('setPlayback', () => {
    it('powinno ustawić timesnap payload', () => {
      const cues = [makeCue({ id: 'cue-1' }), makeCue({ id: 'cue-2', title: 'Następny' })];
      usePlaybackStore.getState().setCues(cues);

      const snap = makeTimesnap();
      usePlaybackStore.getState().setPlayback(snap);

      const state = usePlaybackStore.getState();
      expect(state.playback).toEqual(snap);
    });

    it('powinno automatycznie ustawić currentCue z cues na podstawie rundown_cue_id', () => {
      const cue1 = makeCue({ id: 'cue-1', title: 'Otwarcie' });
      const cue2 = makeCue({ id: 'cue-2', title: 'Wywiad' });
      usePlaybackStore.getState().setCues([cue1, cue2]);

      usePlaybackStore.getState().setPlayback(makeTimesnap({ rundown_cue_id: 'cue-1' }));

      expect(usePlaybackStore.getState().currentCue).toEqual(cue1);
    });

    it('powinno automatycznie ustawić nextCue z cues na podstawie next_cue_id', () => {
      const cue1 = makeCue({ id: 'cue-1' });
      const cue2 = makeCue({ id: 'cue-2', title: 'Wywiad' });
      usePlaybackStore.getState().setCues([cue1, cue2]);

      usePlaybackStore.getState().setPlayback(makeTimesnap({ next_cue_id: 'cue-2' }));

      expect(usePlaybackStore.getState().nextCue).toEqual(cue2);
    });

    it('powinno ustawić nextCue na null gdy brak next_cue_id', () => {
      const cue1 = makeCue({ id: 'cue-1' });
      usePlaybackStore.getState().setCues([cue1]);

      usePlaybackStore.getState().setPlayback(makeTimesnap({ next_cue_id: undefined }));

      expect(usePlaybackStore.getState().nextCue).toBeNull();
    });
  });

  describe('setCues', () => {
    it('powinno ustawić listę cues', () => {
      const cues = [makeCue({ id: 'c1' }), makeCue({ id: 'c2' }), makeCue({ id: 'c3' })];
      usePlaybackStore.getState().setCues(cues);

      expect(usePlaybackStore.getState().cues).toHaveLength(3);
      expect(usePlaybackStore.getState().cues[0]?.id).toBe('c1');
    });
  });

  describe('setClockDrift', () => {
    it('powinno ustawić clock drift', () => {
      usePlaybackStore.getState().setClockDrift(150);
      expect(usePlaybackStore.getState().clockDrift).toBe(150);
    });

    it('powinno obsłużyć ujemny drift', () => {
      usePlaybackStore.getState().setClockDrift(-200);
      expect(usePlaybackStore.getState().clockDrift).toBe(-200);
    });
  });

  describe('setConnected', () => {
    it('powinno ustawić connected na true', () => {
      usePlaybackStore.getState().setConnected(true);
      expect(usePlaybackStore.getState().connected).toBe(true);
    });

    it('powinno ustawić connected na false', () => {
      usePlaybackStore.getState().setConnected(true);
      usePlaybackStore.getState().setConnected(false);
      expect(usePlaybackStore.getState().connected).toBe(false);
    });
  });

  describe('setCurrentCue / setNextCue', () => {
    it('powinno ustawić currentCue ręcznie', () => {
      const cue = makeCue({ id: 'manual', title: 'Ręczny' });
      usePlaybackStore.getState().setCurrentCue(cue);
      expect(usePlaybackStore.getState().currentCue?.title).toBe('Ręczny');
    });

    it('powinno wyczyścić currentCue na null', () => {
      usePlaybackStore.getState().setCurrentCue(makeCue());
      usePlaybackStore.getState().setCurrentCue(null);
      expect(usePlaybackStore.getState().currentCue).toBeNull();
    });

    it('powinno ustawić nextCue ręcznie', () => {
      const cue = makeCue({ id: 'next', title: 'Następny' });
      usePlaybackStore.getState().setNextCue(cue);
      expect(usePlaybackStore.getState().nextCue?.title).toBe('Następny');
    });
  });
});
