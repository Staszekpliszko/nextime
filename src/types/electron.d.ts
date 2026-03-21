import type { EngineCue, EngineState } from '../../electron/playback-engine';
import type { Cue, CreateCueInput, UpdateCueInput } from '../../electron/db/repositories/cue.repo';
import type { Rundown, CreateRundownInput } from '../../electron/db/repositories/rundown.repo';
import type { Project } from '../../electron/db/repositories/project.repo';
import type { Act, CreateActInput, UpdateActInput } from '../../electron/db/repositories/act.repo';
import type { Track, CreateTrackInput, UpdateTrackInput } from '../../electron/db/repositories/track.repo';
import type { TimelineCue, CreateTimelineCueInput, UpdateTimelineCueInput } from '../../electron/db/repositories/timeline-cue.repo';
import type { AtemStatus } from '../../electron/senders/atem-sender';
import type { TextVariable, CreateTextVariableInput, UpdateTextVariableInput } from '../../electron/db/repositories/text-variable.repo';
import type { CueGroup, CreateCueGroupInput, UpdateCueGroupInput } from '../../electron/db/repositories/cue-group.repo';
import type { LtcReaderStatus } from '../../electron/senders/ltc-reader';
import type { CameraPreset, CreateCameraPresetInput, UpdateCameraPresetInput } from '../../electron/db/repositories/camera-preset.repo';
import type { MediaFile, CreateMediaFileInput } from '../../electron/db/repositories/media-file.repo';
import type { OutputConfig, CreateOutputConfigInput, UpdateOutputConfigInput } from '../../electron/db/repositories/output-config.repo';
import type { Column, CreateColumnInput, UpdateColumnInput, ColumnVisibility } from '../../electron/db/repositories/column.repo';
import type { Cell } from '../../electron/db/repositories/cell.repo';
import type { PrivateNote } from '../../electron/db/repositories/private-note.repo';

/** Rundown summary z IPC — lekki obiekt do listy */
export interface RundownSummary {
  id: string;
  name: string;
  status: string;
  show_date?: string;
  show_time?: string;
}

/** API exposowane przez preload.ts → contextBridge */
export interface NextimeApi {
  // ── Odczyt ──────────────────────────────────────────────
  getRundowns(): Promise<RundownSummary[]>;
  loadRundown(id: string): Promise<void>;
  getState(): Promise<EngineState>;
  getWsPort(): Promise<number>;
  getCues(rundownId: string): Promise<EngineCue[]>;
  getProjects(): Promise<Project[]>;

  // ── CRUD Cue ────────────────────────────────────────────
  createCue(input: CreateCueInput): Promise<Cue>;
  updateCue(id: string, input: UpdateCueInput): Promise<Cue | undefined>;
  deleteCue(id: string): Promise<boolean>;
  reorderCues(rundownId: string, cueIds: string[]): Promise<void>;

  // ── CRUD Rundown ────────────────────────────────────────
  createRundown(input: CreateRundownInput): Promise<Rundown>;
  deleteRundown(id: string): Promise<boolean>;

  // ── CRUD Act ────────────────────────────────────────────
  getActs(rundownId: string): Promise<Act[]>;
  createAct(input: CreateActInput): Promise<Act>;
  updateAct(id: string, input: UpdateActInput): Promise<Act | undefined>;
  deleteAct(id: string): Promise<boolean>;
  loadAct(actId: string): Promise<void>;

  // ── CRUD Track ──────────────────────────────────────────
  getTracks(actId: string): Promise<Track[]>;
  createTrack(input: CreateTrackInput): Promise<Track>;
  updateTrack(id: string, input: UpdateTrackInput): Promise<Track | undefined>;
  deleteTrack(id: string): Promise<boolean>;

  // ── CRUD TimelineCue ────────────────────────────────────
  getTimelineCues(actId: string): Promise<TimelineCue[]>;
  createTimelineCue(input: CreateTimelineCueInput): Promise<TimelineCue>;
  updateTimelineCue(id: string, input: UpdateTimelineCueInput): Promise<TimelineCue | undefined>;
  deleteTimelineCue(id: string): Promise<boolean>;

  // ── CRUD OutputConfig ──────────────────────────────────
  getOutputConfigs(rundownId: string): Promise<OutputConfig[]>;
  createOutputConfig(input: Omit<CreateOutputConfigInput, 'share_token'>): Promise<OutputConfig>;
  updateOutputConfig(id: string, input: UpdateOutputConfigInput): Promise<OutputConfig | undefined>;
  deleteOutputConfig(id: string): Promise<boolean>;
  getOutputConfigByToken(token: string): Promise<OutputConfig | undefined>;
  getColumns(rundownId: string): Promise<Column[]>;
  createColumn(input: CreateColumnInput): Promise<Column>;
  updateColumn(id: string, input: UpdateColumnInput): Promise<Column | undefined>;
  deleteColumn(id: string): Promise<boolean>;
  reorderColumns(rundownId: string, columnIds: string[]): Promise<void>;
  getCells(cueId: string): Promise<Cell[]>;
  updateCell(cueId: string, columnId: string, content: {
    content_type?: string;
    richtext?: unknown;
    dropdown_value?: string;
    file_ref?: string;
  }): Promise<Cell>;
  getHttpPort(): Promise<number>;

  // ── TextVariable (Faza 11) ───────────────────────────────
  getTextVariables(rundownId: string): Promise<TextVariable[]>;
  createTextVariable(input: CreateTextVariableInput): Promise<TextVariable>;
  updateTextVariable(id: string, input: UpdateTextVariableInput): Promise<TextVariable | undefined>;
  deleteTextVariable(id: string): Promise<boolean>;
  getTextVariableMap(rundownId: string): Promise<Record<string, string>>;

  // ── CueGroup (Faza 11) ─────────────────────────────────
  getCueGroups(rundownId: string): Promise<CueGroup[]>;
  createCueGroup(input: CreateCueGroupInput): Promise<CueGroup>;
  updateCueGroup(id: string, input: UpdateCueGroupInput): Promise<CueGroup | undefined>;
  deleteCueGroup(id: string): Promise<boolean>;

  // ── CameraPreset (Faza 10) ─────────────────────────────
  getCameraPresets(projectId: string): Promise<CameraPreset[]>;
  createCameraPreset(input: CreateCameraPresetInput): Promise<CameraPreset>;
  updateCameraPreset(id: string, input: UpdateCameraPresetInput): Promise<CameraPreset | undefined>;
  deleteCameraPreset(id: string): Promise<boolean>;

  // ── MediaFile (Faza 10) ───────────────────────────────
  getMediaFiles(actId: string): Promise<MediaFile[]>;
  createMediaFile(input: CreateMediaFileInput): Promise<MediaFile>;
  deleteMediaFile(id: string): Promise<boolean>;
  getMediaStatus(): Promise<{ playing: boolean; currentFile: string | null; volume: number }>;

  // ── LTC (Faza 10) ──────────────────────────────────────
  getLtcStatus(): Promise<LtcReaderStatus>;
  setLtcSource(source: string): Promise<void>;

  // ── Private Notes (Faza 13) ──────────────────────────────
  getPrivateNotes(rundownId: string): Promise<PrivateNote[]>;
  upsertPrivateNote(cueId: string, content: string): Promise<PrivateNote>;
  deletePrivateNote(cueId: string): Promise<boolean>;

  // ── Column Visibility (Faza 13) ─────────────────────────
  setColumnVisibility(columnId: string, hidden: boolean): Promise<ColumnVisibility>;
  getColumnVisibilities(rundownId: string): Promise<ColumnVisibility[]>;

  // ── Export / Import (Faza 15) ──────────────────────────
  exportRundown(rundownId: string): Promise<{ ok: boolean; filePath?: string; error?: string; canceled?: boolean }>;
  importRundown(): Promise<{ ok: boolean; rundownId?: string; error?: string; canceled?: boolean }>;

  // ── Undo / Redo (Faza 16) ──────────────────────────────
  undo(): Promise<{ ok: boolean; description: string; canUndo: boolean; canRedo: boolean }>;
  redo(): Promise<{ ok: boolean; description: string; canUndo: boolean; canRedo: boolean }>;
  getUndoState(): Promise<{ canUndo: boolean; canRedo: boolean; undoDescription: string; redoDescription: string }>;

  // ── ATEM ────────────────────────────────────────────────
  atemGetStatus(): Promise<AtemStatus>;
  atemConfigure(config: Record<string, unknown>): Promise<void>;
  atemConnect(): Promise<void>;
  atemDisconnect(): Promise<void>;
  atemCut(input: number): Promise<void>;
  atemPreview(input: number): Promise<void>;

  // ── OSC Sender (Faza 17) ────────────────────────────────
  oscTestSend(): Promise<{ ok: boolean; error?: string }>;
  oscGetConfig(): Promise<{ host: string; port: number; enabled: boolean }>;
  oscUpdateConfig(config: Record<string, unknown>): Promise<void>;

  // ── MIDI Sender (Faza 17) ───────────────────────────────
  midiListPorts(): Promise<Array<{ index: number; name: string }>>;
  midiOpenPort(portIndex: number): Promise<{ ok: boolean; error?: string }>;
  midiClosePort(): Promise<void>;
  midiTestSend(): Promise<{ ok: boolean; error?: string }>;
  midiGetConfig(): Promise<{ portName: string; defaultChannel: number; enabled: boolean }>;
  midiUpdateConfig(config: Record<string, unknown>): Promise<void>;
  midiIsAvailable(): Promise<boolean>;
}

declare global {
  interface Window {
    nextime: NextimeApi;
  }
}
