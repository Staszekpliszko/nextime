import { describe, it, expect, beforeEach } from 'vitest';
import { usePlaybackStore } from '../../src/store/playback.store';
import type { CueSummary, RundownChange, RundownSummary, ActSummary, TrackSummary, TimelineCueSummary } from '../../src/store/playback.store';

/** Helper: tworzy CueSummary z domyślnymi wartościami */
function makeCue(overrides: Partial<CueSummary> & { id: string }): CueSummary {
  return {
    title: '',
    subtitle: '',
    duration_ms: 60_000,
    start_type: 'soft',
    auto_start: false,
    locked: false,
    status: 'ready',
    sort_order: 0,
    ...overrides,
  };
}

beforeEach(() => {
  // Reset store do stanu początkowego
  usePlaybackStore.setState({
    playback: null,
    currentCue: null,
    nextCue: null,
    cues: [],
    clockDrift: 0,
    connected: false,
    selectedCueId: null,
    rundowns: [],
    activeRundownId: null,
    acts: [],
    activeActId: null,
    tracks: [],
    timelineCues: [],
    activeVisionCue: null,
    nextVisionCue: null,
    selectedTimelineCueId: null,
  });
});

// ── selectedCueId ───────────────────────────────────────────

describe('setSelectedCueId', () => {
  it('powinno ustawić zaznaczony cue', () => {
    usePlaybackStore.getState().setSelectedCueId('cue-1');
    expect(usePlaybackStore.getState().selectedCueId).toBe('cue-1');
  });

  it('powinno wyczyścić zaznaczenie na null', () => {
    usePlaybackStore.getState().setSelectedCueId('cue-1');
    usePlaybackStore.getState().setSelectedCueId(null);
    expect(usePlaybackStore.getState().selectedCueId).toBeNull();
  });
});

// ── rundowns ────────────────────────────────────────────────

describe('setRundowns', () => {
  it('powinno ustawić listę rundownów', () => {
    const rundowns: RundownSummary[] = [
      { id: 'rd-1', name: 'Show 1', status: 'draft' },
      { id: 'rd-2', name: 'Show 2', status: 'live' },
    ];
    usePlaybackStore.getState().setRundowns(rundowns);
    expect(usePlaybackStore.getState().rundowns).toHaveLength(2);
    expect(usePlaybackStore.getState().rundowns[0]!.name).toBe('Show 1');
  });
});

describe('setActiveRundownId', () => {
  it('powinno ustawić aktywny rundown', () => {
    usePlaybackStore.getState().setActiveRundownId('rd-1');
    expect(usePlaybackStore.getState().activeRundownId).toBe('rd-1');
  });
});

// ── addCue ──────────────────────────────────────────────────

describe('addCue', () => {
  it('powinno dodać cue do pustej listy', () => {
    const cue = makeCue({ id: 'c1', title: 'Intro', sort_order: 0 });
    usePlaybackStore.getState().addCue(cue);

    const { cues } = usePlaybackStore.getState();
    expect(cues).toHaveLength(1);
    expect(cues[0]!.title).toBe('Intro');
  });

  it('powinno wstawić cue we właściwe miejsce wg sort_order', () => {
    const store = usePlaybackStore.getState();
    store.setCues([
      makeCue({ id: 'c1', title: 'A', sort_order: 0 }),
      makeCue({ id: 'c3', title: 'C', sort_order: 2 }),
    ]);

    usePlaybackStore.getState().addCue(makeCue({ id: 'c2', title: 'B', sort_order: 1 }));

    const { cues } = usePlaybackStore.getState();
    expect(cues.map(c => c.title)).toEqual(['A', 'B', 'C']);
  });
});

// ── updateCue ───────────────────────────────────────────────

describe('updateCue', () => {
  it('powinno zaktualizować title cue', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', title: 'Stary' }),
    ]);

    usePlaybackStore.getState().updateCue('c1', { title: 'Nowy' });

    const { cues } = usePlaybackStore.getState();
    expect(cues[0]!.title).toBe('Nowy');
  });

  it('powinno zaktualizować tylko podane pola', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', title: 'Test', duration_ms: 30_000 }),
    ]);

    usePlaybackStore.getState().updateCue('c1', { duration_ms: 90_000 });

    const { cues } = usePlaybackStore.getState();
    expect(cues[0]!.title).toBe('Test'); // nie zmieniony
    expect(cues[0]!.duration_ms).toBe(90_000); // zmieniony
  });

  it('powinno nie zmieniać cue o innym id', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', title: 'A' }),
      makeCue({ id: 'c2', title: 'B' }),
    ]);

    usePlaybackStore.getState().updateCue('c1', { title: 'Updated A' });

    const { cues } = usePlaybackStore.getState();
    expect(cues[1]!.title).toBe('B');
  });
});

// ── removeCue ───────────────────────────────────────────────

describe('removeCue', () => {
  it('powinno usunąć cue z listy', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', title: 'A' }),
      makeCue({ id: 'c2', title: 'B' }),
    ]);

    usePlaybackStore.getState().removeCue('c1');

    const { cues } = usePlaybackStore.getState();
    expect(cues).toHaveLength(1);
    expect(cues[0]!.id).toBe('c2');
  });

  it('powinno zaznaczać następny cue po usunięciu zaznaczonego', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', sort_order: 0 }),
      makeCue({ id: 'c2', sort_order: 1 }),
      makeCue({ id: 'c3', sort_order: 2 }),
    ]);
    usePlaybackStore.getState().setSelectedCueId('c2');

    usePlaybackStore.getState().removeCue('c2');

    // Po usunięciu c2 (index 1), następny to c3 (nowy index 1)
    expect(usePlaybackStore.getState().selectedCueId).toBe('c3');
  });

  it('powinno zaznaczać poprzedni cue gdy usunięty był ostatni', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', sort_order: 0 }),
      makeCue({ id: 'c2', sort_order: 1 }),
    ]);
    usePlaybackStore.getState().setSelectedCueId('c2');

    usePlaybackStore.getState().removeCue('c2');

    expect(usePlaybackStore.getState().selectedCueId).toBe('c1');
  });

  it('powinno ustawić selectedCueId na null gdy lista pusta', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', sort_order: 0 }),
    ]);
    usePlaybackStore.getState().setSelectedCueId('c1');

    usePlaybackStore.getState().removeCue('c1');

    expect(usePlaybackStore.getState().selectedCueId).toBeNull();
    expect(usePlaybackStore.getState().cues).toHaveLength(0);
  });
});

// ── reorderCues ─────────────────────────────────────────────

describe('reorderCues', () => {
  it('powinno zmienić kolejność cue\'ów', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', title: 'A', sort_order: 0 }),
      makeCue({ id: 'c2', title: 'B', sort_order: 1 }),
      makeCue({ id: 'c3', title: 'C', sort_order: 2 }),
    ]);

    usePlaybackStore.getState().reorderCues(['c3', 'c1', 'c2']);

    const { cues } = usePlaybackStore.getState();
    expect(cues.map(c => c.title)).toEqual(['C', 'A', 'B']);
    expect(cues[0]!.sort_order).toBe(0);
    expect(cues[1]!.sort_order).toBe(1);
    expect(cues[2]!.sort_order).toBe(2);
  });
});

// ── applyDelta ──────────────────────────────────────────────

describe('applyDelta', () => {
  it('powinno dodać cue z cue_added', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', title: 'A', sort_order: 0 }),
    ]);

    const changes: RundownChange[] = [
      { op: 'cue_added', cue: makeCue({ id: 'c2', title: 'B', sort_order: 1 }) },
    ];
    usePlaybackStore.getState().applyDelta(changes);

    const { cues } = usePlaybackStore.getState();
    expect(cues).toHaveLength(2);
    expect(cues[1]!.title).toBe('B');
  });

  it('powinno nie duplikować cue przy powtórzonym cue_added', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', title: 'A', sort_order: 0 }),
    ]);

    const changes: RundownChange[] = [
      { op: 'cue_added', cue: makeCue({ id: 'c1', title: 'A', sort_order: 0 }) },
    ];
    usePlaybackStore.getState().applyDelta(changes);

    expect(usePlaybackStore.getState().cues).toHaveLength(1);
  });

  it('powinno zaktualizować cue z cue_updated', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', title: 'Stary', sort_order: 0 }),
    ]);

    const changes: RundownChange[] = [
      { op: 'cue_updated', cue: makeCue({ id: 'c1', title: 'Nowy', sort_order: 0 }) },
    ];
    usePlaybackStore.getState().applyDelta(changes);

    expect(usePlaybackStore.getState().cues[0]!.title).toBe('Nowy');
  });

  it('powinno usunąć cue z cue_deleted', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', sort_order: 0 }),
      makeCue({ id: 'c2', sort_order: 1 }),
    ]);

    const changes: RundownChange[] = [
      { op: 'cue_deleted', cue_id: 'c1' },
    ];
    usePlaybackStore.getState().applyDelta(changes);

    const { cues } = usePlaybackStore.getState();
    expect(cues).toHaveLength(1);
    expect(cues[0]!.id).toBe('c2');
  });

  it('powinno przenieść cue z cue_moved', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', sort_order: 0 }),
      makeCue({ id: 'c2', sort_order: 1 }),
      makeCue({ id: 'c3', sort_order: 2 }),
    ]);

    const changes: RundownChange[] = [
      { op: 'cue_moved', cue_id: 'c3', new_order: 0 },
      { op: 'cue_moved', cue_id: 'c1', new_order: 1 },
      { op: 'cue_moved', cue_id: 'c2', new_order: 2 },
    ];
    usePlaybackStore.getState().applyDelta(changes);

    const { cues } = usePlaybackStore.getState();
    expect(cues[0]!.id).toBe('c3');
    expect(cues[1]!.id).toBe('c1');
    expect(cues[2]!.id).toBe('c2');
  });

  it('powinno obsłużyć wiele zmian jednocześnie', () => {
    usePlaybackStore.getState().setCues([
      makeCue({ id: 'c1', title: 'A', sort_order: 0 }),
      makeCue({ id: 'c2', title: 'B', sort_order: 1 }),
    ]);

    const changes: RundownChange[] = [
      { op: 'cue_updated', cue: makeCue({ id: 'c1', title: 'Updated A', sort_order: 0 }) },
      { op: 'cue_added', cue: makeCue({ id: 'c3', title: 'C', sort_order: 2 }) },
      { op: 'cue_deleted', cue_id: 'c2' },
    ];
    usePlaybackStore.getState().applyDelta(changes);

    const { cues } = usePlaybackStore.getState();
    expect(cues).toHaveLength(2);
    expect(cues[0]!.title).toBe('Updated A');
    expect(cues[1]!.title).toBe('C');
  });
});

// ── Helpers: Act, Track, TimelineCue ─────────────────────────

function makeAct(overrides: Partial<ActSummary> & { id: string }): ActSummary {
  return {
    name: 'Test Act',
    duration_frames: 7500,
    fps: 25,
    status: 'draft',
    color: '#1E3A5F',
    sort_order: 0,
    ...overrides,
  };
}

function makeTrack(overrides: Partial<TrackSummary> & { id: string; act_id: string }): TrackSummary {
  return {
    type: 'vision',
    name: 'Vision',
    sort_order: 0,
    enabled: true,
    height_px: 48,
    ...overrides,
  };
}

function makeTlCue(overrides: Partial<TimelineCueSummary> & { id: string; track_id: string; act_id: string }): TimelineCueSummary {
  return {
    type: 'vision',
    tc_in_frames: 0,
    z_order: 0,
    data: {},
    ...overrides,
  };
}

// ── addAct ──────────────────────────────────────────────────

describe('addAct', () => {
  it('powinno dodać akt do pustej listy', () => {
    const act = makeAct({ id: 'a1', name: 'Akt 1' });
    usePlaybackStore.getState().addAct(act);

    const { acts } = usePlaybackStore.getState();
    expect(acts).toHaveLength(1);
    expect(acts[0]!.name).toBe('Akt 1');
  });

  it('powinno sortować akty po sort_order', () => {
    const store = usePlaybackStore.getState();
    store.addAct(makeAct({ id: 'a2', name: 'B', sort_order: 1 }));
    store.addAct(makeAct({ id: 'a1', name: 'A', sort_order: 0 }));

    const { acts } = usePlaybackStore.getState();
    expect(acts.map(a => a.name)).toEqual(['A', 'B']);
  });

  it('powinno nie duplikować aktu', () => {
    const store = usePlaybackStore.getState();
    store.addAct(makeAct({ id: 'a1' }));
    store.addAct(makeAct({ id: 'a1' }));

    expect(usePlaybackStore.getState().acts).toHaveLength(1);
  });
});

// ── updateAct ───────────────────────────────────────────────

describe('updateAct', () => {
  it('powinno zaktualizować nazwę aktu', () => {
    usePlaybackStore.getState().setActs([makeAct({ id: 'a1', name: 'Stary' })]);
    usePlaybackStore.getState().updateAct('a1', { name: 'Nowy' });

    expect(usePlaybackStore.getState().acts[0]!.name).toBe('Nowy');
  });

  it('powinno zaktualizować tylko podane pola', () => {
    usePlaybackStore.getState().setActs([makeAct({ id: 'a1', name: 'Test', color: '#fff' })]);
    usePlaybackStore.getState().updateAct('a1', { color: '#000' });

    const act = usePlaybackStore.getState().acts[0]!;
    expect(act.name).toBe('Test');
    expect(act.color).toBe('#000');
  });
});

// ── removeAct ───────────────────────────────────────────────

describe('removeAct', () => {
  it('powinno usunąć akt z listy', () => {
    usePlaybackStore.getState().setActs([
      makeAct({ id: 'a1' }),
      makeAct({ id: 'a2', sort_order: 1 }),
    ]);
    usePlaybackStore.getState().removeAct('a1');

    const { acts } = usePlaybackStore.getState();
    expect(acts).toHaveLength(1);
    expect(acts[0]!.id).toBe('a2');
  });

  it('powinno wyczyścić timeline state jeśli usuwany akt jest aktywny', () => {
    usePlaybackStore.setState({
      acts: [makeAct({ id: 'a1' })],
      activeActId: 'a1',
      tracks: [makeTrack({ id: 't1', act_id: 'a1' })],
      timelineCues: [makeTlCue({ id: 'tc1', track_id: 't1', act_id: 'a1' })],
      selectedTimelineCueId: 'tc1',
    });

    usePlaybackStore.getState().removeAct('a1');

    const state = usePlaybackStore.getState();
    expect(state.acts).toHaveLength(0);
    expect(state.activeActId).toBeNull();
    expect(state.tracks).toHaveLength(0);
    expect(state.timelineCues).toHaveLength(0);
    expect(state.selectedTimelineCueId).toBeNull();
  });

  it('powinno nie czyścić timeline state jeśli usuwany akt nie jest aktywny', () => {
    usePlaybackStore.setState({
      acts: [makeAct({ id: 'a1' }), makeAct({ id: 'a2', sort_order: 1 })],
      activeActId: 'a2',
      tracks: [makeTrack({ id: 't1', act_id: 'a2' })],
    });

    usePlaybackStore.getState().removeAct('a1');

    const state = usePlaybackStore.getState();
    expect(state.activeActId).toBe('a2');
    expect(state.tracks).toHaveLength(1);
  });
});

// ── addTrack ────────────────────────────────────────────────

describe('addTrack', () => {
  it('powinno dodać track i sortować po sort_order', () => {
    const store = usePlaybackStore.getState();
    store.addTrack(makeTrack({ id: 't2', act_id: 'a1', name: 'B', sort_order: 1 }));
    store.addTrack(makeTrack({ id: 't1', act_id: 'a1', name: 'A', sort_order: 0 }));

    const { tracks } = usePlaybackStore.getState();
    expect(tracks.map(t => t.name)).toEqual(['A', 'B']);
  });

  it('powinno nie duplikować tracka', () => {
    const store = usePlaybackStore.getState();
    store.addTrack(makeTrack({ id: 't1', act_id: 'a1' }));
    store.addTrack(makeTrack({ id: 't1', act_id: 'a1' }));

    expect(usePlaybackStore.getState().tracks).toHaveLength(1);
  });
});

// ── removeTrack ─────────────────────────────────────────────

describe('removeTrack', () => {
  it('powinno usunąć track i powiązane timeline cues', () => {
    usePlaybackStore.setState({
      tracks: [
        makeTrack({ id: 't1', act_id: 'a1' }),
        makeTrack({ id: 't2', act_id: 'a1', sort_order: 1 }),
      ],
      timelineCues: [
        makeTlCue({ id: 'tc1', track_id: 't1', act_id: 'a1' }),
        makeTlCue({ id: 'tc2', track_id: 't1', act_id: 'a1', tc_in_frames: 100 }),
        makeTlCue({ id: 'tc3', track_id: 't2', act_id: 'a1' }),
      ],
    });

    usePlaybackStore.getState().removeTrack('t1');

    const state = usePlaybackStore.getState();
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0]!.id).toBe('t2');
    expect(state.timelineCues).toHaveLength(1);
    expect(state.timelineCues[0]!.id).toBe('tc3');
  });

  it('powinno wyczyścić selectedTimelineCueId jeśli usunięty cue był zaznaczony', () => {
    usePlaybackStore.setState({
      tracks: [makeTrack({ id: 't1', act_id: 'a1' })],
      timelineCues: [makeTlCue({ id: 'tc1', track_id: 't1', act_id: 'a1' })],
      selectedTimelineCueId: 'tc1',
    });

    usePlaybackStore.getState().removeTrack('t1');

    expect(usePlaybackStore.getState().selectedTimelineCueId).toBeNull();
  });
});

// ── selectedTimelineCueId ───────────────────────────────────

describe('setSelectedTimelineCueId', () => {
  it('powinno ustawić i wyczyścić zaznaczony timeline cue', () => {
    usePlaybackStore.getState().setSelectedTimelineCueId('tc-1');
    expect(usePlaybackStore.getState().selectedTimelineCueId).toBe('tc-1');

    usePlaybackStore.getState().setSelectedTimelineCueId(null);
    expect(usePlaybackStore.getState().selectedTimelineCueId).toBeNull();
  });
});
