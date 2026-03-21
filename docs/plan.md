# Faza 6 — Live Timeline Playback + Keyboard Shortcuts

## Kontekst

Fazy 1-5b ukończone. Timeline UI jest interaktywny (CRUD cue/track/act), ale brakuje **playback live** — silnik nie wykonuje cue'ów przy odtwarzaniu, nie ma Step Mode, Hold Mode, keyboard shortcuts ani interpolacji playhead. Celem jest replikacja zachowania CuePilot: timeline odtwarza frame-by-frame, cue'y się "odpalają" w odpowiednim momencie, operatorzy dostają sygnały.

## Pliki do modyfikacji

| Plik | Zmiana |
|---|---|
| `electron/playback-engine.ts` | Cue cache, cue executor, step/hold mode, rozszerzony timesnap |
| `electron/ws-server.ts` | Rozdzielenie tick/broadcast, nowe eventy, nowe komendy |
| `src/store/playback.store.ts` | Nowy stan: stepMode, holdMode, speed, activeLyricText, interpolacja |
| `src/hooks/useRundownSocket.ts` | Obsługa nowych eventów WS |
| `src/hooks/usePlayback.ts` | Nowy hook `useTimelinePlayhead()` z interpolacją kliencką |
| `src/hooks/useKeyboardShortcuts.ts` | **NOWY** — globalny system skrótów klawiszowych |
| `src/components/TransportBar/TransportBar.tsx` | Wskaźniki STEP/HOLD/speed, timecode timeline |
| `src/components/Timeline/Timeline.tsx` | Interpolowany playhead |
| `src/components/ShotlistPanel/ShotlistPanel.tsx` | Wskaźnik HOLD |
| `src/App.tsx` | Integracja useKeyboardShortcuts |
| `electron/main.ts` | `engine.reloadTimelineCues()` po CRUD IPC |
| `tests/unit/cue-executor.test.ts` | **NOWY** — testy cue executora |
| `tests/unit/step-hold-mode.test.ts` | **NOWY** — testy step/hold mode |

---

## Krok 1: Cue Cache w PlaybackEngine

**Plik:** `electron/playback-engine.ts`

### 1a. Rozszerzenie TimelineCueRepoLike

Dodaj `findByAct` do interfejsu (repo już ma tę metodę — linia 86 timeline-cue.repo.ts):

```typescript
export interface TimelineCueRepoLike {
  findActiveAtFrame(...): ...;
  findByActAndType(...): ...;
  findByAct(actId: string): Array<{
    id: string; track_id: string; type: string;
    tc_in_frames: number; tc_out_frames?: number;
    data: Record<string, unknown>;
  }>;
}
```

### 1b. Nowy typ CachedTimelineCue

```typescript
export interface CachedTimelineCue {
  id: string;
  track_id: string;
  type: string;
  tc_in_frames: number;
  tc_out_frames?: number;
  data: Record<string, unknown>;
}
```

### 1c. Nowe pola prywatne w PlaybackEngine

```typescript
private cachedCues: CachedTimelineCue[] = [];
private activeCueIds = new Set<string>();
private firedPointCueIds = new Set<string>();
private preWarnedCueIds = new Set<string>();
```

### 1d. Cache w loadAct()

Po ustawieniu `this.state`, dodaj:
```typescript
this.loadCueCache();
```

Nowa metoda:
```typescript
private loadCueCache(): void {
  if (!this.state || this.state.mode !== 'timeline_frames' || !this.timelineCueRepo) return;
  this.cachedCues = this.timelineCueRepo.findByAct(this.state.actId).map(c => ({
    id: c.id, track_id: c.track_id, type: c.type,
    tc_in_frames: c.tc_in_frames, tc_out_frames: c.tc_out_frames,
    data: c.data,
  }));
  this.resetCueTracker();
}
```

### 1e. Publiczny reloadTimelineCues()

```typescript
reloadTimelineCues(): void {
  this.loadCueCache();
  this.recalculateActiveCues();
}
```

### 1f. Helpery trackera

```typescript
private resetCueTracker(): void {
  this.activeCueIds.clear();
  this.firedPointCueIds.clear();
  this.preWarnedCueIds.clear();
}

private isCueAtFrame(cue: CachedTimelineCue, frame: number): boolean {
  if (cue.tc_out_frames === undefined) return frame === cue.tc_in_frames;
  return frame >= cue.tc_in_frames && frame < cue.tc_out_frames;
}

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
```

---

## Krok 2: Cue Executor

**Plik:** `electron/playback-engine.ts`

### 2a. Nowa metoda executeCues()

Wywoływana z `tickFrames()` ZAMIAST `updateActiveVisionCue()`:

```typescript
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
```

### 2b. onCueEnter / onCueExit

```typescript
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

private onCueExit(cue: CachedTimelineCue): void {
  this.emit('cue-exited', cue);
  if (cue.type === 'lyric') this.emit('lyric-changed', null, undefined);
  if (cue.type === 'marker') this.emit('marker-inactive', cue.id);
}
```

### 2c. updateVisionCueFromCache() — zastępuje updateActiveVisionCue()

Iteruje `this.cachedCues` zamiast odpytywać bazę. Respektuje holdMode:

```typescript
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
```

### 2d. Aktualizacja tickFrames()

Zamień `this.updateActiveVisionCue()` na `this.executeCues()`.

### 2e. Aktualizacja scrub()

Zamień `this.updateActiveVisionCue()` na `this.recalculateActiveCues()` (bez emitowania enter/exit).

---

## Krok 3: Step Mode + Hold Mode

**Plik:** `electron/playback-engine.ts`

### 3a. Rozszerzenie EngineTimelineFramesState

```typescript
export interface EngineTimelineFramesState {
  // ...istniejące pola...
  stepMode: boolean;
  holdMode: boolean;
}
```

Inicjalizacja w `loadAct()`: `stepMode: false, holdMode: false`.

### 3b. Nowe metody

```typescript
toggleStepMode(): void {
  if (!this.state || this.state.mode !== 'timeline_frames') return;
  this.state.stepMode = !this.state.stepMode;
  if (this.state.stepMode && this.state.is_playing) {
    this.state.is_playing = false;
  }
  this.emit('mode-changed', { stepMode: this.state.stepMode, holdMode: this.state.holdMode });
  this.emit('state-changed', this.state);
}

toggleHoldMode(): void {
  if (!this.state || this.state.mode !== 'timeline_frames') return;
  this.state.holdMode = !this.state.holdMode;
  this.emit('mode-changed', { stepMode: this.state.stepMode, holdMode: this.state.holdMode });
  this.emit('state-changed', this.state);
}

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
```

### 3c. Blokada play() w step mode

Na początku timeline branch w `play()`:
```typescript
if (this.state.stepMode) return; // Step mode — play zablokowany
```

---

## Krok 4: Rozszerzenie Timesnap + Nowe eventy WS

### 4a. Rozszerzenie TimesnapTimelineFrames

**Pliki:** `electron/playback-engine.ts` + `src/store/playback.store.ts`

Dodaj pola:
```typescript
export interface TimesnapTimelineFrames {
  // ...istniejące...
  speed: number;
  step_mode: boolean;
  hold_mode: boolean;
  active_lyric_text?: string;
}
```

Aktualizacja `buildTimelineTimesnap()`:
```typescript
private buildTimelineTimesnap(state: EngineTimelineFramesState): TimesnapTimelineFrames {
  const frame = Math.floor(state.currentTcFrames);
  const activeLyric = this.cachedCues.find(c =>
    c.type === 'lyric' && this.isCueAtFrame(c, frame)
  );

  return {
    // ...istniejące pola...
    speed: state.speed,
    step_mode: state.stepMode,
    hold_mode: state.holdMode,
    active_lyric_text: activeLyric ? (activeLyric.data as { text?: string }).text : undefined,
  };
}
```

---

## Krok 5: WS Server — rozdzielenie tick/broadcast + nowe eventy

**Plik:** `electron/ws-server.ts`

### 5a. Rozdzielenie tick od broadcast

Nowy prywatny timer:
```typescript
private tickTimer?: ReturnType<typeof setInterval>;
```

W `start()`:
```typescript
this.tickTimer = setInterval(() => this.engine.tick(), 40); // ~25fps
this.timesnapTimer = setInterval(() => this.broadcastTimesnap(), 100);
```

W `broadcastTimesnap()` — USUŃ `this.engine.tick()`:
```typescript
broadcastTimesnap(): void {
  const snap = this.engine.buildTimesnap();
  if (snap) this.broadcast('playback:timesnap', snap);
}
```

W `stop()` — dodaj `clearInterval(this.tickTimer)`.

### 5b. Nowe listenery engine → broadcast

W konstruktorze, po istniejącym `vision-cue-changed`:

```typescript
this.engine.on('cue-entered', (cue) => {
  this.broadcast('act:cue_executed', {
    act_id: this.getActiveActId(), cue_id: cue.id,
    cue_type: cue.type, action: 'entered', data: cue.data,
  });
});

this.engine.on('cue-exited', (cue) => {
  this.broadcast('act:cue_executed', {
    act_id: this.getActiveActId(), cue_id: cue.id,
    cue_type: cue.type, action: 'exited', data: cue.data,
  });
});

this.engine.on('lyric-changed', (text: string | null) => {
  this.broadcast('act:lyric_changed', {
    act_id: this.getActiveActId(), text,
  });
});

this.engine.on('mode-changed', (modes: { stepMode: boolean; holdMode: boolean }) => {
  this.broadcast('act:mode_changed', {
    act_id: this.getActiveActId(),
    step_mode: modes.stepMode, hold_mode: modes.holdMode,
  });
});

this.engine.on('cue-pre-warning', (cue, framesUntil: number) => {
  this.broadcast('act:marker_warning', {
    act_id: this.getActiveActId(),
    marker: { id: cue.id, label: (cue.data as Record<string,unknown>).label ?? '', color: (cue.data as Record<string,unknown>).color ?? '#ef4444' },
    frames_until: framesUntil,
  });
});
```

### 5c. Nowe komendy C→S

W `handleMessage()` switch:
```typescript
case 'cmd:step_mode':
  this.handleCommand(session, msg, () => this.engine.toggleStepMode());
  break;
case 'cmd:hold_mode':
  this.handleCommand(session, msg, () => this.engine.toggleHoldMode());
  break;
case 'cmd:step_next':
  this.handleCommand(session, msg, () => this.engine.stepToNextCue());
  break;
case 'cmd:take_shot':
  this.handleCommand(session, msg, () => this.engine.takeNextShot());
  break;
```

---

## Krok 6: Store + WS klient

### 6a. Nowy stan w store

**Plik:** `src/store/playback.store.ts`

Nowe pola:
```typescript
stepMode: boolean;         // false
holdMode: boolean;         // false
speed: number;             // 1.0
activeLyricText: string | null;  // null
activeMarker: { label: string; color: string; cueId: string } | null;  // null
lastTimesnapAt: number;    // 0  — timestamp otrzymania timesnap
lastTimesnapFrames: number; // 0 — pozycja frames z ostatniego timesnap
```

Nowe akcje:
```typescript
setStepMode: (v: boolean) => set({ stepMode: v }),
setHoldMode: (v: boolean) => set({ holdMode: v }),
setSpeed: (v: number) => set({ speed: v }),
setActiveLyricText: (t: string | null) => set({ activeLyricText: t }),
setActiveMarker: (m: ...) => set({ activeMarker: m }),
```

Rozszerzenie `setPlayback` dla timeline_frames — wyciągnij nowe pola:
```typescript
if (payload.tc_mode === 'timeline_frames') {
  set({
    playback: payload,
    currentTcFrames: payload.tc.current_frames,
    fps: payload.tc.fps,
    speed: payload.speed,
    stepMode: payload.step_mode,
    holdMode: payload.hold_mode,
    activeLyricText: payload.active_lyric_text ?? null,
    lastTimesnapAt: Date.now(),
    lastTimesnapFrames: payload.tc.current_frames,
  });
}
```

### 6b. Nowe eventy w useRundownSocket

**Plik:** `src/hooks/useRundownSocket.ts`

Dodaj do `dispatch()` switch:
```typescript
case 'act:lyric_changed': {
  const p = envelope.payload as { text: string | null };
  usePlaybackStore.getState().setActiveLyricText(p.text);
  break;
}
case 'act:mode_changed': {
  const p = envelope.payload as { step_mode: boolean; hold_mode: boolean };
  usePlaybackStore.getState().setStepMode(p.step_mode);
  usePlaybackStore.getState().setHoldMode(p.hold_mode);
  break;
}
case 'act:marker_warning': {
  const p = envelope.payload as { marker: { id: string; label: string; color: string } };
  usePlaybackStore.getState().setActiveMarker({
    cueId: p.marker.id, label: p.marker.label, color: p.marker.color,
  });
  setTimeout(() => usePlaybackStore.getState().setActiveMarker(null), 3000);
  break;
}
case 'act:cue_executed':
  break; // pełna obsługa w Phase 7+
```

---

## Krok 7: Interpolacja playhead (klient)

**Plik:** `src/hooks/usePlayback.ts`

Nowy eksportowany hook — REUŻYWA istniejący `useAnimationFrame` (wyeksportuj go):

```typescript
export function useTimelinePlayhead(): number {
  const currentTcFrames = usePlaybackStore(s => s.currentTcFrames);
  const fps = usePlaybackStore(s => s.fps);
  const speed = usePlaybackStore(s => s.speed);
  const isPlaying = usePlaybackStore(s => s.playback)?.tc.is_playing ?? false;
  const lastAt = usePlaybackStore(s => s.lastTimesnapAt);
  const lastFrames = usePlaybackStore(s => s.lastTimesnapFrames);
  const [interpolated, setInterpolated] = useState(currentTcFrames);

  const update = useCallback(() => {
    if (!isPlaying || !lastAt) { setInterpolated(currentTcFrames); return; }
    const elapsed = (Date.now() - lastAt) / 1000;
    const realFps = fps === 29 ? 29.97 : fps === 59 ? 59.94 : fps;
    setInterpolated(lastFrames + elapsed * realFps * speed);
  }, [isPlaying, currentTcFrames, fps, speed, lastAt, lastFrames]);

  useAnimationFrame(update, isPlaying);
  useEffect(() => { if (!isPlaying) setInterpolated(currentTcFrames); }, [currentTcFrames, isPlaying]);

  return interpolated;
}
```

### Użycie w Timeline.tsx

Zamień `framesToPx(currentTcFrames)` na `framesToPx(useTimelinePlayhead())`.

---

## Krok 8: Keyboard Shortcuts

**Nowy plik:** `src/hooks/useKeyboardShortcuts.ts`

### Mapa skrótów (CuePilot PC):

| Klawisz | Akcja | Tryb |
|---|---|---|
| Space | Play/Pause toggle | Globalny |
| F3 | Toggle Step Mode | Timeline |
| F8 | Take next shot | Timeline |
| F9 | Toggle Hold Mode | Timeline |
| J | Step to next cue | Timeline |
| Left | Scrub -1 frame | Timeline |
| Right | Scrub +1 frame | Timeline |
| Shift+Left | Scrub -10 frames | Timeline |
| Shift+Right | Scrub +10 frames | Timeline |
| Ctrl+Left | Move selected cue -1 frame | Timeline |
| Ctrl+Right | Move selected cue +1 frame | Timeline |
| Ctrl+Shift+Left | Move selected cue -10 frames | Timeline |
| Ctrl+Shift+Right | Move selected cue +10 frames | Timeline |
| F1 | Toggle LTC1 (placeholder) | Timeline |
| F2 | Toggle LTC2 (placeholder) | Timeline |
| F4 | TC offset -1 frame (placeholder) | Timeline |
| F5 | Apply TC offset (placeholder) | Timeline |
| F6 | TC offset +1 frame (placeholder) | Timeline |
| F7 | Recall PTZ presets (placeholder) | Timeline |
| F10 | Toggle add/execute mode (placeholder) | Timeline |

### Implementacja

- Sprawdzanie `isEditable(document.activeElement)` — blokuj shortcuts w input/textarea/select
- Escape zawsze działa (obsługiwane przez komponenty)
- Space: czytaj `playback.tc.is_playing` ze store → wysyłaj `cmd:play` lub `cmd:pause`
- Strzałki + Ctrl: `moveCue()` helper — IPC updateTimelineCue + store update
- Strzałki bez Ctrl: `sendCommand('cmd:scrub', ...)` z obliczoną nową pozycją

### Integracja w App.tsx

```typescript
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
// W App():
useKeyboardShortcuts({ sendCommand });
```

---

## Krok 9: UI — TransportBar, ShotlistPanel

### 9a. TransportBar — wskaźniki STEP/HOLD/Speed + timeline TC

**Plik:** `src/components/TransportBar/TransportBar.tsx`

- Dodaj odczyt `stepMode`, `holdMode`, `speed`, `viewMode`, `currentTcFrames`, `fps` ze store
- Badge `STEP` (amber) gdy stepMode aktywny
- Badge `HOLD` (red) gdy holdMode aktywny
- Wyświetlenie `{speed}x` gdy speed !== 1.0
- W trybie timeline: timecode (HH:MM:SS:FF) zamiast countdown ms

### 9b. ShotlistPanel — wskaźnik HOLD

**Plik:** `src/components/ShotlistPanel/ShotlistPanel.tsx`

- Dodaj odczyt `holdMode` ze store
- Czerwony banner "Camera HOLD" pod nagłówkiem gdy holdMode aktywny

---

## Krok 10: main.ts — reload cache po CRUD

**Plik:** `electron/main.ts`

Po każdym IPC handler `nextime:createTimelineCue`, `nextime:updateTimelineCue`, `nextime:deleteTimelineCue`, dodaj:
```typescript
engine.reloadTimelineCues();
```

---

## Krok 11: Testy

### 11a. `tests/unit/cue-executor.test.ts` (NOWY)

| # | Test | Opis |
|---|---|---|
| 1 | Vision cue enter/exit | tickFrames emituje cue-entered i cue-exited |
| 2 | Lyric cue enter | Emituje lyric-changed z tekstem |
| 3 | Lyric cue exit | Emituje lyric-changed z null |
| 4 | Marker pre-warning | Emituje cue-pre-warning N klatek przed tc_in |
| 5 | Point cue single fire | Point cue odpala dokładnie raz |
| 6 | Multiple active cues | Wiele cue'ów aktywnych jednocześnie |
| 7 | scrub() no events | scrub() recalculate BEZ emitowania enter/exit |
| 8 | reloadTimelineCues | Resetuje tracker i przelicza |

### 11b. `tests/unit/step-hold-mode.test.ts` (NOWY)

| # | Test | Opis |
|---|---|---|
| 1 | toggleStepMode | Flipuje stepMode, pauzuje playback |
| 2 | toggleHoldMode | Flipuje holdMode |
| 3 | play() blocked | play() nie działa w step mode |
| 4 | stepToNextCue | Skacze do następnego vision cue |
| 5 | stepToNextCue executes | Wykonuje cue'y na pozycji docelowej |
| 6 | takeNextShot | Wymusza następny vision cue jako aktywny |
| 7 | holdMode blocks vision | holdMode blokuje zmiany vision cue |

### 11c. Rozszerzenie istniejących testów

- `playback-engine-timeline.test.ts` — test na rozszerzony timesnap (speed, step_mode, hold_mode)
- `playback-store-crud.test.ts` — testy nowych pól store

---

## Kolejność implementacji

```
Krok 1  Cue cache (engine)                    ← fundament
Krok 2  Cue executor (engine)                 ← zależy od 1
Krok 3  Step/Hold mode (engine)               ← zależy od 2
Krok 4  Rozszerzony timesnap (engine+store)   ← zależy od 3
Krok 5  WS server zmiany                      ← zależy od 2, 3, 4
Krok 6  Store + WS klient                     ← zależy od 4, 5
Krok 7  Interpolacja playhead                 ← zależy od 6
Krok 8  Keyboard shortcuts                    ← zależy od 6
Krok 9  UI updates (TransportBar, Shotlist)   ← zależy od 6
Krok 10 main.ts reload cache                  ← zależy od 1 (równolegle z 2-9)
Krok 11 Testy                                 ← pisane przy każdym kroku
```

---

## Weryfikacja

Po implementacji:
1. `npx tsc --noEmit` — zero błędów TypeScript
2. `npx vitest run` — wszystkie testy przechodzą (istniejące + nowe)
3. `npm run dev` — uruchom aplikację i zweryfikuj:
   - **Play/Pause Space** — timeline odtwarza/pauzuje
   - **Strzałki** — scrub ±1 / ±10 klatek
   - **Ctrl+Strzałki** — przesunięcie zaznaczonego cue
   - **F3** — toggle STEP mode (badge w TransportBar)
   - **F9** — toggle HOLD (badge w TransportBar + ShotlistPanel)
   - **J** — step do następnego vision cue
   - **F8** — take next shot
   - **Playhead interpolacja** — płynny ruch playhead przy odtwarzaniu
   - **Cue executor** — vision cue podświetla się automatycznie przy przejściu playhead
   - **Lyric** — activeLyricText w store zmienia się gdy playhead przejeżdża lyric cue
