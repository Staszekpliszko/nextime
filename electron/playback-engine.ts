import { EventEmitter } from 'events';

// ── Clock (dependency injection) ────────────────────────

/** Interfejs zegara — DI dla deterministycznego testowania */
export interface Clock {
  now(): number;
}

const systemClock: Clock = { now: () => Date.now() };

// ── Typy (zgodne z docs/types.ts i docs/ws-protocol.ts) ──────

export interface EngineRundownMsState {
  mode: 'rundown_ms';
  rundownId: string;
  cues: EngineCue[];
  currentIndex: number;
  currentCueTitle: string;
  kickoff_epoch_ms: number;
  deadline_epoch_ms: number;
  last_stop_epoch_ms: number;
  is_playing: boolean;
}

/** Lekki opis cue — pola zgodne z WsCueSummary z docs/ws-protocol.ts */
export interface EngineCue {
  id: string;
  title: string;
  subtitle: string;
  duration_ms: number;
  sort_order: number;
  start_type: 'soft' | 'hard';
  hard_start_datetime?: string;
  auto_start: boolean;
  locked: boolean;
  background_color?: string;
  status: 'ready' | 'standby' | 'done' | 'skipped';
  group_id?: string;
}

// ── Timeline state (CuePilot-style, frame-based) ────────

export type FPS = 24 | 25 | 29 | 30 | 50 | 59 | 60;

export interface EngineTimelineFramesState {
  mode: 'timeline_frames';
  actId: string;
  actName: string;
  actDurationFrames: number;
  fps: FPS;
  currentTcFrames: number;
  is_playing: boolean;
  ltcSource: 'internal' | 'ltc' | 'mtc' | 'manual';
  speed: number; // 1.0 = normalne
  activeVisionCueId?: string;
  nextVisionCueId?: string;
  activeCameraNumber?: number;
  /** Timestamp ostatniego ticka — do obliczania delta */
  lastTickMs: number;
  /** Step mode — play zablokowany, sterowanie ręczne */
  stepMode: boolean;
  /** Hold mode — zamrożenie vision cue */
  holdMode: boolean;
}

export type EngineState = EngineRundownMsState | EngineTimelineFramesState | null;

// ── Cached timeline cue (Faza 6: cue cache) ─────────────

/** Lekki opis timeline cue — cache w pamięci engine */
export interface CachedTimelineCue {
  id: string;
  track_id: string;
  type: string;
  tc_in_frames: number;
  tc_out_frames?: number;
  data: Record<string, unknown>;
}

// ── Timesnap payload (zgodny z docs/ws-protocol.ts) ──────

export interface TcProfileRundownMs {
  tc_mode: 'rundown_ms';
  kickoff_ms: number;
  deadline_ms: number;
  last_stop_ms: number;
  is_playing: boolean;
}

export interface TcProfileTimelineFrames {
  tc_mode: 'timeline_frames';
  current_frames: number;
  act_duration_frames: number;
  fps: FPS;
  ltc_source: 'internal' | 'ltc' | 'mtc' | 'manual';
  is_playing: boolean;
}

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

export type TimesnapPayload = TimesnapRundownMs | TimesnapTimelineFrames;

// ── Interfejsy repozytoriów (minimalny kontrakt) ─────────

interface CueRepoLike {
  findByRundown(rundownId: string): EngineCue[];
}

interface RundownRepoLike {
  findById(id: string): { id: string; name: string } | undefined;
}

/** Minimalny kontrakt Act repo — wystarczający dla engine */
export interface ActRepoLike {
  findById(id: string): { id: string; name: string; duration_frames: number; fps: number; tc_offset_frames: number } | undefined;
}

/** Minimalny kontrakt TimelineCue repo — wystarczający dla engine */
export interface TimelineCueRepoLike {
  findActiveAtFrame(actId: string, type: string, frame: number): { id: string; data: Record<string, unknown> } | undefined;
  findByActAndType(actId: string, type: string): Array<{ id: string; tc_in_frames: number; tc_out_frames?: number; data: Record<string, unknown> }>;
  findByAct(actId: string): Array<{
    id: string; track_id: string; type: string;
    tc_in_frames: number; tc_out_frames?: number;
    data: Record<string, unknown>;
  }>;
}

// ── PlaybackEngine ───────────────────────────────────────

export class PlaybackEngine extends EventEmitter {
  private state: EngineState = null;
  private actRepo: ActRepoLike | null = null;
  private timelineCueRepo: TimelineCueRepoLike | null = null;

  // Cue cache (Faza 6)
  private cachedCues: CachedTimelineCue[] = [];
  private activeCueIds = new Set<string>();
  private firedPointCueIds = new Set<string>();
  private preWarnedCueIds = new Set<string>();

  constructor(
    private cueRepo: CueRepoLike,
    private rundownRepo: RundownRepoLike,
    private clock: Clock = systemClock,
  ) {
    super();
  }

  /** Ustawia repozytoria timeline (opcjonalne — wymagane tylko dla trybu timeline_frames) */
  setTimelineRepos(actRepo: ActRepoLike, timelineCueRepo: TimelineCueRepoLike): void {
    this.actRepo = actRepo;
    this.timelineCueRepo = timelineCueRepo;
  }

  getState(): EngineState {
    return this.state;
  }

  /** Ładuje rundown z bazy i ustawia pierwszy cue jako aktualny */
  loadRundown(rundownId: string): void {
    const rundown = this.rundownRepo.findById(rundownId);
    if (!rundown) throw new Error(`Rundown ${rundownId} not found`);

    const cues = this.cueRepo.findByRundown(rundownId);

    // Pusty rundown — ustaw stan bez aktywnego cue
    if (cues.length === 0) {
      const now = this.clock.now();
      this.state = {
        mode: 'rundown_ms',
        rundownId,
        cues: [],
        currentIndex: -1,
        currentCueTitle: '',
        kickoff_epoch_ms: now,
        deadline_epoch_ms: now,
        last_stop_epoch_ms: now,
        is_playing: false,
      };
      return;
    }

    const now = this.clock.now();
    const firstCue = cues[0]!;

    this.state = {
      mode: 'rundown_ms',
      rundownId,
      cues,
      currentIndex: 0,
      currentCueTitle: firstCue.title,
      kickoff_epoch_ms: now,
      deadline_epoch_ms: now + firstCue.duration_ms,
      last_stop_epoch_ms: now,
      is_playing: false,
    };
  }

  /** Odświeża listę cue'ów z bazy bez resetowania pozycji i playbacku (tylko rundown mode) */
  reloadCues(): void {
    if (!this.state || this.state.mode !== 'rundown_ms') return;

    const cues = this.cueRepo.findByRundown(this.state.rundownId);

    if (cues.length === 0) {
      this.state.cues = [];
      this.state.currentIndex = -1;
      this.state.currentCueTitle = '';
      this.state.is_playing = false;
      return;
    }

    // Zachowaj bieżący cue po ID (jeśli nadal istnieje)
    const currentCueId = this.state.currentIndex >= 0
      ? this.state.cues[this.state.currentIndex]?.id
      : undefined;

    this.state.cues = cues;

    if (currentCueId) {
      const newIndex = cues.findIndex(c => c.id === currentCueId);
      if (newIndex >= 0) {
        this.state.currentIndex = newIndex;
        this.state.currentCueTitle = cues[newIndex]!.title;
        // Zaktualizuj deadline jeśli duration się zmieniło
        const cue = cues[newIndex]!;
        this.state.deadline_epoch_ms = this.state.kickoff_epoch_ms + cue.duration_ms;
      } else {
        // Usunięto bieżący cue — przejdź na pierwszy
        this.state.currentIndex = 0;
        this.state.currentCueTitle = cues[0]!.title;
        this.state.is_playing = false;
      }
    } else {
      this.state.currentIndex = 0;
      this.state.currentCueTitle = cues[0]!.title;
    }
  }

  // ── Timeline methods ─────────────────────────────────────

  /** Ładuje act z bazy i przełącza engine w tryb timeline_frames */
  loadAct(actId: string): void {
    if (!this.actRepo) throw new Error('Timeline repos not configured — call setTimelineRepos() first');

    const act = this.actRepo.findById(actId);
    if (!act) throw new Error(`Act ${actId} not found`);

    this.state = {
      mode: 'timeline_frames',
      actId: act.id,
      actName: act.name,
      actDurationFrames: act.duration_frames,
      fps: act.fps as FPS,
      currentTcFrames: act.tc_offset_frames,
      is_playing: false,
      ltcSource: 'internal',
      speed: 1.0,
      lastTickMs: this.clock.now(),
      stepMode: false,
      holdMode: false,
    };

    // Załaduj cache cue'ów z bazy
    this.loadCueCache();

    // Szukaj aktywnego vision cue na pozycji startowej
    this.updateVisionCueFromCache(Math.floor(this.state.currentTcFrames));

    this.emit('state-changed', this.state);
  }

  /** Skok do konkretnej pozycji na osi czasu (w klatkach) */
  scrub(frames: number): void {
    if (!this.state || this.state.mode !== 'timeline_frames') {
      throw new Error('Not in timeline_frames mode');
    }

    this.state.currentTcFrames = Math.max(0, Math.min(frames, this.state.actDurationFrames));
    this.state.lastTickMs = this.clock.now();
    // Scrub — przelicz aktywne cue'y BEZ emitowania enter/exit
    this.recalculateActiveCues();
    this.emit('state-changed', this.state);
  }

  /** Zmiana tempa odtwarzania (1.0 = normalne) */
  setSpeed(speed: number): void {
    if (!this.state || this.state.mode !== 'timeline_frames') {
      throw new Error('Not in timeline_frames mode');
    }
    this.state.speed = speed;
    this.emit('state-changed', this.state);
  }

  /** Advance pozycji w trybie timeline_frames — wywoływane co tick_interval */
  tickFrames(): void {
    if (!this.state || this.state.mode !== 'timeline_frames' || !this.state.is_playing) return;

    // W trybie LTC/MTC — engine NIE advance wewnętrznie, czeka na feedExternalTc()
    if (this.state.ltcSource === 'ltc' || this.state.ltcSource === 'mtc') {
      // Tylko wykonaj cue'y na bieżącej pozycji (ustawianej przez feedExternalTc)
      this.executeCues();
      return;
    }

    const now = this.clock.now();
    const elapsedMs = now - this.state.lastTickMs;
    this.state.lastTickMs = now;

    // Oblicz ile klatek upłynęło
    const realFps = this.state.fps === 29 ? 29.97 : this.state.fps === 59 ? 59.94 : this.state.fps;
    const frameDelta = this.state.speed * (elapsedMs / 1000) * realFps;
    this.state.currentTcFrames += frameDelta;

    // Clamp do zakresu
    if (this.state.currentTcFrames >= this.state.actDurationFrames) {
      this.state.currentTcFrames = this.state.actDurationFrames;
      this.state.is_playing = false;
      this.emit('playback-ended', this.state);
    }

    if (this.state.currentTcFrames < 0) {
      this.state.currentTcFrames = 0;
    }

    // Wykonaj cue'y na bieżącej pozycji
    this.executeCues();
  }

  // ── LTC Source (Faza 10) ──────────────────────────────

  /** Zmienia źródło timecode: internal (wewnętrzny zegar), ltc, mtc, manual */
  setLtcSource(source: 'internal' | 'ltc' | 'mtc' | 'manual'): void {
    if (!this.state || this.state.mode !== 'timeline_frames') return;
    this.state.ltcSource = source;

    // Przy przejściu na internal — zresetuj lastTickMs żeby delta nie była ogromna
    if (source === 'internal') {
      this.state.lastTickMs = this.clock.now();
    }

    this.emit('ltc-source-changed', source);
    this.emit('state-changed', this.state);
  }

  /** Przyjmuje zewnętrzny timecode (LTC/MTC/manual) i ustawia pozycję */
  feedExternalTc(frames: number): void {
    if (!this.state || this.state.mode !== 'timeline_frames') return;
    // Akceptuj tylko w trybie ltc/mtc/manual — internal advance sam
    if (this.state.ltcSource === 'internal') return;

    this.state.currentTcFrames = Math.max(0, Math.min(frames, this.state.actDurationFrames));
    this.state.lastTickMs = this.clock.now();

    // Wykonaj cue'y na nowej pozycji
    this.executeCues();
    this.emit('state-changed', this.state);
  }

  // ── Step Mode + Hold Mode (Faza 6) ────────────────────

  /** Przełącza step mode — w step mode play jest zablokowany */
  toggleStepMode(): void {
    if (!this.state || this.state.mode !== 'timeline_frames') return;
    this.state.stepMode = !this.state.stepMode;
    if (this.state.stepMode && this.state.is_playing) {
      this.state.is_playing = false;
    }
    this.emit('mode-changed', { stepMode: this.state.stepMode, holdMode: this.state.holdMode });
    this.emit('state-changed', this.state);
  }

  /** Przełącza hold mode — w hold mode vision cue jest zamrożony */
  toggleHoldMode(): void {
    if (!this.state || this.state.mode !== 'timeline_frames') return;
    this.state.holdMode = !this.state.holdMode;
    this.emit('mode-changed', { stepMode: this.state.stepMode, holdMode: this.state.holdMode });
    this.emit('state-changed', this.state);
  }

  /** Skacze do następnego vision cue (w step mode) */
  stepToNextCue(): void {
    if (!this.state || this.state.mode !== 'timeline_frames') return;
    const frame = Math.floor(this.state.currentTcFrames);
    const next = this.cachedCues
      .filter(c => c.type === 'vision')
      .sort((a, b) => a.tc_in_frames - b.tc_in_frames)
      .find(c => c.tc_in_frames > frame);
    if (!next) return;

    this.state.currentTcFrames = next.tc_in_frames;
    this.state.lastTickMs = this.clock.now();
    this.resetCueTracker();
    this.executeCues();
    this.emit('state-changed', this.state);
  }

  /** Wymusza następny vision cue jako aktywny (hold override) */
  takeNextShot(): void {
    if (!this.state || this.state.mode !== 'timeline_frames') return;
    const frame = Math.floor(this.state.currentTcFrames);
    const sorted = this.cachedCues.filter(c => c.type === 'vision').sort((a, b) => a.tc_in_frames - b.tc_in_frames);
    const next = sorted.find(c => c.tc_in_frames > frame);
    if (!next) return;

    this.state.activeVisionCueId = next.id;
    this.state.activeCameraNumber = (next.data as { camera_number?: number }).camera_number;
    this.state.nextVisionCueId = sorted.find(c => c.tc_in_frames > next.tc_in_frames)?.id;
    this.emit('vision-cue-changed', next, sorted.find(c => c.tc_in_frames > next.tc_in_frames) ?? null);
    this.emit('state-changed', this.state);
  }

  /** Przeładowuje cache timeline cue'ów (po CRUD IPC) */
  reloadTimelineCues(): void {
    this.loadCueCache();
    this.recalculateActiveCues();
  }

  // ── Rundown methods ─────────────────────────────────────

  /** Rozpoczyna lub wznawia odtwarzanie */
  play(): void {
    if (!this.state) throw new Error('No rundown loaded');

    // Timeline mode
    if (this.state.mode === 'timeline_frames') {
      if (this.state.stepMode) return; // Step mode — play zablokowany
      if (this.state.is_playing) return;
      this.state.lastTickMs = this.clock.now();
      this.state.is_playing = true;
      this.emit('state-changed', this.state);
      return;
    }

    // Rundown mode
    if (this.state.cues.length === 0) return; // pusty rundown — nic do grania
    if (this.state.is_playing) return; // już gra

    const now = this.clock.now();

    if (this.state.last_stop_epoch_ms > this.state.kickoff_epoch_ms) {
      // Wznowienie po pauzie — zachowaj remaining
      const remaining = this.state.deadline_epoch_ms - this.state.last_stop_epoch_ms;
      this.state.deadline_epoch_ms = now + remaining;
      this.state.kickoff_epoch_ms = this.state.deadline_epoch_ms - this.currentCue().duration_ms;
    } else {
      // Pierwszy start cue
      this.state.kickoff_epoch_ms = now;
      this.state.deadline_epoch_ms = now + this.currentCue().duration_ms;
    }

    this.state.is_playing = true;
    this.emit('state-changed', this.state);
  }

  /** Pauzuje odtwarzanie */
  pause(): void {
    if (!this.state || !this.state.is_playing) return;

    if (this.state.mode === 'timeline_frames') {
      this.state.is_playing = false;
      this.emit('state-changed', this.state);
      return;
    }

    this.state.last_stop_epoch_ms = this.clock.now();
    this.state.is_playing = false;
    this.emit('state-changed', this.state);
  }

  /** Przechodzi do następnego cue (tylko rundown mode) */
  next(): void {
    if (!this.state) throw new Error('No rundown loaded');
    if (this.state.mode === 'timeline_frames') return;

    const nextIndex = this.state.currentIndex + 1;
    if (nextIndex >= this.state.cues.length) return; // już ostatni

    this.setCueByIndex(nextIndex);
  }

  /** Wraca do poprzedniego cue (tylko rundown mode) */
  prev(): void {
    if (!this.state) throw new Error('No rundown loaded');
    if (this.state.mode === 'timeline_frames') return;

    const prevIndex = this.state.currentIndex - 1;
    if (prevIndex < 0) return; // już pierwszy

    this.setCueByIndex(prevIndex);
  }

  /** Skacze do konkretnego cue po ID (tylko rundown mode) */
  goto(cueId: string): void {
    if (!this.state) throw new Error('No rundown loaded');
    if (this.state.mode === 'timeline_frames') return;

    const index = this.state.cues.findIndex(c => c.id === cueId);
    if (index === -1) throw new Error(`Cue ${cueId} not found in rundown`);

    this.setCueByIndex(index);
  }

  /** Sprawdza czy bieżący cue się skończył i auto-advance do następnego */
  tick(): void {
    if (!this.state || !this.state.is_playing) return;

    // Timeline mode — deleguj do tickFrames
    if (this.state.mode === 'timeline_frames') {
      this.tickFrames();
      return;
    }

    // Rundown mode
    if (this.state.cues.length === 0) return;

    const now = this.clock.now();
    if (now < this.state.deadline_epoch_ms) return; // cue jeszcze trwa

    // Cue się skończył — sprawdź czy jest następny z auto_start
    const nextIndex = this.state.currentIndex + 1;
    if (nextIndex >= this.state.cues.length) return; // ostatni cue — zostań

    const nextCue = this.state.cues[nextIndex]!;
    if (nextCue.auto_start) {
      this.setCueByIndex(nextIndex);
    }
  }

  /** Buduje WsTimesnapPayload z aktualnego stanu */
  buildTimesnap(): TimesnapPayload | null {
    if (!this.state) return null;

    // Timeline mode
    if (this.state.mode === 'timeline_frames') {
      return this.buildTimelineTimesnap(this.state);
    }

    // Rundown mode
    if (this.state.cues.length === 0) return null;

    const cue = this.currentCue();
    const now = this.clock.now();

    // Oblicz over/under
    const elapsed = this.state.is_playing
      ? now - this.state.kickoff_epoch_ms
      : this.state.last_stop_epoch_ms - this.state.kickoff_epoch_ms;
    const overUnder = elapsed - cue.duration_ms;

    // Znajdź następny cue
    const nextCue = this.state.currentIndex < this.state.cues.length - 1
      ? this.state.cues[this.state.currentIndex + 1]
      : undefined;

    // Znajdź najbliższy hard-start cue po aktualnym
    let nextHardStartMs: number | undefined;
    let nextHardStartCueId: string | undefined;
    for (let i = this.state.currentIndex + 1; i < this.state.cues.length; i++) {
      const c = this.state.cues[i]!;
      if (c.start_type === 'hard' && c.hard_start_datetime) {
        const hardMs = new Date(c.hard_start_datetime).getTime();
        nextHardStartMs = hardMs - now;
        nextHardStartCueId = c.id;
        break;
      }
    }

    return {
      tc_mode: 'rundown_ms',
      tc: {
        tc_mode: 'rundown_ms',
        kickoff_ms: this.state.kickoff_epoch_ms,
        deadline_ms: this.state.deadline_epoch_ms,
        last_stop_ms: this.state.last_stop_epoch_ms,
        is_playing: this.state.is_playing,
      },
      rundown_id: this.state.rundownId,
      rundown_cue_id: cue.id,
      next_cue_id: nextCue?.id,
      over_under_ms: overUnder,
      next_hard_start_ms: nextHardStartMs,
      next_hard_start_cue_id: nextHardStartCueId,
    };
  }

  /** Niszczy engine — cleanup */
  destroy(): void {
    this.removeAllListeners();
    this.state = null;
    this.cachedCues = [];
    this.activeCueIds.clear();
    this.firedPointCueIds.clear();
    this.preWarnedCueIds.clear();
  }

  // ── Private ────────────────────────────────────────────

  private currentCue(): EngineCue {
    const s = this.state as EngineRundownMsState;
    return s.cues[s.currentIndex]!;
  }

  // ── Cue Cache (Faza 6) ─────────────────────────────────

  /** Ładuje wszystkie cue'y aktu do pamięci cache */
  private loadCueCache(): void {
    if (!this.state || this.state.mode !== 'timeline_frames' || !this.timelineCueRepo) return;
    this.cachedCues = this.timelineCueRepo.findByAct(this.state.actId).map(c => ({
      id: c.id, track_id: c.track_id, type: c.type,
      tc_in_frames: c.tc_in_frames, tc_out_frames: c.tc_out_frames,
      data: c.data,
    }));
    this.resetCueTracker();
  }

  /** Resetuje tracker aktywnych/wypalonych cue'ów */
  private resetCueTracker(): void {
    this.activeCueIds.clear();
    this.firedPointCueIds.clear();
    this.preWarnedCueIds.clear();
  }

  /** Sprawdza czy cue jest aktywny w danej klatce */
  private isCueAtFrame(cue: CachedTimelineCue, frame: number): boolean {
    if (cue.tc_out_frames === undefined) return frame === cue.tc_in_frames;
    return frame >= cue.tc_in_frames && frame < cue.tc_out_frames;
  }

  /** Przelicza aktywne cue'y bez emitowania enter/exit (używane przy scrub) */
  private recalculateActiveCues(): void {
    this.resetCueTracker();
    if (!this.state || this.state.mode !== 'timeline_frames') return;
    const frame = Math.floor(this.state.currentTcFrames);
    for (const cue of this.cachedCues) {
      if (this.isCueAtFrame(cue, frame)) {
        this.activeCueIds.add(cue.id);
        if (!cue.tc_out_frames) this.firedPointCueIds.add(cue.id);
      }
    }
    this.updateVisionCueFromCache(frame);
  }

  // ── Cue Executor (Faza 6) ──────────────────────────────

  /** Wykonuje cue'y — emituje enter/exit eventy */
  private executeCues(): void {
    if (!this.state || this.state.mode !== 'timeline_frames') return;
    const frame = Math.floor(this.state.currentTcFrames);

    for (const cue of this.cachedCues) {
      const inRange = this.isCueAtFrame(cue, frame);
      const wasActive = this.activeCueIds.has(cue.id);

      if (inRange && !wasActive) {
        // Punkt cue — sprawdź fired
        if (!cue.tc_out_frames) {
          if (this.firedPointCueIds.has(cue.id)) continue;
          this.firedPointCueIds.add(cue.id);
        }
        this.activeCueIds.add(cue.id);
        this.onCueEnter(cue);
      } else if (!inRange && wasActive) {
        this.activeCueIds.delete(cue.id);
        this.onCueExit(cue);
      }

      // Pre-warning dla markerów
      if (cue.type === 'marker' && !this.preWarnedCueIds.has(cue.id)) {
        const preWarn = (cue.data as { pre_warn_frames?: number }).pre_warn_frames ?? 0;
        if (preWarn > 0 && frame >= cue.tc_in_frames - preWarn && frame < cue.tc_in_frames) {
          this.preWarnedCueIds.add(cue.id);
          this.emit('cue-pre-warning', cue, cue.tc_in_frames - frame);
        }
      }
    }

    this.updateVisionCueFromCache(frame);
  }

  /** Reaguje na wejście cue'a w zakres playhead */
  private onCueEnter(cue: CachedTimelineCue): void {
    this.emit('cue-entered', cue);
    switch (cue.type) {
      case 'lyric':
        this.emit('lyric-changed', (cue.data as { text?: string }).text ?? '', undefined);
        break;
      case 'marker':
        this.emit('marker-active', {
          label: (cue.data as { label?: string }).label ?? '',
          color: (cue.data as { color?: string }).color ?? '#ef4444',
          cueId: cue.id,
        });
        break;
      case 'osc': this.emit('osc-trigger', cue); break;
      case 'midi': this.emit('midi-trigger', cue); break;
      case 'gpi': this.emit('gpi-trigger', cue); break;
      case 'media': this.emit('media-trigger', cue); break;
    }
  }

  /** Reaguje na opuszczenie zakresu cue'a przez playhead */
  private onCueExit(cue: CachedTimelineCue): void {
    this.emit('cue-exited', cue);
    if (cue.type === 'lyric') this.emit('lyric-changed', null, undefined);
    if (cue.type === 'marker') this.emit('marker-inactive', cue.id);
  }

  /** Aktualizuje aktywny vision cue z cache (zastępuje stare updateActiveVisionCue) */
  private updateVisionCueFromCache(frame: number): void {
    if (!this.state || this.state.mode !== 'timeline_frames') return;
    if (this.state.holdMode) return; // HOLD — zamroź vision

    const prev = this.state.activeVisionCueId;
    const active = this.cachedCues.find(c => c.type === 'vision' && this.isCueAtFrame(c, frame));

    this.state.activeVisionCueId = active?.id;
    this.state.activeCameraNumber = active
      ? (active.data as { camera_number?: number }).camera_number
      : undefined;

    const sorted = this.cachedCues.filter(c => c.type === 'vision').sort((a, b) => a.tc_in_frames - b.tc_in_frames);
    this.state.nextVisionCueId = sorted.find(c => c.tc_in_frames > frame)?.id;

    if (prev !== this.state.activeVisionCueId) {
      this.emit('vision-cue-changed', active ?? null, sorted.find(c => c.tc_in_frames > frame) ?? null);
    }
  }

  /** Buduje timesnap dla trybu timeline_frames — rozszerzony o nowe pola Fazy 6 */
  private buildTimelineTimesnap(state: EngineTimelineFramesState): TimesnapTimelineFrames {
    const frame = Math.floor(state.currentTcFrames);
    const activeLyric = this.cachedCues.find(c =>
      c.type === 'lyric' && this.isCueAtFrame(c, frame)
    );

    return {
      tc_mode: 'timeline_frames',
      tc: {
        tc_mode: 'timeline_frames',
        current_frames: frame,
        act_duration_frames: state.actDurationFrames,
        fps: state.fps,
        ltc_source: state.ltcSource,
        is_playing: state.is_playing,
      },
      act_id: state.actId,
      active_cue_id: state.activeVisionCueId,
      next_cue_id: state.nextVisionCueId,
      active_camera_number: state.activeCameraNumber,
      speed: state.speed,
      step_mode: state.stepMode,
      hold_mode: state.holdMode,
      active_lyric_text: activeLyric ? (activeLyric.data as { text?: string }).text : undefined,
    };
  }

  private setCueByIndex(index: number): void {
    const s = this.state as EngineRundownMsState;
    const wasPlaying = s.is_playing;
    const now = this.clock.now();
    const cue = s.cues[index]!;

    s.currentIndex = index;
    s.currentCueTitle = cue.title;
    s.kickoff_epoch_ms = now;
    s.deadline_epoch_ms = now + cue.duration_ms;
    s.last_stop_epoch_ms = now;

    // Kontynuuj odtwarzanie jeśli grało lub cue ma auto_start
    s.is_playing = wasPlaying || cue.auto_start;

    // Znajdź next cue dla eventu
    const nextCue = index < s.cues.length - 1
      ? s.cues[index + 1]
      : null;

    this.emit('cue-changed', cue, nextCue);
    this.emit('state-changed', this.state);
  }
}
