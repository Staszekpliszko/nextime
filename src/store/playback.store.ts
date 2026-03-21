import { create } from 'zustand';
import type { FPS } from '@/utils/timecode';

// ── Typy (zgodne z docs/ws-protocol.ts) ──────────────────────

/** Status cue w rundownie (Faza 14) */
export type CueStatus = 'ready' | 'standby' | 'done' | 'skipped';

/** Lekki opis cue — do wyświetlania w tabeli */
export interface CueSummary {
  id: string;
  title: string;
  subtitle: string;
  duration_ms: number;
  start_type: 'soft' | 'hard';
  hard_start_datetime?: string;
  auto_start: boolean;
  locked: boolean;
  background_color?: string;
  status: CueStatus;
  group_id?: string;
  sort_order: number;
}

/** TC profil rundown_ms — z timesnap payload */
export interface TcProfileRundownMs {
  tc_mode: 'rundown_ms';
  kickoff_ms: number;
  deadline_ms: number;
  last_stop_ms: number;
  is_playing: boolean;
}

/** TC profil timeline_frames — z timesnap payload */
export interface TcProfileTimelineFrames {
  tc_mode: 'timeline_frames';
  current_frames: number;
  act_duration_frames: number;
  fps: FPS;
  ltc_source: 'internal' | 'ltc' | 'mtc' | 'manual';
  is_playing: boolean;
}

/** Timesnap payload z serwera WS — rundown_ms profil */
export interface TimesnapRundownMs {
  tc_mode: 'rundown_ms';
  tc: TcProfileRundownMs;
  rundown_id: string;
  rundown_cue_id: string;
  next_cue_id?: string;
  over_under_ms: number;
  next_hard_start_ms?: number;
  next_hard_start_cue_id?: string;
}

/** Timesnap payload z serwera WS — timeline_frames profil */
export interface TimesnapTimelineFrames {
  tc_mode: 'timeline_frames';
  tc: TcProfileTimelineFrames;
  act_id: string;
  active_cue_id?: string;
  next_cue_id?: string;
  active_camera_number?: number;
  speed: number;
  step_mode: boolean;
  hold_mode: boolean;
  active_lyric_text?: string;
}

/** Unified timesnap — discriminated union */
export type TimesnapPayload = TimesnapRundownMs | TimesnapTimelineFrames;

/** Rundown summary — do listy w sidebar */
export interface RundownSummary {
  id: string;
  name: string;
  status: string;
  show_date?: string;
  show_time?: string;
}

/** Pojedyncza zmiana w rundownie (z WS rundown:delta) */
export type RundownChange =
  | { op: 'cue_added'; cue: CueSummary }
  | { op: 'cue_updated'; cue: CueSummary }
  | { op: 'cue_deleted'; cue_id: string }
  | { op: 'cue_moved'; cue_id: string; new_order: number; new_group_id?: string }
  | { op: 'group_added'; group: { id: string; label: string; sort_order: number } }
  | { op: 'group_deleted'; group_id: string }
  | { op: 'variable_changed'; variable: { key: string; value: string } }
  | { op: 'column_added'; column: { id: string; name: string; type: string; sort_order: number } }
  | { op: 'column_deleted'; column_id: string }
  | { op: 'cell_updated'; cue_id: string; column_id: string; richtext?: unknown; dropdown_value?: string };

// ── Timeline typy ────────────────────────────────────────────

/** Skrót Act do UI */
export interface ActSummary {
  id: string;
  name: string;
  artist?: string;
  duration_frames: number;
  fps: FPS;
  status: string;
  color: string;
  sort_order: number;
}

/** Track info do UI */
export interface TrackSummary {
  id: string;
  act_id: string;
  type: string;
  name: string;
  sort_order: number;
  enabled: boolean;
  height_px: number;
}

/** TimelineCue do UI */
export interface TimelineCueSummary {
  id: string;
  track_id: string;
  act_id: string;
  type: string;
  tc_in_frames: number;
  tc_out_frames?: number;
  z_order: number;
  data: Record<string, unknown>;
}

/** Vision cue summary do UI */
export interface VisionCueSummary {
  id: string;
  tc_in_frames: number;
  tc_out_frames?: number;
  camera_number: number;
  shot_name: string;
  color: string;
}

// ── Text Variable typy ────────────────────────────────────────
export interface TextVariableInfo {
  id: string;
  rundown_id: string;
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}

// ── Cue Group typy ────────────────────────────────────────────
export interface CueGroupInfo {
  id: string;
  rundown_id: string;
  label: string;
  sort_order: number;
  collapsed: boolean;
  color?: string;
}

// ── Column & Cell typy (Faza 12) ─────────────────────────────
export interface ColumnInfo {
  id: string;
  rundown_id: string;
  name: string;
  type: 'richtext' | 'dropdown' | 'script';
  sort_order: number;
  width_px: number;
  dropdown_options?: string[];
  is_script: boolean;
}

export interface CellContent {
  content_type: 'richtext' | 'dropdown_value' | 'file_ref';
  richtext?: unknown;
  dropdown_value?: string;
  file_ref?: string;
}

// ── Connected Client typy ────────────────────────────────────
export interface ConnectedClientInfo {
  session_id: string;
  client_type: string;
  connected_at: string;
  camera_filter?: number;
}

// ── Output Config typy ────────────────────────────────────────

export interface OutputConfigSummary {
  id: string;
  rundown_id: string;
  name: string;
  layout: 'list' | 'single' | 'prompter';
  column_id?: string;
  share_token: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Store ────────────────────────────────────────────────────

/** Aktywny tryb widoku */
export type ViewMode = 'rundown' | 'timeline';

export interface PlaybackState {
  // Dane z serwera WS
  playback: TimesnapPayload | null;
  currentCue: CueSummary | null;
  nextCue: CueSummary | null;
  cues: CueSummary[];
  clockDrift: number;
  connected: boolean;
  reconnecting: boolean;

  // UI state — Rundown
  selectedCueId: string | null;
  rundowns: RundownSummary[];
  activeRundownId: string | null;

  // UI state — Tryb widoku
  viewMode: ViewMode;

  // Timeline state
  acts: ActSummary[];
  activeActId: string | null;
  tracks: TrackSummary[];
  timelineCues: TimelineCueSummary[];
  activeVisionCue: VisionCueSummary | null;
  nextVisionCue: VisionCueSummary | null;
  currentTcFrames: number;
  fps: FPS;
  selectedTimelineCueId: string | null;

  // Faza 6: nowe pola timeline playback
  stepMode: boolean;
  holdMode: boolean;
  speed: number;
  activeLyricText: string | null;
  activeMarker: { label: string; color: string; cueId: string } | null;
  lastTimesnapAt: number;
  lastTimesnapFrames: number;

  // Faza 10: LTC source
  ltcSource: 'internal' | 'ltc' | 'mtc' | 'manual';

  // Faza 9: Output Configs
  outputConfigs: OutputConfigSummary[];

  // Faza 11: Text Variables + Cue Groups + Connected clients
  textVariables: TextVariableInfo[];
  cueGroups: CueGroupInfo[];
  connectedClients: ConnectedClientInfo[];

  // Faza 12: Columns + Cells
  columns: ColumnInfo[];
  cells: Record<string, Record<string, CellContent>>; // cue_id → column_id → content

  // Faza 13: Prywatne notatki + Widoczność kolumn
  privateNotes: Record<string, string>; // cue_id → treść notatki
  hiddenColumnIds: Set<string>; // ID kolumn ukrytych przez użytkownika

  // Faza 8: ATEM state
  atemConnected: boolean;
  atemProgramInput: number | null;
  atemPreviewInput: number | null;
  atemAutoSwitch: boolean;
  atemModelName: string | null;

  // Actions — odtwarzanie
  setPlayback: (payload: TimesnapPayload | null) => void;
  setCurrentCue: (cue: CueSummary | null) => void;
  setNextCue: (cue: CueSummary | null) => void;
  setCues: (cues: CueSummary[]) => void;
  setClockDrift: (drift: number) => void;
  setConnected: (connected: boolean) => void;
  setReconnecting: (reconnecting: boolean) => void;

  // Actions — UI state
  setSelectedCueId: (id: string | null) => void;
  setRundowns: (rundowns: RundownSummary[]) => void;
  setActiveRundownId: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;

  // Actions — CRUD cue (lokalna aktualizacja store po IPC)
  addCue: (cue: CueSummary) => void;
  updateCue: (id: string, partial: Partial<CueSummary>) => void;
  removeCue: (id: string) => void;
  reorderCues: (cueIds: string[]) => void;

  // Actions — WS delta (zdalne zmiany od innych klientów)
  applyDelta: (changes: RundownChange[]) => void;

  // Actions — Faza 6: nowe akcje timeline playback
  setStepMode: (v: boolean) => void;
  setHoldMode: (v: boolean) => void;
  setSpeed: (v: number) => void;
  setActiveLyricText: (t: string | null) => void;
  setActiveMarker: (m: { label: string; color: string; cueId: string } | null) => void;

  // Actions — Faza 10: LTC
  setLtcSource: (source: 'internal' | 'ltc' | 'mtc' | 'manual') => void;

  // Actions — Faza 9: Output Configs
  setOutputConfigs: (configs: OutputConfigSummary[]) => void;
  addOutputConfig: (config: OutputConfigSummary) => void;
  updateOutputConfig: (id: string, partial: Partial<OutputConfigSummary>) => void;
  removeOutputConfig: (id: string) => void;

  // Actions — Faza 11: Text Variables + Cue Groups + Connected clients
  setTextVariables: (vars: TextVariableInfo[]) => void;
  addTextVariable: (v: TextVariableInfo) => void;
  updateTextVariable: (id: string, partial: Partial<TextVariableInfo>) => void;
  removeTextVariable: (id: string) => void;
  setCueGroups: (groups: CueGroupInfo[]) => void;
  addCueGroup: (group: CueGroupInfo) => void;
  updateCueGroup: (id: string, partial: Partial<CueGroupInfo>) => void;
  removeCueGroup: (id: string) => void;
  toggleCueGroupCollapsed: (id: string) => void;
  setConnectedClients: (clients: ConnectedClientInfo[]) => void;

  // Actions — Faza 12: Columns + Cells
  setColumns: (columns: ColumnInfo[]) => void;
  addColumn: (column: ColumnInfo) => void;
  updateColumnInStore: (id: string, partial: Partial<ColumnInfo>) => void;
  removeColumn: (id: string) => void;
  setCellContent: (cueId: string, columnId: string, content: CellContent) => void;
  setCellsForCue: (cueId: string, cells: Array<{ column_id: string } & CellContent>) => void;

  // Actions — Faza 13: Prywatne notatki + Widoczność kolumn
  setPrivateNotes: (notes: Record<string, string>) => void;
  upsertPrivateNote: (cueId: string, content: string) => void;
  removePrivateNote: (cueId: string) => void;
  setHiddenColumnIds: (ids: Set<string>) => void;
  toggleColumnVisibility: (columnId: string) => void;

  // Actions — Faza 8: ATEM
  setAtemStatus: (status: { connected: boolean; programInput: number | null; previewInput: number | null; modelName: string | null }) => void;
  setAtemAutoSwitch: (v: boolean) => void;

  // Actions — Timeline
  setActs: (acts: ActSummary[]) => void;
  setActiveActId: (id: string | null) => void;
  setTracks: (tracks: TrackSummary[]) => void;
  setTimelineCues: (cues: TimelineCueSummary[]) => void;
  setActiveVisionCue: (cue: VisionCueSummary | null) => void;
  setNextVisionCue: (cue: VisionCueSummary | null) => void;
  setCurrentTcFrames: (frames: number) => void;
  setFps: (fps: FPS) => void;
  setSelectedTimelineCueId: (id: string | null) => void;
  addTimelineCue: (cue: TimelineCueSummary) => void;
  updateTimelineCue: (id: string, partial: Partial<TimelineCueSummary>) => void;
  removeTimelineCue: (id: string) => void;

  // Actions — CRUD Act/Track (lokalna aktualizacja store po IPC)
  addAct: (act: ActSummary) => void;
  updateAct: (id: string, partial: Partial<ActSummary>) => void;
  removeAct: (id: string) => void;
  addTrack: (track: TrackSummary) => void;
  removeTrack: (id: string) => void;
}

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  playback: null,
  currentCue: null,
  nextCue: null,
  cues: [],
  clockDrift: 0,
  connected: false,
  reconnecting: false,

  // UI state
  selectedCueId: null,
  rundowns: [],
  activeRundownId: null,
  viewMode: 'rundown',

  // Timeline state
  acts: [],
  activeActId: null,
  tracks: [],
  timelineCues: [],
  activeVisionCue: null,
  nextVisionCue: null,
  currentTcFrames: 0,
  fps: 25,
  selectedTimelineCueId: null,

  // Faza 6: nowe pola
  stepMode: false,
  holdMode: false,
  speed: 1.0,
  activeLyricText: null,
  activeMarker: null,
  lastTimesnapAt: 0,
  lastTimesnapFrames: 0,

  // Faza 10: LTC source
  ltcSource: 'internal' as const,

  // Faza 9: Output Configs
  outputConfigs: [],

  // Faza 11: Text Variables + Cue Groups + Connected clients
  textVariables: [],
  cueGroups: [],
  connectedClients: [],

  // Faza 12: Columns + Cells
  columns: [],
  cells: {},

  // Faza 13: Prywatne notatki + Widoczność kolumn
  privateNotes: {},
  hiddenColumnIds: new Set<string>(),

  // Faza 8: ATEM state
  atemConnected: false,
  atemProgramInput: null,
  atemPreviewInput: null,
  atemAutoSwitch: true,
  atemModelName: null,

  // ── Odtwarzanie ────────────────────────────────────────

  setPlayback: (payload) => {
    if (!payload) {
      set({ playback: null, currentCue: null, nextCue: null });
      return;
    }

    if (payload.tc_mode === 'rundown_ms') {
      const { cues } = get();
      const currentCue = cues.find(c => c.id === payload.rundown_cue_id) ?? null;
      const nextCue = payload.next_cue_id
        ? (cues.find(c => c.id === payload.next_cue_id) ?? null)
        : null;
      set({ playback: payload, currentCue, nextCue });
    } else if (payload.tc_mode === 'timeline_frames') {
      // Timeline mode — zaktualizuj frame position, vision cue i nowe pola Fazy 6+10
      set({
        playback: payload,
        currentTcFrames: payload.tc.current_frames,
        fps: payload.tc.fps,
        speed: payload.speed,
        stepMode: payload.step_mode,
        holdMode: payload.hold_mode,
        activeLyricText: payload.active_lyric_text ?? null,
        ltcSource: payload.tc.ltc_source,
        lastTimesnapAt: Date.now(),
        lastTimesnapFrames: payload.tc.current_frames,
      });
    }
  },

  setCurrentCue: (cue) => set({ currentCue: cue }),
  setNextCue: (cue) => set({ nextCue: cue }),
  setCues: (cues) => set({ cues }),
  setClockDrift: (drift) => set({ clockDrift: drift }),
  setConnected: (connected) => set({ connected, reconnecting: connected ? false : get().reconnecting }),
  setReconnecting: (reconnecting) => set({ reconnecting }),

  // ── UI state ───────────────────────────────────────────

  setSelectedCueId: (id) => set({ selectedCueId: id }),
  setRundowns: (rundowns) => set({ rundowns }),
  setActiveRundownId: (id) => set({ activeRundownId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),

  // ── CRUD cue (lokalna aktualizacja) ────────────────────

  addCue: (cue) => {
    const { cues } = get();
    if (cues.some(c => c.id === cue.id)) return;
    const newCues = [...cues, cue].sort((a, b) => a.sort_order - b.sort_order);
    set({ cues: newCues });
  },

  updateCue: (id, partial) => {
    const { cues } = get();
    const newCues = cues.map(c =>
      c.id === id ? { ...c, ...partial } : c,
    );
    set({ cues: newCues });
  },

  removeCue: (id) => {
    const { cues, selectedCueId } = get();
    const newCues = cues.filter(c => c.id !== id);
    let newSelectedId = selectedCueId;
    if (selectedCueId === id) {
      const removedIndex = cues.findIndex(c => c.id === id);
      const nextCue = newCues[removedIndex] ?? newCues[removedIndex - 1] ?? null;
      newSelectedId = nextCue?.id ?? null;
    }
    set({ cues: newCues, selectedCueId: newSelectedId });
  },

  reorderCues: (cueIds) => {
    const { cues } = get();
    const cueMap = new Map(cues.map(c => [c.id, c]));
    const reordered = cueIds
      .map((id, index) => {
        const cue = cueMap.get(id);
        if (!cue) return null;
        return { ...cue, sort_order: index };
      })
      .filter((c): c is CueSummary => c !== null);
    set({ cues: reordered });
  },

  // ── WS delta (zdalne zmiany) ───────────────────────────

  applyDelta: (changes) => {
    const { cues } = get();
    let newCues = [...cues];

    for (const change of changes) {
      switch (change.op) {
        case 'cue_added': {
          if (!newCues.some(c => c.id === change.cue.id)) {
            newCues.push(change.cue);
          }
          break;
        }
        case 'cue_updated': {
          newCues = newCues.map(c =>
            c.id === change.cue.id ? { ...c, ...change.cue } : c,
          );
          break;
        }
        case 'cue_deleted': {
          newCues = newCues.filter(c => c.id !== change.cue_id);
          break;
        }
        case 'cue_moved': {
          newCues = newCues.map(c =>
            c.id === change.cue_id
              ? { ...c, sort_order: change.new_order, group_id: change.new_group_id ?? c.group_id }
              : c,
          );
          break;
        }
        case 'group_added': {
          const { cueGroups } = get();
          if (!cueGroups.some(g => g.id === change.group.id)) {
            set({ cueGroups: [...cueGroups, { ...change.group, rundown_id: '', collapsed: false }].sort((a, b) => a.sort_order - b.sort_order) });
          }
          break;
        }
        case 'group_deleted': {
          const { cueGroups: currentGroups } = get();
          set({ cueGroups: currentGroups.filter(g => g.id !== change.group_id) });
          break;
        }
        case 'variable_changed': {
          const { textVariables } = get();
          const existing = textVariables.find(v => v.key === change.variable.key);
          if (existing) {
            set({ textVariables: textVariables.map(v => v.key === change.variable.key ? { ...v, value: change.variable.value } : v) });
          }
          break;
        }
        case 'column_added': {
          const { columns } = get();
          if (!columns.some(c => c.id === change.column.id)) {
            const newCol: ColumnInfo = {
              id: change.column.id,
              rundown_id: '',
              name: change.column.name,
              type: change.column.type as ColumnInfo['type'],
              sort_order: change.column.sort_order,
              width_px: 200,
              is_script: false,
            };
            set({ columns: [...columns, newCol].sort((a, b) => a.sort_order - b.sort_order) });
          }
          break;
        }
        case 'column_deleted': {
          const { columns: currentCols } = get();
          set({ columns: currentCols.filter(c => c.id !== change.column_id) });
          break;
        }
        case 'cell_updated': {
          const { cells } = get();
          const cueCells = cells[change.cue_id] ?? {};
          const updated: CellContent = {
            content_type: change.richtext !== undefined ? 'richtext' : (change.dropdown_value !== undefined ? 'dropdown_value' : 'richtext'),
            richtext: change.richtext,
            dropdown_value: change.dropdown_value,
          };
          set({ cells: { ...cells, [change.cue_id]: { ...cueCells, [change.column_id]: updated } } });
          break;
        }
      }
    }

    newCues.sort((a, b) => a.sort_order - b.sort_order);
    set({ cues: newCues });
  },

  // ── Faza 6: nowe akcje ─────────────────────────────────

  setStepMode: (v) => set({ stepMode: v }),
  setHoldMode: (v) => set({ holdMode: v }),
  setSpeed: (v) => set({ speed: v }),
  setActiveLyricText: (t) => set({ activeLyricText: t }),
  setActiveMarker: (m) => set({ activeMarker: m }),

  // ── Faza 10: LTC ─────────────────────────────────────────
  setLtcSource: (source) => set({ ltcSource: source }),

  // ── Faza 9: Output Configs ─────────────────────────────
  setOutputConfigs: (configs) => set({ outputConfigs: configs }),

  addOutputConfig: (config) => {
    const { outputConfigs } = get();
    if (outputConfigs.some(c => c.id === config.id)) return;
    set({ outputConfigs: [...outputConfigs, config] });
  },

  updateOutputConfig: (id, partial) => {
    const { outputConfigs } = get();
    set({ outputConfigs: outputConfigs.map(c => c.id === id ? { ...c, ...partial } : c) });
  },

  removeOutputConfig: (id) => {
    const { outputConfigs } = get();
    set({ outputConfigs: outputConfigs.filter(c => c.id !== id) });
  },

  // ── Faza 11: Text Variables ──────────────────────────────
  setTextVariables: (vars) => set({ textVariables: vars }),
  addTextVariable: (v) => {
    const { textVariables } = get();
    if (textVariables.some(tv => tv.id === v.id)) return;
    set({ textVariables: [...textVariables, v] });
  },
  updateTextVariable: (id, partial) => {
    const { textVariables } = get();
    set({ textVariables: textVariables.map(v => v.id === id ? { ...v, ...partial } : v) });
  },
  removeTextVariable: (id) => {
    const { textVariables } = get();
    set({ textVariables: textVariables.filter(v => v.id !== id) });
  },

  // ── Faza 11: Cue Groups ────────────────────────────────
  setCueGroups: (groups) => set({ cueGroups: groups }),
  addCueGroup: (group) => {
    const { cueGroups } = get();
    if (cueGroups.some(g => g.id === group.id)) return;
    set({ cueGroups: [...cueGroups, group].sort((a, b) => a.sort_order - b.sort_order) });
  },
  updateCueGroup: (id, partial) => {
    const { cueGroups } = get();
    set({ cueGroups: cueGroups.map(g => g.id === id ? { ...g, ...partial } : g) });
  },
  removeCueGroup: (id) => {
    const { cueGroups } = get();
    set({ cueGroups: cueGroups.filter(g => g.id !== id) });
  },
  toggleCueGroupCollapsed: (id) => {
    const { cueGroups } = get();
    set({ cueGroups: cueGroups.map(g => g.id === id ? { ...g, collapsed: !g.collapsed } : g) });
  },

  // ── Faza 11: Connected clients ───────────────────────────
  setConnectedClients: (clients) => set({ connectedClients: clients }),

  // ── Faza 12: Columns + Cells ─────────────────────────────
  setColumns: (columns) => set({ columns }),
  addColumn: (column) => {
    const { columns } = get();
    if (columns.some(c => c.id === column.id)) return;
    set({ columns: [...columns, column].sort((a, b) => a.sort_order - b.sort_order) });
  },
  updateColumnInStore: (id, partial) => {
    const { columns } = get();
    set({ columns: columns.map(c => c.id === id ? { ...c, ...partial } : c) });
  },
  removeColumn: (id) => {
    const { columns } = get();
    set({ columns: columns.filter(c => c.id !== id) });
  },
  setCellContent: (cueId, columnId, content) => {
    const { cells } = get();
    const cueCells = cells[cueId] ?? {};
    set({ cells: { ...cells, [cueId]: { ...cueCells, [columnId]: content } } });
  },
  setCellsForCue: (cueId, cellList) => {
    const { cells } = get();
    const cueCells: Record<string, CellContent> = {};
    for (const cell of cellList) {
      cueCells[cell.column_id] = {
        content_type: cell.content_type,
        richtext: cell.richtext,
        dropdown_value: cell.dropdown_value,
        file_ref: cell.file_ref,
      };
    }
    set({ cells: { ...cells, [cueId]: cueCells } });
  },

  // ── Faza 13: Prywatne notatki + Widoczność kolumn ──────
  setPrivateNotes: (notes) => set({ privateNotes: notes }),
  upsertPrivateNote: (cueId, content) => set((state) => ({
    privateNotes: { ...state.privateNotes, [cueId]: content },
  })),
  removePrivateNote: (cueId) => set((state) => {
    const { [cueId]: _, ...rest } = state.privateNotes;
    return { privateNotes: rest };
  }),
  setHiddenColumnIds: (ids) => set({ hiddenColumnIds: ids }),
  toggleColumnVisibility: (columnId) => set((state) => {
    const next = new Set(state.hiddenColumnIds);
    if (next.has(columnId)) {
      next.delete(columnId);
    } else {
      next.add(columnId);
    }
    return { hiddenColumnIds: next };
  }),

  // ── Faza 8: ATEM ───────────────────────────────────────
  setAtemStatus: (status) => set({
    atemConnected: status.connected,
    atemProgramInput: status.programInput,
    atemPreviewInput: status.previewInput,
    atemModelName: status.modelName,
  }),
  setAtemAutoSwitch: (v) => set({ atemAutoSwitch: v }),

  // ── Timeline ───────────────────────────────────────────

  setActs: (acts) => set({ acts }),
  setActiveActId: (id) => set({ activeActId: id }),
  setTracks: (tracks) => set({ tracks }),
  setTimelineCues: (cues) => set({ timelineCues: cues }),
  setActiveVisionCue: (cue) => set({ activeVisionCue: cue }),
  setNextVisionCue: (cue) => set({ nextVisionCue: cue }),
  setCurrentTcFrames: (frames) => set({ currentTcFrames: frames }),
  setFps: (fps) => set({ fps }),
  setSelectedTimelineCueId: (id) => set({ selectedTimelineCueId: id }),

  // ── CRUD Act (lokalna aktualizacja) ─────────────────────

  addAct: (act) => {
    const { acts } = get();
    if (acts.some(a => a.id === act.id)) return;
    const newActs = [...acts, act].sort((a, b) => a.sort_order - b.sort_order);
    set({ acts: newActs });
  },

  updateAct: (id, partial) => {
    const { acts } = get();
    const newActs = acts.map(a =>
      a.id === id ? { ...a, ...partial } : a,
    );
    set({ acts: newActs });
  },

  removeAct: (id) => {
    const { acts, activeActId } = get();
    const newActs = acts.filter(a => a.id !== id);
    // Jeśli usuwany akt to aktywny — wyczyść stan timeline
    if (id === activeActId) {
      set({
        acts: newActs,
        activeActId: null,
        tracks: [],
        timelineCues: [],
        activeVisionCue: null,
        nextVisionCue: null,
        selectedTimelineCueId: null,
      });
    } else {
      set({ acts: newActs });
    }
  },

  // ── CRUD Track (lokalna aktualizacja) ───────────────────

  addTrack: (track) => {
    const { tracks } = get();
    if (tracks.some(t => t.id === track.id)) return;
    const newTracks = [...tracks, track].sort((a, b) => a.sort_order - b.sort_order);
    set({ tracks: newTracks });
  },

  removeTrack: (id) => {
    const { tracks, timelineCues, selectedTimelineCueId } = get();
    const newTracks = tracks.filter(t => t.id !== id);
    const newTimelineCues = timelineCues.filter(c => c.track_id !== id);
    // Wyczyść selekcję jeśli usunięty cue był zaznaczony
    const newSelectedId = newTimelineCues.some(c => c.id === selectedTimelineCueId)
      ? selectedTimelineCueId
      : null;
    set({ tracks: newTracks, timelineCues: newTimelineCues, selectedTimelineCueId: newSelectedId });
  },

  addTimelineCue: (cue) => {
    const { timelineCues } = get();
    if (timelineCues.some(c => c.id === cue.id)) return;
    const newCues = [...timelineCues, cue].sort((a, b) => a.tc_in_frames - b.tc_in_frames);
    set({ timelineCues: newCues });
  },

  updateTimelineCue: (id, partial) => {
    const { timelineCues } = get();
    const newCues = timelineCues.map(c =>
      c.id === id ? { ...c, ...partial } : c,
    );
    set({ timelineCues: newCues });
  },

  removeTimelineCue: (id) => {
    const { timelineCues } = get();
    set({ timelineCues: timelineCues.filter(c => c.id !== id) });
  },
}));
