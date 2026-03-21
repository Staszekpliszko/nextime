// ============================================================
//  BROADCAST RUNDOWN APP — TypeScript Types v2
//  Odzwierciedla schemat SQLite schema.sql 1:1
//
//  Konwencje:
//    • Pola opcjonalne: `field?: Type`  (NULL w SQLite)
//    • Booleans:        SQLite INTEGER(0/1) → TS boolean (konwersja w repo layer)
//    • Timestamps:      string ISO-8601 ("2025-05-17T20:30:00.000Z")
//    • JSON pola:       osobne, ściśle typowane interfejsy
//    • Enumy:           union types zamiast enum (lepszy DX, tree-shaking)
// ============================================================


// ─────────────────────────────────────────────────────────────
//  PRYMITYWY I ALIASY
// ─────────────────────────────────────────────────────────────

/** UUID v4 jako string — "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx" */
type UUID = string;

/** ISO-8601 timestamp — "2025-05-17T20:30:00.000Z" */
type ISODateTime = string;

/** ISO-8601 date — "2025-05-17" */
type ISODate = string;

/** ISO-8601 time — "20:30:00" */
type ISOTime = string;

/** Kolor hex — "#FF5722" */
type HexColor = string;

/** Czas trwania w milisekundach (Rundown Studio-mode) */
type Milliseconds = number;

/** Pozycja na osi czasu w klatkach (CuePilot/Timeline-mode) */
type Frames = number;

/** Frames per second */
type FPS = 24 | 25 | 29 | 30 | 50 | 60;

/** Kanały vision switchera */
type SwitcherChannel = 'PGM' | 'ME1' | 'ME2' | 'AUX1' | 'AUX2' | 'AUX3';


// ─────────────────────────────────────────────────────────────
//  POZIOM 0: USER
// ─────────────────────────────────────────────────────────────

export interface User {
  id:            UUID;
  name:          string;
  email:         string;
  password_hash: string;       // bcrypt — nigdy nie wysyłamy do klienta
  avatar_url?:   string;
  created_at:    ISODateTime;
  updated_at:    ISODateTime;
}

/** Bezpieczna wersja User — bez hash hasła, do wysyłki przez API/WebSocket */
export type PublicUser = Omit<User, 'password_hash'>;

/** Skrót do wyświetlenia avatara i imienia */
export type UserRef = Pick<User, 'id' | 'name' | 'avatar_url'>;


// ─────────────────────────────────────────────────────────────
//  POZIOM 0: EVENT
// ─────────────────────────────────────────────────────────────

export interface Event {
  id:          UUID;
  owner_id:    UUID;
  name:        string;
  slug:        string;
  logo_url?:   string;
  description?: string;
  created_at:  ISODateTime;
  updated_at:  ISODateTime;
}

export interface EventGuest {
  id:          UUID;
  event_id:    UUID;
  share_token: string;         // losowy token w URL — /share/[token]
  label?:      string;         // np. "Link dla klienta"
  expires_at?: ISODateTime;    // undefined = nie wygasa
  created_at:  ISODateTime;
}


// ─────────────────────────────────────────────────────────────
//  POZIOM 1: PROJECT
// ─────────────────────────────────────────────────────────────

export type ProjectType   = 'SOLO' | 'MINI' | 'PRO' | 'MAX';
export type ProjectStatus = 'draft' | 'active' | 'archived';
export type MemberRole    = 'owner' | 'admin' | 'editor' | 'viewer';

export interface Project {
  id:          UUID;
  event_id?:   UUID;
  owner_id:    UUID;
  name:        string;
  slug:        string;
  type:        ProjectType;
  status:      ProjectStatus;
  timezone:    string;         // np. "Europe/Warsaw"
  default_fps: FPS;
  description?: string;
  created_at:  ISODateTime;
  updated_at:  ISODateTime;
}

export interface ProjectMember {
  id:         UUID;
  project_id: UUID;
  user_id:    UUID;
  role:       MemberRole;
  invited_by?: UUID;
  joined_at:  ISODateTime;
}

export interface CameraPreset {
  id:              UUID;
  project_id:      UUID;
  number:          number;       // 1–16
  label:           string;       // np. "Steadicam", "Cam A"
  color:           HexColor;     // kolor bloków na timeline
  default_channel: SwitcherChannel;
  operator_name?:  string;
}


// ─────────────────────────────────────────────────────────────
//  POZIOM 2: RUNDOWN
// ─────────────────────────────────────────────────────────────

export type RundownStatus = 'draft' | 'approved' | 'live' | 'done';

export interface Rundown {
  id:          UUID;
  project_id:  UUID;
  event_id?:   UUID;
  name:        string;
  show_date?:  ISODate;        // "2025-05-17"
  show_time?:  ISOTime;        // "20:00:00"
  status:      RundownStatus;
  sort_order:  number;
  venue?:      string;
  default_fps?: FPS;           // undefined = dziedziczy z Project
  notes?:      string;
  created_at:  ISODateTime;
  updated_at:  ISODateTime;
}


// ─────────────────────────────────────────────────────────────
//  POZIOM 2: COLUMN + CELL
// ─────────────────────────────────────────────────────────────

export type ColumnType = 'richtext' | 'dropdown' | 'script';

export interface Column {
  id:                UUID;
  rundown_id:        UUID;
  name:              string;
  type:              ColumnType;
  sort_order:        number;
  width_px:          number;
  dropdown_options?: string[];   // opcje dla type === 'dropdown'
  is_script:         boolean;    // true = używana przez prompter
}

export interface ColumnVisibility {
  id:        UUID;
  column_id: UUID;
  user_id:   UUID;
  hidden:    boolean;            // true = ukryta TYLKO dla tego usera
}

// ── Cell content types ──────────────────────────────────────

export type CellContentType = 'richtext' | 'dropdown_value' | 'file_ref';

/**
 * ProseMirror/TipTap JSON document node.
 * Minimalna definicja — rozszerz o pełne typy TipTap jeśli używasz biblioteki.
 */
export interface RichtextDoc {
  type:     'doc';
  content?: RichtextNode[];
}

export interface RichtextNode {
  type:     string;              // "paragraph", "text", "hardBreak", "bulletList", itd.
  text?:    string;
  content?: RichtextNode[];
  marks?:   RichtextMark[];
  attrs?:   Record<string, unknown>;
}

export interface RichtextMark {
  type:   string;                // "bold", "italic", "highlight", "textVariable"
  attrs?: Record<string, unknown>;
}

/**
 * Specjalny mark wstawiany przy użyciu $zmienna w komórce.
 * type = "textVariable", attrs.key = klucz TextVariable.
 */
export interface TextVariableMark extends RichtextMark {
  type:  'textVariable';
  attrs: { key: string };
}

/** Cell — zawartość komórki (cue × kolumna) */
export interface Cell {
  id:              UUID;
  cue_id:          UUID;
  column_id:       UUID;
  content_type:    CellContentType;
  richtext?:       RichtextDoc;    // gdy content_type === 'richtext'
  dropdown_value?: string;         // gdy content_type === 'dropdown_value'
  file_ref?:       string;         // ścieżka do pliku gdy content_type === 'file_ref'
  updated_at:      ISODateTime;
}

/** Prywatna notatka — widoczna TYLKO dla jednego usera */
export interface PrivateNote {
  id:         UUID;
  cue_id:     UUID;
  user_id:    UUID;
  content:    string;
  updated_at: ISODateTime;
}


// ─────────────────────────────────────────────────────────────
//  POZIOM 2: TEXT VARIABLES
// ─────────────────────────────────────────────────────────────

export interface TextVariable {
  id:          UUID;
  rundown_id:  UUID;
  /** Tylko [a-z0-9-], np. "host-name", "venue-city" */
  key:         string;
  value:       string;
  description?: string;
  updated_at:  ISODateTime;
}

/** Mapa klucz→wartość do szybkiego lookup przy renderowaniu komórek */
export type TextVariableMap = Record<string, string>;


// ─────────────────────────────────────────────────────────────
//  POZIOM 2: OUTPUT CONFIG
// ─────────────────────────────────────────────────────────────

export type OutputLayout = 'list' | 'single' | 'prompter';

/** Ustawienia wyjścia — serializowane do JSON w polu settings */
export interface OutputSettings {
  // Wspólne
  logo?:              'on' | 'off' | string;    // string = URL własnego logo
  background_color?:  HexColor | 'transparent';
  header_position?:   'top' | 'bottom';
  time_of_day?:       'on' | 'off';
  over_under?:        'on' | 'off';
  progress_bar?:      'on' | 'off';
  rundown_title?:     'on' | 'off';
  cue_background_colors?: 'on' | 'off';
  start_times?:       'on' | 'off';
  end_times?:         'on' | 'off';
  last_five_seconds?: 'on' | 'off';
  mirror?:            'off' | 'vertical' | 'horizontal' | 'vertical,horizontal';

  // Single cue layout
  large_time_of_day?: 'on' | 'off';
  next_cue?:          'on' | 'off';

  // Prompter
  prompter_speed?:      number;    // px/s
  prompter_text_size?:  number;    // px
  prompter_margin?:     number;    // px L+R
  prompter_indicator?:  number;    // % od góry
  prompter_uppercase?:  boolean;
  prompter_invert?:     boolean;
  prompter_show_cue_details?: boolean;
  prompter_auto_scroll?: boolean;
}

export interface OutputConfig {
  id:          UUID;
  rundown_id:  UUID;
  name:        string;
  layout:      OutputLayout;
  column_id?:  UUID;              // kolumna script dla promptera
  share_token: string;
  settings:    OutputSettings;
  created_at:  ISODateTime;
  updated_at:  ISODateTime;
}


// ─────────────────────────────────────────────────────────────
//  POZIOM 3: CUE GROUP + CUE
// ─────────────────────────────────────────────────────────────

export interface CueGroup {
  id:         UUID;
  rundown_id: UUID;
  label:      string;
  sort_order: number;
  collapsed:  boolean;
  color?:     HexColor;
}

// ── CUE: start_type discriminated union ─────────────────────

export type CueStartType = 'soft' | 'hard';
export type CueStatus    = 'draft' | 'approved' | 'live' | 'done';

interface CueBase {
  id:               UUID;
  rundown_id:       UUID;
  group_id?:        UUID;
  sort_order:       number;
  title:            string;
  subtitle:         string;
  duration_ms:      Milliseconds;
  auto_start:       boolean;
  locked:           boolean;
  background_color?: HexColor;
  created_at:       ISODateTime;
  updated_at:       ISODateTime;
}

/** Soft cue — startuje zaraz po poprzednim */
export interface SoftCue extends CueBase {
  start_type:          'soft';
  hard_start_datetime?: never;   // wykluczone przez discriminated union
}

/** Hard cue — startuje o konkretnej godzinie dnia */
export interface HardCue extends CueBase {
  start_type:         'hard';
  hard_start_datetime: ISODateTime;   // wymagane dla hard!
}

/** Union — używaj tego wszędzie w aplikacji */
export type Cue = SoftCue | HardCue;

/** Type guard: czy cue ma hard start */
export function isHardCue(cue: Cue): cue is HardCue {
  return cue.start_type === 'hard';
}

/**
 * Oblicza planowany czas startu cue w ms od północy dnia show.
 * Dla soft: sumuje duration_ms poprzednich cue'ów.
 * Dla hard: parsuje hard_start_datetime.
 */
export function getCueStartMs(cue: Cue, showDate: ISODate): Milliseconds {
  if (isHardCue(cue)) {
    return new Date(cue.hard_start_datetime).getTime() - new Date(showDate).getTime();
  }
  // soft — oblicza wywołujący na podstawie poprzednich cue'ów
  throw new Error('Soft cue start time must be calculated from rundown context');
}

/** Gap/Overlap między hard cue a poprzednim — wynik timingu rundownu */
export interface CueTiming {
  cue_id:         UUID;
  planned_start:  Milliseconds;   // ms od północy
  planned_end:    Milliseconds;
  gap_ms:         Milliseconds;   // > 0 = gap, < 0 = overlap
  is_overrun:     boolean;
}


// ─────────────────────────────────────────────────────────────
//  POZIOM 4: ACT
// ─────────────────────────────────────────────────────────────

export type ActStatus = 'draft' | 'rehearsal' | 'approved' | 'live';

export interface Act {
  id:               UUID;
  rundown_id:       UUID;
  cue_id?:          UUID;         // powiązanie z wierszem rundownu
  name:             string;
  artist?:          string;
  sort_order:       number;
  duration_frames:  Frames;
  tc_offset_frames: Frames;       // offset od 00:00:00:00
  fps:              FPS;
  status:           ActStatus;
  color:            HexColor;
  created_at:       ISODateTime;
  updated_at:       ISODateTime;
}

export interface ActNote {
  id:         UUID;
  act_id:     UUID;
  user_id:    UUID;
  content:    string;
  created_at: ISODateTime;
}

/** Konwersja klatek na HH:MM:SS:FF */
export function framesToTimecode(frames: Frames, fps: FPS): string {
  const h  = Math.floor(frames / (fps * 3600));
  const m  = Math.floor((frames % (fps * 3600)) / (fps * 60));
  const s  = Math.floor((frames % (fps * 60)) / fps);
  const ff = frames % fps;
  return [h, m, s, ff].map(n => String(n).padStart(2, '0')).join(':');
}

/** Parsowanie HH:MM:SS:FF na klatki */
export function timecodeToFrames(tc: string, fps: FPS): Frames {
  const [h, m, s, ff] = tc.split(':').map(Number);
  return (h * 3600 + m * 60 + s) * fps + ff;
}


// ─────────────────────────────────────────────────────────────
//  POZIOM 5: TRACK
// ─────────────────────────────────────────────────────────────

export type TrackType =
  | 'vision'
  | 'vision_fx'
  | 'lyrics'
  | 'cues'
  | 'media'
  | 'osc'
  | 'gpi'
  | 'midi';

// ── Track settings per typ ───────────────────────────────────

export interface VisionTrackSettings {
  channel:       SwitcherChannel;
  rs422_enabled: boolean;
}

export interface MediaTrackSettings {
  volume: number;    // 0–100
  muted:  boolean;
}

export interface OscTrackSettings {
  host:       string;   // IP docelowy
  port:       number;   // UDP port
  schema_id?: UUID;     // opcjonalny custom schemat OSC
}

export interface MidiTrackSettings {
  midi_channel: number;    // 1–16
  device_name?: string;
}

export interface GpiTrackSettings {
  serial_port: string;    // np. "/dev/ttyUSB0" lub "COM3"
  baud_rate:   number;    // domyślnie 9600
}

/** Discriminated union settings zależny od type tracka */
export type TrackSettings =
  | (VisionTrackSettings & { _type: 'vision' | 'vision_fx' })
  | (MediaTrackSettings  & { _type: 'media' })
  | (OscTrackSettings    & { _type: 'osc' })
  | (MidiTrackSettings   & { _type: 'midi' })
  | (GpiTrackSettings    & { _type: 'gpi' })
  | Record<string, never>;  // dla lyrics, cues — brak ustawień

export interface Track {
  id:         UUID;
  act_id:     UUID;
  type:       TrackType;
  name:       string;
  sort_order: number;
  enabled:    boolean;
  height_px:  number;
  settings:   TrackSettings;
}

export interface MediaFile {
  id:              UUID;
  act_id:          UUID;
  file_name:       string;
  file_path:       string;
  media_type:      'audio' | 'video';
  duration_frames: Frames;
  waveform_data?:  number[];   // float[] ~200–500 próbek dla renderowania
  created_at:      ISODateTime;
}


// ─────────────────────────────────────────────────────────────
//  POZIOM 6: TIMELINE CUE
// ─────────────────────────────────────────────────────────────

export type TimelineCueType =
  | 'vision'
  | 'vision_fx'
  | 'lyric'
  | 'marker'
  | 'media'
  | 'osc'
  | 'gpi'
  | 'midi';

// ── Dane specyficzne per typ cue (pole `data`) ───────────────

export interface VisionCueData {
  camera_number:    number;         // 1–16
  shot_name:        string;         // np. "MCU LEAD"
  shot_description: string;
  director_notes:   string;
  switcher_channel?: SwitcherChannel;  // override kanału tracka
  operator_note:    string;         // notatka widoczna w CueApp
}

export interface VisionFxCueData {
  effect_name: string;              // np. "DVE Split", "Key On"
  macro_id?:   number;
  key_on?:     boolean;
}

export interface LyricCueData {
  text:      string;
  language?: string;                // kod ISO 639-1, np. "pl", "en"
}

export interface MarkerCueData {
  label:           string;          // np. "PYRO", "DANCER IN", "MUSIC START"
  color:           HexColor;
  pre_warn_frames: number;          // ile klatek przed — alert w CueApp
  has_duration:    boolean;         // false = punkt, true = blok czasowy
}

export interface MediaCueData {
  media_file_id:  UUID;
  offset_frames:  Frames;           // przesunięcie synchronizacji
  volume:         number;           // 0–100, override tracka
  loop:           boolean;
}

export interface OscCueData {
  address: string;                  // np. "/layer/1/opacity", "/grandma/cmd"
  args:    OscArg[];
}

export type OscArg =
  | { type: 'f'; value: number }    // float
  | { type: 'i'; value: number }    // int
  | { type: 's'; value: string }    // string
  | { type: 'T' }                   // true
  | { type: 'F' };                  // false

export type MidiMessageType = 'note_on' | 'note_off' | 'program' | 'cc';

export interface MidiCueData {
  message_type:    MidiMessageType;
  note_or_cc:      number;          // 0–127
  velocity_or_val: number;          // 0–127
}

export type GpiTriggerType = 'pulse' | 'on' | 'off';

export interface GpiCueData {
  channel:      number;             // 1–8, numer wyjścia GPI
  trigger_type: GpiTriggerType;
  pulse_ms?:    number;             // długość impulsu (tylko dla 'pulse')
}

// ── Discriminated union — główny typ TimelineCue ─────────────

interface TimelineCueBase {
  id:            UUID;
  track_id:      UUID;
  act_id:        UUID;
  tc_in_frames:  Frames;
  tc_out_frames?: Frames;          // undefined = cue punktowy
  z_order:       number;
  created_at:    ISODateTime;
  updated_at:    ISODateTime;
}

export interface VisionTimelineCue    extends TimelineCueBase { type: 'vision';    data: VisionCueData; }
export interface VisionFxTimelineCue  extends TimelineCueBase { type: 'vision_fx'; data: VisionFxCueData; }
export interface LyricTimelineCue     extends TimelineCueBase { type: 'lyric';     data: LyricCueData; }
export interface MarkerTimelineCue    extends TimelineCueBase { type: 'marker';    data: MarkerCueData; }
export interface MediaTimelineCue     extends TimelineCueBase { type: 'media';     data: MediaCueData; }
export interface OscTimelineCue       extends TimelineCueBase { type: 'osc';       data: OscCueData; }
export interface MidiTimelineCue      extends TimelineCueBase { type: 'midi';      data: MidiCueData; }
export interface GpiTimelineCue       extends TimelineCueBase { type: 'gpi';       data: GpiCueData; }

export type TimelineCue =
  | VisionTimelineCue
  | VisionFxTimelineCue
  | LyricTimelineCue
  | MarkerTimelineCue
  | MediaTimelineCue
  | OscTimelineCue
  | MidiTimelineCue
  | GpiTimelineCue;

// ── Type guards ───────────────────────────────────────────────

export const isVisionCue   = (c: TimelineCue): c is VisionTimelineCue   => c.type === 'vision';
export const isLyricCue    = (c: TimelineCue): c is LyricTimelineCue    => c.type === 'lyric';
export const isMarkerCue   = (c: TimelineCue): c is MarkerTimelineCue   => c.type === 'marker';
export const isMediaCue    = (c: TimelineCue): c is MediaTimelineCue    => c.type === 'media';
export const isOscCue      = (c: TimelineCue): c is OscTimelineCue      => c.type === 'osc';
export const isMidiCue     = (c: TimelineCue): c is MidiTimelineCue     => c.type === 'midi';
export const isGpiCue      = (c: TimelineCue): c is GpiTimelineCue      => c.type === 'gpi';
export const isPointCue    = (c: TimelineCue): boolean => c.tc_out_frames === undefined;
export const isDurationCue = (c: TimelineCue): boolean => c.tc_out_frames !== undefined;

/** Czas trwania bloku w klatkach (0 dla cue punktowych) */
export function timelineCueDuration(c: TimelineCue): Frames {
  return c.tc_out_frames !== undefined ? c.tc_out_frames - c.tc_in_frames : 0;
}

/** Czy dany TC (w klatkach) mieści się w bloku cue */
export function isFrameInCue(c: TimelineCue, frame: Frames): boolean {
  if (c.tc_out_frames === undefined) return frame === c.tc_in_frames;
  return frame >= c.tc_in_frames && frame < c.tc_out_frames;
}

/** Zwraca aktywny vision cue dla danej pozycji TC */
export function getActiveVisionCue(
  cues: TimelineCue[],
  frame: Frames
): VisionTimelineCue | undefined {
  return cues
    .filter(isVisionCue)
    .find(c => isFrameInCue(c, frame));
}


// ─────────────────────────────────────────────────────────────
//  POZIOM 7: PLAYBACK STATE (tylko pamięć — nie SQLite)
// ─────────────────────────────────────────────────────────────

export type PlaybackMode   = 'timeline_frames' | 'rundown_ms';
export type LtcSource      = 'internal' | 'ltc' | 'mtc' | 'manual';
export type WsClientType   = 'editor' | 'cueapp' | 'output' | 'prompter';

/** Dane jednego podłączonego klienta WebSocket */
export interface WsClient {
  session_id:  string;
  user_id?:    UUID;
  client_type: WsClientType;
  connected_at: ISODateTime;
  camera_filter?: number;      // CueApp: filtruje cue po numerze kamery
}

// ── Timeline-frames mode (CuePilot-style) ────────────────────

interface PlaybackStateTimelineFrames {
  mode: 'timeline_frames';

  act_id:                UUID;
  current_tc_frames:     Frames;

  // Pola ms-epoch nie są używane w tym trybie
  rundown_cue_id?:       never;
  kickoff_epoch_ms?:     never;
  deadline_epoch_ms?:    never;
  last_stop_epoch_ms?:   never;
}

// ── Rundown-ms mode (Rundown Studio-style) ───────────────────

interface PlaybackStateRundownMs {
  mode: 'rundown_ms';

  rundown_cue_id:      UUID;

  /**
   * UNIX timestamp (ms) momentu startu aktualnego cue.
   * Odpowiednik `kickoff` z Rundown Studio WebSocket API.
   */
  kickoff_epoch_ms:    number;

  /**
   * UNIX timestamp (ms) planowanego końca cue.
   * deadline - kickoff = duration_ms aktualnego cue.
   * deadline - Date.now() = pozostały czas.
   */
  deadline_epoch_ms:   number;

  /**
   * UNIX timestamp (ms) ostatniego zatrzymania.
   * Odpowiednik `lastStop` z RS API.
   */
  last_stop_epoch_ms:  number;

  // Pola frame-based nie są używane w tym trybie
  act_id?:             never;
  current_tc_frames?:  never;
}

/** Discriminated union — jeden aktywny stan odtwarzania */
export type PlaybackStateModeFields =
  | PlaybackStateTimelineFrames
  | PlaybackStateRundownMs;

/** Pełny stan odtwarzania łączący oba tryby ze wspólnymi polami */
export type PlaybackState = PlaybackStateModeFields & {
  // ── Wspólne pola ─────────────────────────────────
  is_playing:              boolean;
  is_live:                 boolean;    // true = live show, false = próba
  ltc_source:              LtcSource;

  /** Aktywny blok Timeline Cue (CuePilot-mode) */
  active_timeline_cue_id?: UUID;

  /** Aktywna kamera (dla CueApp countdown) */
  active_camera_number?:   number;

  /** Wszyscy podłączeni klienci WebSocket */
  connected_clients:       WsClient[];

  /** Znacznik czasu ostatniej zmiany stanu — do debounce broadcastu */
  state_updated_at:        ISODateTime;
};

// ── Pomocnicze obliczenia dla rundown_ms mode ────────────────

/** Pozostały czas aktualnego cue w ms */
export function getRemainingMs(state: PlaybackState & { mode: 'rundown_ms' }): Milliseconds {
  if (!state.is_playing) {
    return state.deadline_epoch_ms - state.last_stop_epoch_ms;
  }
  return Math.max(0, state.deadline_epoch_ms - Date.now());
}

/** Elapsed time aktualnego cue w ms */
export function getElapsedMs(state: PlaybackState & { mode: 'rundown_ms' }): Milliseconds {
  const duration = state.deadline_epoch_ms - state.kickoff_epoch_ms;
  return Math.max(0, duration - getRemainingMs(state));
}

/** Over/Under — ujemny = ahead, dodatni = overrun */
export function getOverUnderMs(
  state:   PlaybackState & { mode: 'rundown_ms' },
  cue:     Cue
): Milliseconds {
  return getElapsedMs(state) - cue.duration_ms;
}

// ── Type guards dla PlaybackState ───────────────────────────

export function isTimelineMode(
  s: PlaybackState
): s is PlaybackState & PlaybackStateTimelineFrames {
  return s.mode === 'timeline_frames';
}

export function isRundownMsMode(
  s: PlaybackState
): s is PlaybackState & PlaybackStateRundownMs {
  return s.mode === 'rundown_ms';
}


// ─────────────────────────────────────────────────────────────
//  WEBSOCKET EVENTS
// ─────────────────────────────────────────────────────────────

/** Zdarzenia emitowane przez serwer do wszystkich klientów */
export type WsEventName =
  | 'serverTime'
  | 'rundown'
  | 'currentCue'
  | 'nextCue'
  | 'timesnap'
  | 'actState'
  | 'variablesUpdated'
  | 'rundownUpdated';

/** serverTime — sync zegarów co 30s */
export interface WsServerTimeEvent {
  event: 'serverTime';
  payload: ISODateTime;
}

/** timesnap — dla trybu rundown_ms, odpowiednik RS API */
export interface WsTimesnapEvent {
  event: 'timesnap';
  payload: {
    kickoff:    number;    // UNIX ms
    deadline:   number;    // UNIX ms
    last_stop:  number;    // UNIX ms
    running:    boolean;
    cue_id:     UUID;
  };
}

/** currentCue — zmiana aktywnego cue */
export interface WsCurrentCueEvent {
  event: 'currentCue';
  payload: Pick<Cue, 'id' | 'title' | 'subtitle' | 'duration_ms' | 'locked'>;
}

/** nextCue — zmiana następnego cue */
export interface WsNextCueEvent {
  event: 'nextCue';
  payload: Pick<Cue, 'id' | 'title' | 'duration_ms'> | null;
}

/** actState — dla trybu timeline_frames (CuePilot-mode) */
export interface WsActStateEvent {
  event: 'actState';
  payload: {
    act_id:                UUID;
    current_tc_frames:     Frames;
    is_playing:            boolean;
    active_timeline_cue?:  Pick<VisionTimelineCue, 'id' | 'data'>;
    next_timeline_cue?:    Pick<VisionTimelineCue, 'id' | 'data' | 'tc_in_frames'>;
  };
}

/** variablesUpdated — po zmianie TextVariable (broadcast do prompterów itp.) */
export interface WsVariablesUpdatedEvent {
  event: 'variablesUpdated';
  payload: TextVariable[];
}

export type WsEvent =
  | WsServerTimeEvent
  | WsTimesnapEvent
  | WsCurrentCueEvent
  | WsNextCueEvent
  | WsActStateEvent
  | WsVariablesUpdatedEvent;


// ─────────────────────────────────────────────────────────────
//  HTTP API — REQUEST / RESPONSE SHAPES
// ─────────────────────────────────────────────────────────────

/** Sterowanie rundownem przez HTTP GET (Companion-compatible) */
export type RundownAction = 'start' | 'pause' | 'next' | 'prev';

/** Payload tworzenia nowego projektu */
export type CreateProjectPayload = Pick<Project,
  'name' | 'type' | 'timezone' | 'default_fps'
> & { event_id?: UUID };

/** Payload tworzenia cue */
export type CreateCuePayload = Pick<Cue,
  'title' | 'subtitle' | 'duration_ms' | 'start_type' | 'auto_start'
> & {
  group_id?:           UUID;
  hard_start_datetime?: ISODateTime;
  insert_after?:       UUID;          // UUID poprzedniego cue, undefined = na końcu
};

/** Payload aktualizacji komórki */
export interface UpdateCellPayload {
  cue_id:          UUID;
  column_id:       UUID;
  content_type:    CellContentType;
  richtext?:       RichtextDoc;
  dropdown_value?: string;
}

/** Payload aktualizacji TextVariable przez API */
export interface UpsertTextVariablePayload {
  key:         string;
  value:       string;
  description?: string;
}

/** Odpowiedź API z listą cue'ów + timing */
export interface RundownWithTiming {
  rundown:    Rundown;
  cues:       Cue[];
  groups:     CueGroup[];
  columns:    Column[];
  timings:    CueTiming[];
  variables:  TextVariableMap;
}


// ─────────────────────────────────────────────────────────────
//  UTILITY TYPES
// ─────────────────────────────────────────────────────────────

/** Wersja encji bez pól generowanych przez bazę */
export type CreateInput<T> = Omit<T, 'id' | 'created_at' | 'updated_at'>;

/** Wersja encji tylko z polami edytowalnymi (bez FK i timestamps) */
export type UpdateInput<T> = Partial<Omit<T, 'id' | 'created_at' | 'updated_at'>>;

/** Deep readonly — dla niemutowalnego stanu w React/Zustand */
export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

/** Stronicowanie */
export interface Pagination {
  page:     number;
  per_page: number;
  total:    number;
}

export interface PaginatedResponse<T> {
  data:       T[];
  pagination: Pagination;
}
