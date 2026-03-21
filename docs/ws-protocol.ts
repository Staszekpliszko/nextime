// ============================================================
//  BROADCAST RUNDOWN APP — WebSocket Protocol v1
//
//  Architektura: Electron Main Process = serwer WS
//  Klienci:
//    • Renderer (editor)    — okno główne Electrona
//    • CueApp               — przeglądarka na tablecie/telefonie
//    • Output/Overlay       — BrowserWindow na zewnętrzny monitor
//    • Prompter             — BrowserWindow dla telepromptera
//    • Bitfocus Companion   — HTTP polling + WS subscribe
//
//  Transport: ws:// (lokalnie) lub wss:// (przez HTTPS proxy)
//  Library:   'ws' npm package (Node.js server w main process)
//  Port:      domyślnie 3141 (konfigurowalny)
//
//  Porównanie podejść:
//
//  ┌─────────────────┬─────────────────────┬────────────────────┐
//  │                 │  Rundown Studio      │  CuePilot          │
//  ├─────────────────┼─────────────────────┼────────────────────┤
//  │ Jednostka czasu │  ms od UNIX epoch   │  klatki od TC 0    │
//  │ Start cue       │  kickoff_ms         │  tc_in_frames      │
//  │ Koniec cue      │  deadline_ms        │  tc_out_frames     │
//  │ Remaining       │  deadline - now()   │  oblicz w UI       │
//  │ Sync zegara     │  serverTime co 30s  │  LTC hardware      │
//  │ Tryb offline    │  NIE                │  TAK (LTC)         │
//  │ Dokładność      │  ~1ms (NTP-zależne) │  ±1 klatka (LTC)   │
//  │ Źródło prawdy   │  serwer cloud       │  LTC timecode      │
//  └─────────────────┴─────────────────────┴────────────────────┘
//
//  Nasza decyzja: UNIFIED FORMAT — jeden protokół, dwa "payload profiles"
//  selektowane przez pole `tc_mode` w każdym evencie timing.
// ============================================================

import type {
  UUID, ISODateTime, Frames, Milliseconds, FPS,
  Cue, Act, TimelineCue, VisionTimelineCue,
  TextVariable, WsClientType, PlaybackMode,
} from './types';


// ─────────────────────────────────────────────────────────────
//  ENVELOPE — każda wiadomość WS ma ten sam wrapper
// ─────────────────────────────────────────────────────────────

/**
 * Kierunek wiadomości:
 *   S→C  Server to Client  (broadcast lub unicast)
 *   C→S  Client to Server  (komenda)
 */

export type WsDirection = 'S→C' | 'C→S';

/**
 * Wspólny wrapper dla WSZYSTKICH wiadomości WS.
 * Klient i serwer zawsze parsują ten kształt jako pierwszy krok.
 */
export interface WsEnvelope<
  TEvent extends string = string,
  TPayload = unknown
> {
  /** Nazwa zdarzenia — string enum, nigdy free-form */
  event:     TEvent;

  /** Dane zdarzenia — ściśle typowane per event */
  payload:   TPayload;

  /**
   * UNIX timestamp (ms) momentu emisji wiadomości.
   * Klient używa do obliczenia clock drift względem server_time.
   */
  sent_at:   number;

  /**
   * Sekwencyjny numer wiadomości per połączenie.
   * Klient może wykryć pominięte wiadomości i zażądać pełnego stanu.
   */
  seq:       number;

  /**
   * ID sesji nadawcy (klient→serwer) lub undefined (broadcast serwera).
   * Pozwala echo-filter: klient ignoruje własne komendy echo'd przez serwer.
   */
  from?:     string;
}


// ─────────────────────────────────────────────────────────────
//  POŁĄCZENIE — handshake i rejestracja klienta
// ─────────────────────────────────────────────────────────────

/** C→S: pierwsza wiadomość po połączeniu */
export interface WsMsgClientHello {
  event: 'client:hello';
  payload: {
    client_type:    WsClientType;
    /** JWT token lub session token z HTTP API */
    auth_token:     string;
    client_version: string;          // semver np. "1.0.0"
    /** Dla CueApp: filtruj cue'y do tej kamery */
    camera_filter?: number;
    /** ID rundownu lub aktu który chce obserwować */
    watch_rundown?: UUID;
    watch_act?:     UUID;
  };
}

/** S→C: odpowiedź po autoryzacji */
export interface WsMsgServerWelcome {
  event: 'server:welcome';
  payload: {
    session_id:      string;
    server_version:  string;
    /** Pełny aktualny stan — klient nie musi nic pytać po połączeniu */
    initial_state:   WsInitialState;
  };
}

/** S→C: przy błędzie autoryzacji lub rozłączeniu przez serwer */
export interface WsMsgServerError {
  event: 'server:error';
  payload: {
    code:    WsErrorCode;
    message: string;
    fatal:   boolean;    // true = serwer rozłączy po tej wiadomości
  };
}

export type WsErrorCode =
  | 'AUTH_FAILED'
  | 'AUTH_EXPIRED'
  | 'RUNDOWN_NOT_FOUND'
  | 'ACT_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/** Pełny stan wysyłany przy połączeniu i przy żądaniu resync */
export interface WsInitialState {
  server_time_ms:   number;          // UNIX ms — do sync zegara klienta
  playback:         WsPlaybackSnapshot;
  rundown?:         WsRundownSnapshot;
  act?:             WsActSnapshot;
}


// ─────────────────────────────────────────────────────────────
//  CLOCK SYNC — kalibracja zegara klienta
// ─────────────────────────────────────────────────────────────

/**
 * S→C co 30 sekund.
 * Klient oblicza: clock_drift = payload.server_time_ms - Date.now()
 * i koryguje wszystkie obliczenia remaining/elapsed o tę wartość.
 *
 * Odpowiednik `serverTime` z Rundown Studio.
 */
export interface WsMsgServerTime {
  event: 'server:time';
  payload: {
    server_time_ms: number;          // UNIX ms
    /** Offset LTC od północy (tylko gdy ltc_source !== 'internal') */
    ltc_offset_ms?: number;
  };
}

/**
 * C→S: ping dla pomiaru RTT (Round Trip Time).
 * Serwer odpowiada pong z tym samym client_ts.
 */
export interface WsMsgPing {
  event: 'client:ping';
  payload: { client_ts: number };
}

export interface WsMsgPong {
  event: 'server:pong';
  payload: { client_ts: number; server_ts: number };
}


// ─────────────────────────────────────────────────────────────
//  PLAYBACK — rdzeń protokołu, dwa profile TC
// ─────────────────────────────────────────────────────────────

/**
 * RUNDOWN MS PROFILE — Rundown Studio-style
 *
 * Czas opisany przez trzy punkty UNIX epoch (ms):
 *   kickoff_ms   = moment startu aktualnego cue
 *   deadline_ms  = moment planowanego końca
 *   last_stop_ms = moment ostatniego zatrzymania
 *
 * Klient oblicza:
 *   remaining_ms = deadline_ms - Date.now() - clock_drift
 *   elapsed_ms   = Date.now() - kickoff_ms + clock_drift
 *   duration_ms  = deadline_ms - kickoff_ms
 *
 * Zalety: prosty countdown, działa bez żadnej synchronizacji sprzętowej.
 * Wady:   zależy od NTP/clock klienta, drift przy długich show.
 */
export interface TcProfileRundownMs {
  tc_mode:        'rundown_ms';
  kickoff_ms:     number;            // UNIX ms startu cue
  deadline_ms:    number;            // UNIX ms końca cue
  last_stop_ms:   number;            // UNIX ms ostatniego pause
  is_playing:     boolean;
}

/**
 * TIMELINE FRAMES PROFILE — CuePilot-style
 *
 * Czas opisany przez pozycję w klatkach:
 *   current_frames = aktualna pozycja playhead
 *   fps            = klatki na sekundę (25/30/50...)
 *
 * Klient oblicza:
 *   current_tc = framesToTimecode(current_frames, fps)
 *   progress   = current_frames / act_duration_frames
 *
 * Serwer emituje `playback:tick` co klatkę (lub interpoluje klient).
 *
 * Zalety: frame-accurate, niezależny od NTP, działa z LTC hardware.
 * Wady:   wymaga częstych update'ów lub interpolacji po stronie klienta.
 */
export interface TcProfileTimelineFrames {
  tc_mode:         'timeline_frames';
  current_frames:  Frames;
  act_duration_frames: Frames;
  fps:             FPS;
  ltc_source:      'internal' | 'ltc' | 'mtc' | 'manual';
  is_playing:      boolean;
}

export type TcProfile = TcProfileRundownMs | TcProfileTimelineFrames;

// ── Type guards ───────────────────────────────────────────────

export const isRundownMsProfile = (p: TcProfile): p is TcProfileRundownMs =>
  p.tc_mode === 'rundown_ms';

export const isTimelineFramesProfile = (p: TcProfile): p is TcProfileTimelineFrames =>
  p.tc_mode === 'timeline_frames';


// ─────────────────────────────────────────────────────────────
//  TIMESNAP — główne zdarzenie timing (S→C)
// ─────────────────────────────────────────────────────────────

/**
 * S→C: emitowane przy każdej zmianie stanu odtwarzania.
 *
 * Porównanie z oryginałami:
 *
 * Rundown Studio `timesnap`:
 *   { kickoff, deadline, lastStop, running, cueId }
 *   → nasze: payload.tc (TcProfileRundownMs) + payload.rundown_cue_id
 *
 * CuePilot broadcast (nieformalny):
 *   { current_frames, fps, act_id, shot_id }
 *   → nasze: payload.tc (TcProfileTimelineFrames) + payload.act_id
 *
 * Ujednolicamy oba w jedno zdarzenie z discriminated union `tc`.
 */
export interface WsMsgTimesnap {
  event: 'playback:timesnap';
  payload: WsTimesnapPayload;
}

export type WsTimesnapPayload = (
  | {
      tc_mode:        'rundown_ms';
      tc:             TcProfileRundownMs;
      rundown_id:     UUID;
      rundown_cue_id: UUID;
      next_cue_id?:   UUID;
      /** Gap/Overlap względem planu (ms). < 0 = za wcześnie, > 0 = opóźnienie */
      over_under_ms:  number;
      /** Hard start countdown: ms do najbliższego hard-start cue */
      next_hard_start_ms?: number;
      next_hard_start_cue_id?: UUID;
    }
  | {
      tc_mode:               'timeline_frames';
      tc:                    TcProfileTimelineFrames;
      act_id:                UUID;
      active_cue_id?:        UUID;   // aktywny TimelineCue na głównym Vision tracku
      next_cue_id?:          UUID;   // następny Vision cue
      active_camera_number?: number;
    }
);


// ─────────────────────────────────────────────────────────────
//  RUNDOWN EVENTS (S→C) — zmiany struktury rundownu
// ─────────────────────────────────────────────────────────────

/** Snapshot rundownu wysyłany przy połączeniu lub pełnym resync */
export interface WsRundownSnapshot {
  rundown_id:  UUID;
  name:        string;
  status:      string;
  show_date?:  string;
  cues:        WsCueSummary[];
  variables:   Record<string, string>;   // TextVariableMap — klucz→wartość
}

/** Lekki opis cue do listy (bez komórek — te pobierane osobno) */
export interface WsCueSummary {
  id:                   UUID;
  title:                string;
  subtitle:             string;
  duration_ms:          Milliseconds;
  start_type:           'soft' | 'hard';
  hard_start_datetime?: ISODateTime;
  auto_start:           boolean;
  locked:               boolean;
  background_color?:    string;
  group_id?:            UUID;
  sort_order:           number;
}

/**
 * S→C: zmiana aktywnego cue w rundownie.
 * Odpowiednik `currentCue` z Rundown Studio API.
 */
export interface WsMsgCurrentCue {
  event: 'rundown:current_cue';
  payload: {
    cue:      WsCueSummary;
    next_cue: WsCueSummary | null;
  };
}

/**
 * S→C: aktualizacja struktury rundownu (nowy cue, zmiana kolejności, edycja).
 * Klient merguje delta zamiast przeładowywać cały rundown.
 */
export interface WsMsgRundownDelta {
  event: 'rundown:delta';
  payload: {
    rundown_id: UUID;
    changes:    RundownChange[];
  };
}

export type RundownChange =
  | { op: 'cue_added';    cue:  WsCueSummary }
  | { op: 'cue_updated';  cue:  WsCueSummary }
  | { op: 'cue_deleted';  cue_id: UUID }
  | { op: 'cue_moved';    cue_id: UUID; new_order: number; new_group_id?: UUID }
  | { op: 'group_added';  group: { id: UUID; label: string; sort_order: number } }
  | { op: 'group_deleted'; group_id: UUID }
  | { op: 'column_added'; column: { id: UUID; name: string; type: string; sort_order: number } }
  | { op: 'column_deleted'; column_id: UUID }
  | { op: 'cell_updated'; cue_id: UUID; column_id: UUID; richtext?: unknown; dropdown_value?: string };

/**
 * S→C: zmiana wartości TextVariable — broadcast do prompterów i outputów.
 * Odpowiednik custom eventu (RS nie ma tego natywnie).
 */
export interface WsMsgVariablesUpdated {
  event: 'rundown:variables_updated';
  payload: {
    rundown_id: UUID;
    variables:  Array<Pick<TextVariable, 'key' | 'value'>>;
  };
}


// ─────────────────────────────────────────────────────────────
//  ACT EVENTS (S→C) — zdarzenia osi czasu (CuePilot-mode)
// ─────────────────────────────────────────────────────────────

/** Snapshot aktu wysyłany przy połączeniu lub zmianie aktu */
export interface WsActSnapshot {
  act_id:          UUID;
  name:            string;
  duration_frames: Frames;
  fps:             FPS;
  vision_cues:     WsVisionCueSummary[];
  lyric_cues:      WsLyricCueSummary[];
  marker_cues:     WsMarkerCueSummary[];
}

export interface WsVisionCueSummary {
  id:              UUID;
  tc_in_frames:    Frames;
  tc_out_frames:   Frames;
  camera_number:   number;
  shot_name:       string;
  operator_note:   string;
  color:           string;   // z CameraPreset
}

export interface WsLyricCueSummary {
  id:           UUID;
  tc_in_frames: Frames;
  text:         string;
  language:     string;
}

export interface WsMarkerCueSummary {
  id:              UUID;
  tc_in_frames:    Frames;
  tc_out_frames?:  Frames;
  label:           string;
  color:           string;
  pre_warn_frames: number;
}

/**
 * S→C: zmiana aktywnego Vision Cue (nowe ujęcie kamery).
 * CueApp używa do wyświetlenia countdownu do następnego ujęcia.
 */
export interface WsMsgActiveVisionCue {
  event: 'act:active_vision_cue';
  payload: {
    act_id:      UUID;
    current_cue: WsVisionCueSummary | null;
    next_cue:    WsVisionCueSummary | null;
    /** ms do następnego ujęcia (obliczone z frames i fps) */
    next_in_ms:  number | null;
  };
}

/**
 * S→C: zbliżający się Marker Cue — pre-warning dla ekipy.
 * Emitowany gdy `pre_warn_frames` klatek przed startem markera.
 */
export interface WsMsgMarkerWarning {
  event: 'act:marker_warning';
  payload: {
    act_id:      UUID;
    marker:      WsMarkerCueSummary;
    /** ms do startu markera w momencie emisji */
    in_ms:       number;
  };
}


// ─────────────────────────────────────────────────────────────
//  PLAYBACK COMMANDS (C→S) — komendy sterowania
// ─────────────────────────────────────────────────────────────

/** Bazowy typ komendy z potwierdzeniem */
interface WsCommand<TEvent extends string, TPayload = Record<string, never>> {
  event:    TEvent;
  payload:  TPayload;
  /** ID żądania — serwer echo'uje w WsMsgCommandAck */
  req_id:   string;
}

/** C→S: start odtwarzania */
export type WsMsgPlay = WsCommand<'cmd:play', {
  rundown_id?: UUID;
  act_id?:     UUID;
  /** Opcjonalnie: start od konkretnego cue/frame */
  from_cue_id?:    UUID;
  from_frames?:    Frames;
}>;

/** C→S: pauza */
export type WsMsgPause = WsCommand<'cmd:pause'>;

/** C→S: następny cue (Rundown-mode) */
export type WsMsgNext = WsCommand<'cmd:next'>;

/** C→S: poprzedni cue (Rundown-mode) */
export type WsMsgPrev = WsCommand<'cmd:prev'>;

/** C→S: skok do konkretnego cue (Rundown-mode) */
export type WsMsgGoTo = WsCommand<'cmd:goto', {
  cue_id: UUID;
}>;

/** C→S: skok do konkretnego TC (Timeline-mode) */
export type WsMsgScrub = WsCommand<'cmd:scrub', {
  act_id:   UUID;
  frames:   Frames;
}>;

/** C→S: zmiana tempa (tylko Timeline-mode) */
export type WsMsgSetSpeed = WsCommand<'cmd:set_speed', {
  /** 1.0 = normalne tempo, 0.5 = połowa, 2.0 = podwójne */
  speed: number;
}>;

/** C→S: adjust duration aktualnego cue o delta ms */
export type WsMsgAdjustDuration = WsCommand<'cmd:adjust_duration', {
  cue_id:   UUID;
  delta_ms: number;   // +60000 = +1 minuta, -60000 = -1 minuta
}>;

/** C→S: ręczne ustawienie godziny hard start */
export type WsMsgSetHardStart = WsCommand<'cmd:set_hard_start', {
  cue_id:             UUID;
  hard_start_datetime: ISODateTime;
}>;

/** C→S: żądanie pełnego resync state */
export type WsMsgResync = WsCommand<'cmd:resync'>;

/** Wszystkie komendy C→S */
export type WsCommand_Any =
  | WsMsgPlay
  | WsMsgPause
  | WsMsgNext
  | WsMsgPrev
  | WsMsgGoTo
  | WsMsgScrub
  | WsMsgSetSpeed
  | WsMsgAdjustDuration
  | WsMsgSetHardStart
  | WsMsgResync
  | WsMsgPing;

/**
 * S→C: potwierdzenie komendy.
 * Zawsze emitowane unicast (tylko do klienta który wysłał komendę).
 */
export interface WsMsgCommandAck {
  event: 'server:ack';
  payload: {
    req_id:  string;
    ok:      boolean;
    error?:  string;
  };
}


// ─────────────────────────────────────────────────────────────
//  PROMPTER EVENTS
// ─────────────────────────────────────────────────────────────

/** S→C: synchronizacja prompterów między urządzeniami */
export interface WsMsgPrompterSync {
  event: 'prompter:sync';
  payload: {
    output_config_id: UUID;
    scroll_y:         number;        // px od góry
    is_playing:       boolean;
    speed:            number;        // px/s
    settings: {
      text_size:   number;
      margin:      number;
      indicator:   number;
      uppercase:   boolean;
      invert:      boolean;
    };
  };
}

/** C→S: zmiana stanu promptera (emitowana przez "master" prompter) */
export type WsMsgPrompterUpdate = WsCommand<'cmd:prompter_update', {
  output_config_id: UUID;
  scroll_y?:        number;
  is_playing?:      boolean;
  speed?:           number;
  jump_to_cue_id?:  UUID;
}>;


// ─────────────────────────────────────────────────────────────
//  CUEAPP-SPECIFIC EVENTS
// ─────────────────────────────────────────────────────────────

/**
 * S→C: spersonalizowany widok dla CueApp.
 * Filtrowany po `camera_filter` z handshake.
 * Emitowany po każdej zmianie aktywnego vision cue.
 */
export interface WsMsgCueAppView {
  event: 'cueapp:view';
  payload: {
    /** Ujęcie aktualnie "live" dla tej kamery (null = nie ta kamera) */
    current_shot:   WsVisionCueSummary | null;
    /** Następne ujęcie tej kamery (może być kilka cue za aktualnym) */
    next_shot:      WsVisionCueSummary | null;
    /** Countdown do next_shot w ms */
    next_in_ms:     number | null;
    /** Aktywne markery widoczne dla wszystkich */
    active_markers: WsMarkerCueSummary[];
    /** Aktualnie wyświetlany tekst liryczny */
    current_lyric?: string;
  };
}

/** C→S: operator kamery dodaje notatkę do ujęcia */
export type WsMsgOperatorNote = WsCommand<'cmd:operator_note', {
  timeline_cue_id: UUID;
  note:            string;
}>;


// ─────────────────────────────────────────────────────────────
//  WSZYSTKIE ZDARZENIA — master union
// ─────────────────────────────────────────────────────────────

/** Wszystkie zdarzenia S→C */
export type WsServerMessage =
  | WsMsgServerWelcome
  | WsMsgServerError
  | WsMsgServerTime
  | WsMsgPong
  | WsMsgCommandAck
  | WsMsgTimesnap
  | WsMsgCurrentCue
  | WsMsgRundownDelta
  | WsMsgVariablesUpdated
  | WsMsgActiveVisionCue
  | WsMsgMarkerWarning
  | WsMsgPrompterSync
  | WsMsgCueAppView;

/** Wszystkie zdarzenia C→S */
export type WsClientMessage =
  | WsMsgClientHello
  | WsCommand_Any
  | WsMsgPrompterUpdate
  | WsMsgOperatorNote;

/** Mapa event name → typ payloadu (do type-safe dispatcha) */
export type WsServerEventMap = {
  [M in WsServerMessage as M['event']]: M['payload'];
};

export type WsClientEventMap = {
  [M in WsClientMessage as M['event']]: 'payload' extends keyof M ? M['payload'] : never;
};


// ─────────────────────────────────────────────────────────────
//  SERWER — implementacja w Electron Main Process
// ─────────────────────────────────────────────────────────────

/**
 * Konfiguracja serwera WS w main process.
 * Inicjalizowana w app.whenReady().
 */
export interface WsServerConfig {
  port:               number;            // domyślnie 3141
  host:               string;            // domyślnie "0.0.0.0" (wszystkie interfejsy)
  heartbeat_interval: number;            // ms, domyślnie 30_000
  timesnap_interval:  number;            // ms, domyślnie 100 (10 Hz)
  tick_interval:      number;            // ms, domyślnie 40 (25 fps dla frames mode)
  max_clients:        number;            // domyślnie 32
  auth_required:      boolean;           // false w trybie lokalnym (brak auth)
}

export const DEFAULT_WS_CONFIG: WsServerConfig = {
  port:               3141,
  host:               '0.0.0.0',
  heartbeat_interval: 30_000,
  timesnap_interval:  100,
  tick_interval:      40,
  max_clients:        32,
  auth_required:      false,
};

/**
 * Pseudokod implementacji serwera w main process:
 *
 * ```typescript
 * import { WebSocketServer, WebSocket } from 'ws';
 * import { v4 as uuidv4 } from 'uuid';
 *
 * const wss = new WebSocketServer({ port: config.port });
 * const sessions = new Map<string, WsSession>();
 *
 * wss.on('connection', (ws) => {
 *   const session_id = uuidv4();
 *   let seq = 0;
 *
 *   const send = <T extends WsServerMessage>(msg: T) => {
 *     ws.send(JSON.stringify({
 *       ...msg,
 *       sent_at: Date.now(),
 *       seq: seq++,
 *     } satisfies WsEnvelope<T['event'], T['payload']>));
 *   };
 *
 *   ws.on('message', (raw) => {
 *     const msg: WsClientMessage = JSON.parse(raw.toString());
 *     handleClientMessage(session_id, msg, send);
 *   });
 *
 *   ws.on('close', () => sessions.delete(session_id));
 * });
 *
 * // Broadcast co timesnap_interval
 * setInterval(() => {
 *   const snap = buildTimesnap();
 *   broadcast({ event: 'playback:timesnap', payload: snap });
 * }, config.timesnap_interval);
 *
 * // Clock sync co heartbeat_interval
 * setInterval(() => {
 *   broadcast({ event: 'server:time', payload: { server_time_ms: Date.now() } });
 * }, config.heartbeat_interval);
 * ```
 */


// ─────────────────────────────────────────────────────────────
//  KLIENT — React hook do obsługi WS
// ─────────────────────────────────────────────────────────────

/**
 * Pseudokod hooka useRundownSocket w React (Renderer process).
 *
 * ```typescript
 * import { useEffect, useRef, useState } from 'react';
 *
 * export function useRundownSocket(url: string) {
 *   const ws = useRef<WebSocket>();
 *   const [playback, setPlayback] = useState<WsTimesnapPayload | null>(null);
 *   const [currentCue, setCurrentCue] = useState<WsCueSummary | null>(null);
 *   const clockDrift = useRef(0);                  // ms różnicy server-klient
 *   const expectedSeq = useRef(0);
 *
 *   useEffect(() => {
 *     ws.current = new WebSocket(url);
 *
 *     ws.current.onopen = () => {
 *       // Handshake
 *       send({ event: 'client:hello', payload: { client_type: 'editor', ... } });
 *     };
 *
 *     ws.current.onmessage = ({ data }) => {
 *       const envelope: WsEnvelope = JSON.parse(data);
 *
 *       // Gap detection
 *       if (envelope.seq !== expectedSeq.current) {
 *         send({ event: 'cmd:resync', payload: {}, req_id: uuidv4() });
 *       }
 *       expectedSeq.current = envelope.seq + 1;
 *
 *       dispatch(envelope);
 *     };
 *
 *     return () => ws.current?.close();
 *   }, [url]);
 *
 *   const dispatch = (env: WsEnvelope) => {
 *     switch (env.event) {
 *       case 'server:time':
 *         clockDrift.current = env.payload.server_time_ms - Date.now();
 *         break;
 *       case 'playback:timesnap':
 *         setPlayback(env.payload);
 *         break;
 *       case 'rundown:current_cue':
 *         setCurrentCue(env.payload.cue);
 *         break;
 *       case 'rundown:delta':
 *         applyDelta(env.payload.changes);
 *         break;
 *     }
 *   };
 *
 *   // Obliczenia z korekcją clock drift
 *   const getRemaining = () => {
 *     if (!playback || playback.tc_mode !== 'rundown_ms') return null;
 *     return playback.tc.deadline_ms - Date.now() - clockDrift.current;
 *   };
 *
 *   return { playback, currentCue, getRemaining };
 * }
 * ```
 */


// ─────────────────────────────────────────────────────────────
//  BITFOCUS COMPANION — HTTP kompatybilność
// ─────────────────────────────────────────────────────────────

/**
 * Endpointy HTTP kompatybilne z Companion Generic HTTP module.
 * Nasza aplikacja Electron udostępnia je przez wbudowany Express server.
 *
 * Zgodne ze schematem Rundown Studio:
 *   GET /api/rundown/:id/start?token=...
 *   GET /api/rundown/:id/pause?token=...
 *   GET /api/rundown/:id/next?token=...
 *   GET /api/rundown/:id/prev?token=...
 *
 * Każde żądanie HTTP tłumaczone jest na WS komendę wewnątrz serwera.
 * Zwraca 200 OK z aktualnym WsTimesnapPayload jako JSON.
 */
export interface CompanionApiResponse {
  ok:       boolean;
  timesnap: WsTimesnapPayload;
}

/**
 * Zmienne Companion dostępne w modułach buttonów:
 *   $(instance:rundown_name)
 *   $(instance:rundown_status)
 *   $(instance:current_cue_title)
 *   $(instance:current_cue_duration)        — HH:MM:SS
 *   $(instance:current_cue_remaining)       — HH:MM:SS
 *   $(instance:next_cue_title)
 *   $(instance:next_cue_duration)
 *   $(instance:over_under)                  — +01:30 lub -00:45
 *   $(instance:server_time)                 — HH:MM:SS
 *   $(instance:active_camera)              — numer kamery (Timeline mode)
 *   $(instance:active_shot)               — np. "MCU LEAD"
 */
export type CompanionVariable =
  | 'rundown_name'
  | 'rundown_status'
  | 'current_cue_title'
  | 'current_cue_subtitle'
  | 'current_cue_duration'
  | 'current_cue_remaining'
  | 'current_cue_elapsed'
  | 'next_cue_title'
  | 'next_cue_duration'
  | 'over_under'
  | 'server_time'
  | 'active_camera'
  | 'active_shot';
