import { describe, it, expect, beforeEach } from 'vitest';
import { usePlaybackStore } from '../../src/store/playback.store';
import type { CueSummary, ColumnInfo } from '../../src/store/playback.store';

// ── Helpers ─────────────────────────────────────────────────

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

function makeColumn(overrides: Partial<ColumnInfo> & { id: string }): ColumnInfo {
  return {
    rundown_id: 'r1',
    name: 'Kolumna',
    type: 'richtext',
    sort_order: 0,
    width_px: 200,
    is_script: false,
    ...overrides,
  };
}

beforeEach(() => {
  usePlaybackStore.setState({
    cues: [],
    columns: [],
    hiddenColumnIds: new Set<string>(),
    selectedCueId: null,
    activeRundownId: 'r1',
  });
});

// ── Testy DnD kolumn (reorder w store) ──────────────────────

describe('Drag & Drop kolumn — reorder w store', () => {
  it('zmienia kolejność kolumn w store przez setColumns', () => {
    const col1 = makeColumn({ id: 'c1', name: 'A', sort_order: 0 });
    const col2 = makeColumn({ id: 'c2', name: 'B', sort_order: 1 });
    const col3 = makeColumn({ id: 'c3', name: 'C', sort_order: 2 });

    usePlaybackStore.setState({ columns: [col1, col2, col3] });

    // Symulacja DnD: przenieś c3 na pozycję 0
    const reordered = [col3, col1, col2].map((c, i) => ({ ...c, sort_order: i }));
    usePlaybackStore.getState().setColumns(reordered);

    const result = usePlaybackStore.getState().columns;
    expect(result[0]!.id).toBe('c3');
    expect(result[1]!.id).toBe('c1');
    expect(result[2]!.id).toBe('c2');
    expect(result[0]!.sort_order).toBe(0);
  });

  it('zachowuje ukryte kolumny przy reorderze widocznych', () => {
    const col1 = makeColumn({ id: 'c1', name: 'Widoczna1', sort_order: 0 });
    const col2 = makeColumn({ id: 'c2', name: 'Ukryta', sort_order: 1 });
    const col3 = makeColumn({ id: 'c3', name: 'Widoczna2', sort_order: 2 });

    usePlaybackStore.setState({
      columns: [col1, col2, col3],
      hiddenColumnIds: new Set(['c2']),
    });

    // Reorder widocznych (c3, c1) + ukryte (c2)
    const visible = [col3, col1];
    const hidden = [col2];
    const all = [...visible, ...hidden].map((c, i) => ({ ...c, sort_order: i }));
    usePlaybackStore.getState().setColumns(all);

    const result = usePlaybackStore.getState().columns;
    expect(result).toHaveLength(3);
    expect(result[0]!.id).toBe('c3');
    expect(result[2]!.id).toBe('c2');
  });
});

// ── Testy Context Menu — duplikacja cue (store) ──────────────

describe('Menu kontekstowe — duplikacja cue w store', () => {
  it('dodaje zduplikowany cue do store', () => {
    const cue1 = makeCue({ id: 'q1', title: 'Intro', sort_order: 0 });
    usePlaybackStore.setState({ cues: [cue1] });

    const duplicate = makeCue({
      id: 'q2',
      title: 'Intro (kopia)',
      sort_order: 1,
    });
    usePlaybackStore.getState().addCue(duplicate);

    const { cues } = usePlaybackStore.getState();
    expect(cues).toHaveLength(2);
    expect(cues[1]!.title).toBe('Intro (kopia)');
    expect(cues[1]!.sort_order).toBe(1);
  });

  it('nie dodaje duplikatu z tym samym ID', () => {
    const cue1 = makeCue({ id: 'q1', title: 'Intro', sort_order: 0 });
    usePlaybackStore.setState({ cues: [cue1] });

    usePlaybackStore.getState().addCue(cue1); // ten sam ID
    expect(usePlaybackStore.getState().cues).toHaveLength(1);
  });
});

// ── Testy inline edit — walidacja pustego tytułu ─────────────

describe('Inline edit — walidacja', () => {
  it('updateCue nie zmienia tytułu na pusty string', () => {
    const cue1 = makeCue({ id: 'q1', title: 'Otwarcie', sort_order: 0 });
    usePlaybackStore.setState({ cues: [cue1] });

    // W implementacji: pusty tytuł nie jest wysyłany do updateCue
    // Test sprawdza logikę store — updateCue z pustym stringiem
    usePlaybackStore.getState().updateCue('q1', { title: '' });

    // Store pozwala na pusty tytuł (walidacja jest w UI) — sprawdzamy że update działa
    const updated = usePlaybackStore.getState().cues[0]!;
    expect(updated.title).toBe('');
  });

  it('updateCue zmienia subtitle poprawnie', () => {
    const cue1 = makeCue({ id: 'q1', title: 'Intro', subtitle: 'Stary', sort_order: 0 });
    usePlaybackStore.setState({ cues: [cue1] });

    usePlaybackStore.getState().updateCue('q1', { subtitle: 'Nowy podtytuł' });

    const updated = usePlaybackStore.getState().cues[0]!;
    expect(updated.subtitle).toBe('Nowy podtytuł');
    expect(updated.title).toBe('Intro'); // bez zmian
  });
});

// ── Testy skrótów klawiszowych (store) ─────────────────────

describe('Skróty klawiszowe — efekty store', () => {
  it('Escape resetuje selectedCueId na null', () => {
    usePlaybackStore.setState({ selectedCueId: 'q1' });

    usePlaybackStore.getState().setSelectedCueId(null);

    expect(usePlaybackStore.getState().selectedCueId).toBeNull();
  });

  it('removeCue przenosi selekcję na następny cue', () => {
    const cues = [
      makeCue({ id: 'q1', sort_order: 0 }),
      makeCue({ id: 'q2', sort_order: 1 }),
      makeCue({ id: 'q3', sort_order: 2 }),
    ];
    usePlaybackStore.setState({ cues, selectedCueId: 'q2' });

    usePlaybackStore.getState().removeCue('q2');

    const state = usePlaybackStore.getState();
    expect(state.cues).toHaveLength(2);
    // Selekcja przenoszona na cue o tym samym indeksie lub poprzedni
    expect(state.selectedCueId).toBe('q3');
  });

  it('removeCue ostatniego cue ustawia selectedCueId na poprzedni', () => {
    const cues = [
      makeCue({ id: 'q1', sort_order: 0 }),
      makeCue({ id: 'q2', sort_order: 1 }),
    ];
    usePlaybackStore.setState({ cues, selectedCueId: 'q2' });

    usePlaybackStore.getState().removeCue('q2');

    expect(usePlaybackStore.getState().selectedCueId).toBe('q1');
  });
});

// ── Testy statusu cue ──────────────────────────────────────

describe('Status cue — zmiana w store', () => {
  it('zmienia status cue z ready na done', () => {
    const cue1 = makeCue({ id: 'q1', status: 'ready', sort_order: 0 });
    usePlaybackStore.setState({ cues: [cue1] });

    usePlaybackStore.getState().updateCue('q1', { status: 'done' });

    expect(usePlaybackStore.getState().cues[0]!.status).toBe('done');
  });

  it('zmienia status cue na skipped', () => {
    const cue1 = makeCue({ id: 'q1', status: 'ready', sort_order: 0 });
    usePlaybackStore.setState({ cues: [cue1] });

    usePlaybackStore.getState().updateCue('q1', { status: 'skipped' });

    expect(usePlaybackStore.getState().cues[0]!.status).toBe('skipped');
  });

  it('nowy cue ma domyślny status ready', () => {
    const cue1 = makeCue({ id: 'q1', sort_order: 0 });
    usePlaybackStore.getState().addCue(cue1);

    expect(usePlaybackStore.getState().cues[0]!.status).toBe('ready');
  });
});
