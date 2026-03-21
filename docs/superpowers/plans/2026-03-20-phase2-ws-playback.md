# Faza 2: WebSocket Server + Playback Engine — Plan Implementacji

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zbudować silnik odtwarzania (PlaybackEngine), serwer WebSocket i HTTP API (Companion-compatible) dla broadcast rundown managera.

**Architecture:** Trzy niezależne moduły z czystymi zależnościami:
- `PlaybackEngine` — czysta state machine z EventEmitter, zero IO, testowalna w izolacji
- `WsServer` — transport WebSocket, sesje, handshake, broadcast timesnapów z engine
- `HttpServer` — Express API tłumaczący HTTP GET na komendy PlaybackEngine

**Tech Stack:** TypeScript strict, ws npm, Express, vitest, EventEmitter, better-sqlite3 (repos z Fazy 1)

**Źródło prawdy typów:** `docs/ws-protocol.ts` i `docs/types.ts`

---

## Mapa plików

### Nowe pliki (tworzenie):

| Plik | Odpowiedzialność |
|------|-----------------|
| `electron/playback-engine.ts` | State machine: play/pause/next/prev/goto, budowanie timesnapów, over/under. Eksportuje też interfejs `Clock`. |
| `electron/ws-server.ts` | WebSocketServer na port 3141, sesje, handshake, broadcast, komendy C→S |
| `electron/http-server.ts` | Express na port 3142, 4 endpointy Companion GET |
| `tests/unit/playback-engine.test.ts` | Unit testy: logika start/pause/next, timer, over/under, auto_start |
| `tests/unit/ws-server.test.ts` | Unit testy: handshake, routing, broadcast, resync (real WS na random port) |
| `tests/unit/http-server.test.ts` | Unit testy: 4 endpointy GET z supertest |
| `tests/integration/ws-playback.test.ts` | Integracja: connect → play → timesnap → next → pause flow |
| `tests/helpers/mock-clock.ts` | MockClock — importuje `Clock` z `electron/playback-engine.ts` |
| `tests/helpers/ws-test-helpers.ts` | Współdzielone helpery WS: connectAndHandshake, sendCommand, waitForEvent, collectEvents |

### Modyfikowane pliki:

| Plik | Zmiana |
|------|--------|
| `package.json` | Dodanie `supertest` + `@types/supertest` do devDependencies |

---

## Chunk 1: PlaybackEngine

### Task 1: MockClock helper

**Files:**
- Create: `tests/helpers/mock-clock.ts`

- [ ] **Step 1: Napisz MockClock**

UWAGA: Interfejs `Clock` jest zdefiniowany i eksportowany z `electron/playback-engine.ts` (Task 3).
MockClock importuje go stamtąd — zależność: test → produkcja (nigdy odwrotnie).
Ten plik tworzysz po Task 3 (PlaybackEngine), ale logicznie opisujemy go tutaj.

```typescript
// tests/helpers/mock-clock.ts
import type { Clock } from '../../electron/playback-engine';

export type { Clock };

/** Zegar kontrolowany w testach */
export class MockClock implements Clock {
  private _now: number;

  constructor(startMs = 1_000_000_000_000) {
    this._now = startMs;
  }

  now(): number {
    return this._now;
  }

  advance(ms: number): void {
    this._now += ms;
  }

  set(ms: number): void {
    this._now = ms;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/helpers/mock-clock.ts
git commit -m "feat: add MockClock helper for deterministic time testing"
```

---

### Task 2: PlaybackEngine — testy (TDD: testy najpierw)

**Files:**
- Create: `tests/unit/playback-engine.test.ts`

- [ ] **Step 1: Napisz kompletne testy PlaybackEngine**

Testy pokrywają:
1. Tworzenie w stanie idle
2. loadRundown — ładuje cues, ustawia pierwszy jako current
3. play — ustawia kickoff/deadline/is_playing
4. pause — ustawia last_stop, is_playing=false
5. resume (play po pause) — zachowuje remaining time
6. next — przeskakuje na następny cue
7. next na ostatnim cue — nie wychodzi poza zakres
8. prev — wraca do poprzedniego
9. prev na pierwszym cue — zostaje na miejscu
10. goto — skacze do konkretnego cue
11. goto nieistniejący cue — rzuca błąd
12. buildTimesnap — generuje poprawny WsTimesnapPayload
13. over/under — oblicza poprawnie (ahead vs behind)
14. next z auto_start na następnym cue — automatycznie startuje
15. Emituje event 'state-changed' przy play/pause/next

```typescript
// tests/unit/playback-engine.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { PlaybackEngine } from '../../electron/playback-engine';
import { MockClock } from '../helpers/mock-clock';

describe('PlaybackEngine', () => {
  let db: Database.Database;
  let engine: PlaybackEngine;
  let clock: MockClock;
  let rundownId: string;

  beforeEach(() => {
    db = createTestDb();
    clock = new MockClock(1_000_000_000_000); // stały punkt startowy

    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);

    const cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);

    // Seed 3 cues: Opening (60s), Interview (120s, hard), Closing (30s, auto_start)
    cueRepo.create({
      rundown_id: rundownId, title: 'Opening', subtitle: 'Intro',
      duration_ms: 60_000, sort_order: 0,
    });
    cueRepo.create({
      rundown_id: rundownId, title: 'Interview', subtitle: 'Guest',
      duration_ms: 120_000, sort_order: 1,
      start_type: 'hard', hard_start_datetime: '2026-03-20T20:01:00.000Z',
    });
    cueRepo.create({
      rundown_id: rundownId, title: 'Closing', subtitle: 'Outro',
      duration_ms: 30_000, sort_order: 2, auto_start: true,
    });

    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
  });

  afterEach(() => {
    engine.destroy();
    db.close();
  });

  it('powinno wystartować w stanie idle', () => {
    const state = engine.getState();
    expect(state).toBeNull();
  });

  it('powinno załadować rundown i ustawić pierwszy cue', () => {
    engine.loadRundown(rundownId);
    const state = engine.getState();
    expect(state).not.toBeNull();
    expect(state!.mode).toBe('rundown_ms');
    expect(state!.is_playing).toBe(false);
    expect(state!.currentCueTitle).toBe('Opening');
  });

  it('powinno rozpocząć odtwarzanie (play)', () => {
    engine.loadRundown(rundownId);
    engine.play();
    const state = engine.getState()!;
    expect(state.is_playing).toBe(true);
    expect(state.kickoff_epoch_ms).toBe(clock.now());
    expect(state.deadline_epoch_ms).toBe(clock.now() + 60_000);
  });

  it('powinno zatrzymać odtwarzanie (pause)', () => {
    engine.loadRundown(rundownId);
    engine.play();
    clock.advance(10_000); // 10s elapsed
    engine.pause();
    const state = engine.getState()!;
    expect(state.is_playing).toBe(false);
    expect(state.last_stop_epoch_ms).toBe(clock.now());
  });

  it('powinno wznowić z zachowaniem remaining time', () => {
    engine.loadRundown(rundownId);
    engine.play();
    const playTime = clock.now();
    clock.advance(10_000); // 10s elapsed → remaining = 50s
    engine.pause();
    clock.advance(5_000); // 5s pauzy (nie liczy się)
    engine.play(); // resume
    const state = engine.getState()!;
    expect(state.is_playing).toBe(true);
    // remaining powinno nadal wynosić 50s
    expect(state.deadline_epoch_ms - clock.now()).toBe(50_000);
  });

  it('powinno przejść do następnego cue (next)', () => {
    engine.loadRundown(rundownId);
    engine.play();
    engine.next();
    const state = engine.getState()!;
    expect(state.currentCueTitle).toBe('Interview');
    expect(state.is_playing).toBe(true); // kontynuuje odtwarzanie
    expect(state.deadline_epoch_ms - state.kickoff_epoch_ms).toBe(120_000);
  });

  it('powinno zostać na ostatnim cue przy next', () => {
    engine.loadRundown(rundownId);
    engine.next(); // → Interview
    engine.next(); // → Closing
    engine.next(); // → nadal Closing
    const state = engine.getState()!;
    expect(state.currentCueTitle).toBe('Closing');
  });

  it('powinno wrócić do poprzedniego cue (prev)', () => {
    engine.loadRundown(rundownId);
    engine.next(); // → Interview
    engine.prev(); // → Opening
    const state = engine.getState()!;
    expect(state.currentCueTitle).toBe('Opening');
  });

  it('powinno zostać na pierwszym cue przy prev', () => {
    engine.loadRundown(rundownId);
    engine.prev(); // → nadal Opening
    const state = engine.getState()!;
    expect(state.currentCueTitle).toBe('Opening');
  });

  it('powinno skakać do konkretnego cue (goto)', () => {
    engine.loadRundown(rundownId);
    const cueRepo = createCueRepo(db);
    const cues = cueRepo.findByRundown(rundownId);
    const closingId = cues[2]!.id;
    engine.goto(closingId);
    const state = engine.getState()!;
    expect(state.currentCueTitle).toBe('Closing');
  });

  it('powinno rzucić błąd przy goto nieistniejącego cue', () => {
    engine.loadRundown(rundownId);
    expect(() => engine.goto('nonexistent-id')).toThrow();
  });

  it('powinno zbudować poprawny timesnap payload', () => {
    engine.loadRundown(rundownId);
    engine.play();
    clock.advance(5_000); // 5s elapsed
    const snap = engine.buildTimesnap();
    expect(snap).not.toBeNull();
    expect(snap!.tc_mode).toBe('rundown_ms');
    if (snap!.tc_mode === 'rundown_ms') {
      expect(snap!.tc.is_playing).toBe(true);
      expect(snap!.tc.kickoff_ms).toBeDefined();
      expect(snap!.tc.deadline_ms).toBeDefined();
      expect(snap!.rundown_id).toBe(rundownId);
      expect(snap!.next_cue_id).toBeDefined(); // Interview jest next
    }
  });

  it('powinno obliczać over/under poprawnie (ahead of schedule)', () => {
    engine.loadRundown(rundownId);
    engine.play();
    clock.advance(30_000); // 30s elapsed z 60s cue → 30s ahead
    const snap = engine.buildTimesnap();
    expect(snap).not.toBeNull();
    if (snap!.tc_mode === 'rundown_ms') {
      expect(snap!.over_under_ms).toBe(-30_000); // ujemny = ahead
    }
  });

  it('powinno obliczać over/under poprawnie (behind schedule)', () => {
    engine.loadRundown(rundownId);
    engine.play();
    clock.advance(70_000); // 70s elapsed z 60s cue → 10s behind
    const snap = engine.buildTimesnap();
    expect(snap).not.toBeNull();
    if (snap!.tc_mode === 'rundown_ms') {
      expect(snap!.over_under_ms).toBe(10_000); // dodatni = behind
    }
  });

  it('powinno emitować event state-changed przy play', () => {
    engine.loadRundown(rundownId);
    const handler = vi.fn();
    engine.on('state-changed', handler);
    engine.play();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('powinno emitować event cue-changed przy next', () => {
    engine.loadRundown(rundownId);
    const handler = vi.fn();
    engine.on('cue-changed', handler);
    engine.next();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Interview' }),
      expect.objectContaining({ title: 'Closing' }), // next cue
    );
  });

  it('powinno automatycznie startować cue z auto_start', () => {
    engine.loadRundown(rundownId);
    // engine NIE gra
    expect(engine.getState()!.is_playing).toBe(false);
    engine.next(); // → Interview (brak auto_start)
    expect(engine.getState()!.is_playing).toBe(false);
    engine.next(); // → Closing (auto_start: true)
    expect(engine.getState()!.is_playing).toBe(true);
  });

  it('powinno rzucić błąd przy play bez załadowanego rundownu', () => {
    expect(() => engine.play()).toThrow('No rundown loaded');
  });

  it('powinno rzucić błąd przy loadRundown nieistniejącego rundownu', () => {
    expect(() => engine.loadRundown('nonexistent-id')).toThrow('not found');
  });

  it('powinno zwrócić null z buildTimesnap gdy idle', () => {
    expect(engine.buildTimesnap()).toBeNull();
  });

  it('powinno podać next_hard_start_ms dla najbliższego hard cue', () => {
    engine.loadRundown(rundownId);
    engine.play();
    const snap = engine.buildTimesnap();
    if (snap && snap.tc_mode === 'rundown_ms') {
      // Interview (sort_order=1) jest hard cue
      expect(snap.next_hard_start_cue_id).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Uruchom testy — powinny FAILOWAĆ (brak implementacji)**

```bash
cd nextime && npx vitest run tests/unit/playback-engine.test.ts
```

Expected: FAIL — `Cannot find module '../../electron/playback-engine'`

- [ ] **Step 3: Commit test file**

```bash
git add tests/unit/playback-engine.test.ts
git commit -m "test: add PlaybackEngine unit tests (red phase)"
```

---

### Task 3: PlaybackEngine — implementacja

**Files:**
- Create: `electron/playback-engine.ts`

- [ ] **Step 1: Napisz PlaybackEngine**

```typescript
// electron/playback-engine.ts
import { EventEmitter } from 'events';

// ── Clock (dependency injection) ────────────────────────

/** Interfejs zegara — DI dla deterministycznego testowania */
export interface Clock {
  now(): number;
}

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
  group_id?: string;
}

export type EngineState = EngineRundownMsState | null;

// ── Timesnap payload (zgodny z docs/ws-protocol.ts) ──────

export interface TcProfileRundownMs {
  tc_mode: 'rundown_ms';
  kickoff_ms: number;
  deadline_ms: number;
  last_stop_ms: number;
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

export type TimesnapPayload = TimesnapRundownMs;
// Timeline mode zostanie dodany w Fazie 3

// ── Clock ────────────────────────────────────────────────

const systemClock: Clock = { now: () => Date.now() };

// ── Interfejsy repozytoriów (minimalny kontrakt) ─────────

interface CueRepoLike {
  findByRundown(rundownId: string): EngineCue[];
}

interface RundownRepoLike {
  findById(id: string): { id: string; name: string } | undefined;
}

// ── PlaybackEngine ───────────────────────────────────────

export class PlaybackEngine extends EventEmitter {
  private state: EngineState = null;

  constructor(
    private cueRepo: CueRepoLike,
    private rundownRepo: RundownRepoLike,
    private clock: Clock = systemClock,
  ) {
    super();
  }

  getState(): EngineState {
    return this.state;
  }

  /** Ładuje rundown z bazy i ustawia pierwszy cue jako aktualny */
  loadRundown(rundownId: string): void {
    const rundown = this.rundownRepo.findById(rundownId);
    if (!rundown) throw new Error(`Rundown ${rundownId} not found`);

    const cues = this.cueRepo.findByRundown(rundownId);
    if (cues.length === 0) throw new Error(`Rundown ${rundownId} has no cues`);

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

  /** Rozpoczyna lub wznawia odtwarzanie */
  play(): void {
    if (!this.state) throw new Error('No rundown loaded');

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

    this.state.last_stop_epoch_ms = this.clock.now();
    this.state.is_playing = false;
    this.emit('state-changed', this.state);
  }

  /** Przechodzi do następnego cue */
  next(): void {
    if (!this.state) throw new Error('No rundown loaded');

    const nextIndex = this.state.currentIndex + 1;
    if (nextIndex >= this.state.cues.length) return; // już ostatni

    this.setCueByIndex(nextIndex);
  }

  /** Wraca do poprzedniego cue */
  prev(): void {
    if (!this.state) throw new Error('No rundown loaded');

    const prevIndex = this.state.currentIndex - 1;
    if (prevIndex < 0) return; // już pierwszy

    this.setCueByIndex(prevIndex);
  }

  /** Skacze do konkretnego cue po ID */
  goto(cueId: string): void {
    if (!this.state) throw new Error('No rundown loaded');

    const index = this.state.cues.findIndex(c => c.id === cueId);
    if (index === -1) throw new Error(`Cue ${cueId} not found in rundown`);

    this.setCueByIndex(index);
  }

  /** Buduje WsTimesnapPayload z aktualnego stanu */
  buildTimesnap(): TimesnapPayload | null {
    if (!this.state) return null;

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
    let nextHardStart: { ms?: number; cueId?: string } = {};
    for (let i = this.state.currentIndex + 1; i < this.state.cues.length; i++) {
      const c = this.state.cues[i]!;
      if (c.start_type === 'hard' && c.hard_start_datetime) {
        const hardMs = new Date(c.hard_start_datetime).getTime();
        nextHardStart = {
          ms: hardMs - now,
          cueId: c.id,
        };
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
      next_hard_start_ms: nextHardStart.ms,
      next_hard_start_cue_id: nextHardStart.cueId,
    };
  }

  /** Niszczy engine — cleanup timerów */
  destroy(): void {
    this.removeAllListeners();
    this.state = null;
  }

  // ── Private ────────────────────────────────────────────

  private currentCue(): EngineCue {
    return this.state!.cues[this.state!.currentIndex]!;
  }

  private setCueByIndex(index: number): void {
    const wasPlaying = this.state!.is_playing;
    const now = this.clock.now();
    const cue = this.state!.cues[index]!;
    const prevCue = this.currentCue();

    this.state!.currentIndex = index;
    this.state!.currentCueTitle = cue.title;
    this.state!.kickoff_epoch_ms = now;
    this.state!.deadline_epoch_ms = now + cue.duration_ms;
    this.state!.last_stop_epoch_ms = now;

    // Kontynuuj odtwarzanie jeśli grało lub cue ma auto_start
    this.state!.is_playing = wasPlaying || cue.auto_start;

    // Znajdź next cue dla eventu
    const nextCue = index < this.state!.cues.length - 1
      ? this.state!.cues[index + 1]
      : null;

    this.emit('cue-changed', cue, nextCue);
    this.emit('state-changed', this.state);
  }
}
```

- [ ] **Step 2: Stwórz `tests/helpers/mock-clock.ts` (importuje Clock z engine)**

Patrz Task 1 wyżej — plik MockClock już opisany. Teraz go stwórz.

- [ ] **Step 3: Uruchom testy — powinny PRZECHODZIĆ**

```bash
cd nextime && npx vitest run tests/unit/playback-engine.test.ts
```

Expected: ALL PASS (15+ testów)

- [ ] **Step 4: Commit**

```bash
git add electron/playback-engine.ts tests/helpers/mock-clock.ts tests/unit/playback-engine.test.ts
git commit -m "feat: implement PlaybackEngine with rundown_ms mode (state machine, timesnap builder)"
```

---

## Chunk 2: WsServer

### Task 4: WS test helpers (współdzielone)

**Files:**
- Create: `tests/helpers/ws-test-helpers.ts`

- [ ] **Step 1: Napisz współdzielone helpery WS**

```typescript
// tests/helpers/ws-test-helpers.ts
import WebSocket from 'ws';

/** Łączy się z WS i wykonuje handshake client:hello → server:welcome */
export function connectAndHandshake(
  port: number,
  options?: { client_type?: string; watch_rundown?: string },
): Promise<{ ws: WebSocket; welcome: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        event: 'client:hello',
        payload: {
          client_type: options?.client_type ?? 'editor',
          auth_token: 'test-token',
          client_version: '1.0.0',
          watch_rundown: options?.watch_rundown,
        },
      }));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'server:welcome') {
        resolve({ ws, welcome: msg });
      }
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Timeout')), 3000);
  });
}

/** Wysyła komendę C→S i czeka na server:ack z pasującym req_id */
export function sendCommand(
  ws: WebSocket,
  event: string,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const reqId = `req-${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    const handler = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'server:ack' && msg.payload?.req_id === reqId) {
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ event, payload, req_id: reqId }));
    setTimeout(() => reject(new Error('Ack timeout')), 3000);
  });
}

/** Czeka na konkretny event S→C */
export function waitForEvent(
  ws: WebSocket,
  eventName: string,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const handler = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === eventName) {
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
    setTimeout(() => reject(new Error(`Timeout waiting for ${eventName}`)), timeoutMs);
  });
}

/** Zbiera N eventów danego typu */
export function collectEvents(
  ws: WebSocket,
  eventName: string,
  count: number,
  timeoutMs = 3000,
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const events: Array<Record<string, unknown>> = [];
    const handler = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === eventName) {
        events.push(msg);
        if (events.length >= count) {
          ws.removeListener('message', handler);
          resolve(events);
        }
      }
    };
    ws.on('message', handler);
    setTimeout(() => {
      ws.removeListener('message', handler);
      if (events.length > 0) resolve(events);
      else reject(new Error(`Timeout collecting ${eventName}`));
    }, timeoutMs);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/helpers/ws-test-helpers.ts
git commit -m "feat: add shared WS test helpers (connectAndHandshake, sendCommand, waitForEvent)"
```

---

### Task 5: WsServer — testy (TDD)

**Files:**
- Create: `tests/unit/ws-server.test.ts`

- [ ] **Step 1: Napisz testy WsServer**

Testy pokrywają:
1. Handshake — client:hello → server:welcome z initial_state
2. Brak handshake → server:error + rozłączenie
3. Ping/pong — client:ping → server:pong z RTT
4. Cmd:play → engine.play() + server:ack(ok=true)
5. Cmd:pause → engine.pause() + server:ack(ok=true)
6. Cmd:next → engine.next() + server:ack(ok=true)
7. Cmd:prev → engine.prev() + server:ack(ok=true)
8. Cmd:goto → engine.goto() + server:ack(ok=true)
9. Cmd:resync → wysyła pełny state (server:welcome ponownie)
10. Broadcast — timesnap dociera do wszystkich klientów
11. Seq numbering — inkrementuje per sesja
12. Rozłączenie — sesja usuwana z mapy

```typescript
// tests/unit/ws-server.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { PlaybackEngine } from '../../electron/playback-engine';
import { RundownWsServer } from '../../electron/ws-server';
import { MockClock } from '../helpers/mock-clock';
import { connectAndHandshake, sendCommand, waitForEvent } from '../helpers/ws-test-helpers';

describe('RundownWsServer', () => {
  let db: Database.Database;
  let engine: PlaybackEngine;
  let server: RundownWsServer;
  let port: number;
  let clock: MockClock;
  let rundownId: string;

  beforeEach(async () => {
    db = createTestDb();
    clock = new MockClock();
    const cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);
    rundownId = seedTestRundown(db,
      seedTestProject(db, seedTestUser(db)),
    );
    cueRepo.create({ rundown_id: rundownId, title: 'Cue 1', duration_ms: 60_000, sort_order: 0 });
    cueRepo.create({ rundown_id: rundownId, title: 'Cue 2', duration_ms: 30_000, sort_order: 1 });

    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
    engine.loadRundown(rundownId);

    server = new RundownWsServer(engine, clock);
    port = await server.start(0); // port 0 = auto-assign
  });

  afterEach(async () => {
    await server.stop();
    engine.destroy();
    db.close();
  });

  it('powinno przyjąć handshake i odpowiedzieć server:welcome', async () => {
    const { ws, welcome } = await connectAndHandshake(port);
    expect(welcome.event).toBe('server:welcome');
    expect(welcome.payload).toHaveProperty('session_id');
    expect(welcome.payload).toHaveProperty('initial_state');
    ws.close();
  });

  it('powinno odrzucić połączenie bez client:hello', async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const error = await new Promise<Record<string, unknown>>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ event: 'cmd:play', payload: {}, req_id: '1' }));
      });
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'server:error') resolve(msg);
      });
    });
    expect(error.payload).toHaveProperty('code', 'AUTH_FAILED');
    ws.close();
  });

  it('powinno odpowiadać pong na ping z RTT', async () => {
    const { ws } = await connectAndHandshake(port);
    const clientTs = Date.now();
    ws.send(JSON.stringify({
      event: 'client:ping',
      payload: { client_ts: clientTs },
    }));
    const pong = await waitForEvent(ws, 'server:pong');
    expect(pong.payload).toHaveProperty('client_ts', clientTs);
    expect(pong.payload).toHaveProperty('server_ts');
    ws.close();
  });

  it('powinno obsłużyć cmd:play i zwrócić ack', async () => {
    const { ws } = await connectAndHandshake(port);
    const ack = await sendCommand(ws, 'cmd:play');
    expect(ack.payload).toHaveProperty('ok', true);
    expect(engine.getState()!.is_playing).toBe(true);
    ws.close();
  });

  it('powinno obsłużyć cmd:pause i zwrócić ack', async () => {
    const { ws } = await connectAndHandshake(port);
    await sendCommand(ws, 'cmd:play');
    const ack = await sendCommand(ws, 'cmd:pause');
    expect(ack.payload).toHaveProperty('ok', true);
    expect(engine.getState()!.is_playing).toBe(false);
    ws.close();
  });

  it('powinno obsłużyć cmd:next i zwrócić ack', async () => {
    const { ws } = await connectAndHandshake(port);
    const ack = await sendCommand(ws, 'cmd:next');
    expect(ack.payload).toHaveProperty('ok', true);
    expect(engine.getState()!.currentCueTitle).toBe('Cue 2');
    ws.close();
  });

  it('powinno obsłużyć cmd:prev i zwrócić ack', async () => {
    const { ws } = await connectAndHandshake(port);
    await sendCommand(ws, 'cmd:next'); // → Cue 2
    const ack = await sendCommand(ws, 'cmd:prev');
    expect(ack.payload).toHaveProperty('ok', true);
    expect(engine.getState()!.currentCueTitle).toBe('Cue 1');
    ws.close();
  });

  it('powinno obsłużyć cmd:goto i zwrócić ack', async () => {
    const { ws } = await connectAndHandshake(port);
    const cueRepo = createCueRepo(db);
    const cues = cueRepo.findByRundown(rundownId);
    const ack = await sendCommand(ws, 'cmd:goto', { cue_id: cues[1]!.id });
    expect(ack.payload).toHaveProperty('ok', true);
    expect(engine.getState()!.currentCueTitle).toBe('Cue 2');
    ws.close();
  });

  it('powinno inkrementować seq per sesja', async () => {
    const { ws } = await connectAndHandshake(port);
    // welcome ma seq=0, ping response będzie seq=1
    ws.send(JSON.stringify({
      event: 'client:ping',
      payload: { client_ts: Date.now() },
    }));
    const pong = await waitForEvent(ws, 'server:pong');
    expect(pong.seq).toBeGreaterThan(0);
    ws.close();
  });

  it('powinno rozgłaszać timesnap do wszystkich klientów', async () => {
    const { ws: ws1 } = await connectAndHandshake(port);
    const { ws: ws2 } = await connectAndHandshake(port);

    await sendCommand(ws1, 'cmd:play');

    // Wymuś broadcast timesnap
    server.broadcastTimesnap();

    const snap1 = await waitForEvent(ws1, 'playback:timesnap');
    const snap2 = await waitForEvent(ws2, 'playback:timesnap');
    expect(snap1.payload).toHaveProperty('tc_mode', 'rundown_ms');
    expect(snap2.payload).toHaveProperty('tc_mode', 'rundown_ms');

    ws1.close();
    ws2.close();
  });

  it('powinno obsłużyć cmd:resync i odesłać pełny state', async () => {
    const { ws } = await connectAndHandshake(port);
    await sendCommand(ws, 'cmd:play');
    // Resync — powinno odesłać server:welcome z aktualnym stanem
    const resyncP = waitForEvent(ws, 'server:welcome');
    await sendCommand(ws, 'cmd:resync');
    const resync = await resyncP;
    expect(resync.event).toBe('server:welcome');
    expect(resync.payload).toHaveProperty('initial_state');
    ws.close();
  });

  it('powinno usunąć sesję po rozłączeniu', async () => {
    const { ws } = await connectAndHandshake(port);
    expect(server.getSessionCount()).toBe(1);
    ws.close();
    // Poczekaj na zamknięcie
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(server.getSessionCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Uruchom testy — powinny FAILOWAĆ**

```bash
cd nextime && npx vitest run tests/unit/ws-server.test.ts
```

Expected: FAIL — `Cannot find module '../../electron/ws-server'`

- [ ] **Step 3: Commit test file**

```bash
git add tests/unit/ws-server.test.ts
git commit -m "test: add WsServer unit tests (red phase)"
```

---

### Task 5: WsServer — implementacja

**Files:**
- Create: `electron/ws-server.ts`

- [ ] **Step 1: Napisz RundownWsServer**

```typescript
// electron/ws-server.ts
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import type { PlaybackEngine, TimesnapPayload } from './playback-engine';
import type { Clock } from './playback-engine';

// ── Typy sesji (zgodne z docs/ws-protocol.ts) ────────────

interface WsSession {
  id: string;
  ws: WebSocket;
  seq: number;
  clientType: string;
  cameraFilter?: number;
  watchRundown?: string;
  watchAct?: string;
  connectedAt: string;
}

interface WsEnvelope {
  event: string;
  payload: unknown;
  sent_at: number;
  seq: number;
  from?: string;
}

// ── Serwer ───────────────────────────────────────────────

const HANDSHAKE_TIMEOUT_MS = 5_000;

const systemClock: Clock = { now: () => Date.now() };

export class RundownWsServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, WsSession>();
  private timesnapTimer?: ReturnType<typeof setInterval>;
  private serverTimeTimer?: ReturnType<typeof setInterval>;

  constructor(
    private engine: PlaybackEngine,
    private clock: Clock = systemClock,
  ) {}

  /** Startuje serwer na podanym porcie (0 = auto-assign). Zwraca faktyczny port. */
  start(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port });
      this.wss.on('listening', () => {
        const addr = this.wss!.address();
        const actualPort = typeof addr === 'object' ? addr.port : port;
        // Timery startują DOPIERO po udanym nasłuchiwaniu
        this.timesnapTimer = setInterval(() => this.broadcastTimesnap(), 100);
        this.serverTimeTimer = setInterval(() => this.broadcastServerTime(), 30_000);
        resolve(actualPort);
      });
      this.wss.on('error', reject);
      this.wss.on('connection', (ws) => this.handleConnection(ws));
    });
  }

  /** Zatrzymuje serwer i zamyka wszystkie połączenia */
  stop(): Promise<void> {
    if (this.timesnapTimer) clearInterval(this.timesnapTimer);
    if (this.serverTimeTimer) clearInterval(this.serverTimeTimer);

    return new Promise((resolve) => {
      // Zamknij wszystkie sesje
      for (const session of this.sessions.values()) {
        session.ws.close();
      }
      this.sessions.clear();

      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /** Zwraca liczbę aktywnych sesji */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /** Ręczne wymuszenie broadcastu timesnap (do testów) */
  broadcastTimesnap(): void {
    const snap = this.engine.buildTimesnap();
    if (snap) {
      this.broadcast('playback:timesnap', snap);
    }
  }

  // ── Private ────────────────────────────────────────────

  private handleConnection(ws: WebSocket): void {
    let handshakeComplete = false;
    const sessionId = crypto.randomUUID();

    const timeout = setTimeout(() => {
      if (!handshakeComplete) {
        this.sendToWs(ws, 'server:error', {
          code: 'AUTH_FAILED',
          message: 'Handshake timeout',
          fatal: true,
        }, 0);
        ws.close();
      }
    }, HANDSHAKE_TIMEOUT_MS);

    ws.on('message', (raw) => {
      let msg: { event: string; payload?: Record<string, unknown>; req_id?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // ignoruj niepoprawny JSON
      }

      if (!handshakeComplete) {
        if (msg.event === 'client:hello') {
          clearTimeout(timeout);
          handshakeComplete = true;

          const session: WsSession = {
            id: sessionId,
            ws,
            seq: 0,
            clientType: String(msg.payload?.client_type ?? 'editor'),
            cameraFilter: msg.payload?.camera_filter as number | undefined,
            watchRundown: msg.payload?.watch_rundown as string | undefined,
            watchAct: msg.payload?.watch_act as string | undefined,
            connectedAt: new Date(this.clock.now()).toISOString(),
          };
          this.sessions.set(sessionId, session);
          this.sendWelcome(session);
        } else {
          clearTimeout(timeout);
          this.sendToWs(ws, 'server:error', {
            code: 'AUTH_FAILED',
            message: 'Expected client:hello as first message',
            fatal: true,
          }, 0);
          ws.close();
        }
        return;
      }

      // Po handshake — komendy
      const session = this.sessions.get(sessionId);
      if (session) {
        this.handleMessage(session, msg);
      }
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      this.sessions.delete(sessionId);
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      this.sessions.delete(sessionId);
    });
  }

  private handleMessage(
    session: WsSession,
    msg: { event: string; payload?: Record<string, unknown>; req_id?: string },
  ): void {
    switch (msg.event) {
      case 'client:ping':
        this.send(session, 'server:pong', {
          client_ts: msg.payload?.client_ts,
          server_ts: this.clock.now(),
        });
        break;

      case 'cmd:play':
        this.handleCommand(session, msg, () => this.engine.play());
        break;

      case 'cmd:pause':
        this.handleCommand(session, msg, () => this.engine.pause());
        break;

      case 'cmd:next':
        this.handleCommand(session, msg, () => this.engine.next());
        break;

      case 'cmd:prev':
        this.handleCommand(session, msg, () => this.engine.prev());
        break;

      case 'cmd:goto':
        this.handleCommand(session, msg, () => {
          const cueId = msg.payload?.cue_id as string;
          if (!cueId) throw new Error('Missing cue_id');
          this.engine.goto(cueId);
        });
        break;

      case 'cmd:resync':
        this.sendWelcome(session);
        this.handleCommand(session, msg, () => {});
        break;

      default:
        this.send(session, 'server:ack', {
          req_id: msg.req_id,
          ok: false,
          error: `Unknown command: ${msg.event}`,
        });
    }
  }

  private handleCommand(
    session: WsSession,
    msg: { req_id?: string },
    action: () => void,
  ): void {
    try {
      action();
      this.send(session, 'server:ack', { req_id: msg.req_id, ok: true });
    } catch (err) {
      this.send(session, 'server:ack', {
        req_id: msg.req_id,
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  private sendWelcome(session: WsSession): void {
    const snap = this.engine.buildTimesnap();
    this.send(session, 'server:welcome', {
      session_id: session.id,
      server_version: '1.0.0',
      initial_state: {
        server_time_ms: this.clock.now(),
        playback: snap ?? null,
      },
    });
  }

  private broadcastServerTime(): void {
    this.broadcast('server:time', {
      server_time_ms: this.clock.now(),
    });
  }

  /** Wysyła wiadomość do jednej sesji z envelope */
  private send(session: WsSession, event: string, payload: unknown): void {
    if (session.ws.readyState !== WebSocket.OPEN) return;
    const envelope: WsEnvelope = {
      event,
      payload,
      sent_at: this.clock.now(),
      seq: session.seq++,
    };
    session.ws.send(JSON.stringify(envelope));
  }

  /** Wysyła do surowego WebSocket (przed handshake) */
  private sendToWs(ws: WebSocket, event: string, payload: unknown, seq: number): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    const envelope: WsEnvelope = {
      event,
      payload,
      sent_at: this.clock.now(),
      seq,
    };
    ws.send(JSON.stringify(envelope));
  }

  /** Broadcast do wszystkich sesji */
  private broadcast(event: string, payload: unknown): void {
    for (const session of this.sessions.values()) {
      this.send(session, event, payload);
    }
  }
}
```

- [ ] **Step 2: Uruchom testy — powinny PRZECHODZIĆ**

```bash
cd nextime && npx vitest run tests/unit/ws-server.test.ts
```

Expected: ALL PASS (12+ testów)

- [ ] **Step 3: Commit**

```bash
git add electron/ws-server.ts tests/unit/ws-server.test.ts
git commit -m "feat: implement RundownWsServer with handshake, commands, and broadcast"
```

---

## Chunk 3: HttpServer + Integracja

### Task 6: Zainstaluj supertest

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Zainstaluj supertest**

```bash
cd nextime && npm install --save-dev supertest @types/supertest
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add supertest for HTTP endpoint testing"
```

---

### Task 7: HttpServer — testy + implementacja (TDD)

**Files:**
- Create: `tests/unit/http-server.test.ts`
- Create: `electron/http-server.ts`

- [ ] **Step 1: Napisz testy HTTP**

```typescript
// tests/unit/http-server.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { PlaybackEngine } from '../../electron/playback-engine';
import { createHttpServer } from '../../electron/http-server';
import { MockClock } from '../helpers/mock-clock';
import type { Express } from 'express';

describe('HttpServer (Companion API)', () => {
  let db: Database.Database;
  let engine: PlaybackEngine;
  let app: Express;
  let clock: MockClock;
  let rundownId: string;

  beforeEach(() => {
    db = createTestDb();
    clock = new MockClock();
    const cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
    cueRepo.create({ rundown_id: rundownId, title: 'Cue A', duration_ms: 60_000, sort_order: 0 });
    cueRepo.create({ rundown_id: rundownId, title: 'Cue B', duration_ms: 30_000, sort_order: 1 });

    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
    engine.loadRundown(rundownId);
    app = createHttpServer(engine);
  });

  afterEach(() => {
    engine.destroy();
    db.close();
  });

  it('GET /api/rundown/:id/start — powinno rozpocząć odtwarzanie', async () => {
    const res = await request(app).get(`/api/rundown/${rundownId}/start`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.timesnap).toHaveProperty('tc_mode', 'rundown_ms');
    expect(engine.getState()!.is_playing).toBe(true);
  });

  it('GET /api/rundown/:id/pause — powinno zatrzymać odtwarzanie', async () => {
    engine.play();
    const res = await request(app).get(`/api/rundown/${rundownId}/pause`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(engine.getState()!.is_playing).toBe(false);
  });

  it('GET /api/rundown/:id/next — powinno przejść na następny cue', async () => {
    const res = await request(app).get(`/api/rundown/${rundownId}/next`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(engine.getState()!.currentCueTitle).toBe('Cue B');
  });

  it('GET /api/rundown/:id/prev — powinno wrócić na poprzedni cue', async () => {
    engine.next();
    const res = await request(app).get(`/api/rundown/${rundownId}/prev`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(engine.getState()!.currentCueTitle).toBe('Cue A');
  });

  it('GET /api/unknown — powinno zwrócić 404', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Uruchom testy — FAIL**

```bash
cd nextime && npx vitest run tests/unit/http-server.test.ts
```

Expected: FAIL — `Cannot find module '../../electron/http-server'`

- [ ] **Step 3: Napisz HttpServer**

```typescript
// electron/http-server.ts
import express from 'express';
import type { Express } from 'express';
import type { PlaybackEngine } from './playback-engine';

// ── Typ odpowiedzi (zgodny z docs/ws-protocol.ts CompanionApiResponse) ──

interface CompanionApiResponse {
  ok: boolean;
  timesnap: ReturnType<PlaybackEngine['buildTimesnap']>;
  error?: string;
}

/** Tworzy Express app z endpointami Companion-compatible */
export function createHttpServer(engine: PlaybackEngine): Express {
  const app = express();

  // Helper: obsługuje komendę Companion i zwraca response
  const companionHandler = (action: () => void) => {
    return (req: express.Request, res: express.Response) => {
      // Walidacja: rundown ID musi zgadzać się z załadowanym
      const state = engine.getState();
      if (!state || state.rundownId !== req.params.id) {
        res.status(404).json({ ok: false, timesnap: null, error: 'Rundown not loaded or ID mismatch' });
        return;
      }
      try {
        action();
        res.json({ ok: true, timesnap: engine.buildTimesnap() } satisfies CompanionApiResponse);
      } catch (err) {
        res.status(500).json({
          ok: false,
          timesnap: null,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    };
  };

  // Companion-compatible endpoints (GET, jak Rundown Studio)
  app.get('/api/rundown/:id/start', companionHandler(() => engine.play()));
  app.get('/api/rundown/:id/pause', companionHandler(() => engine.pause()));
  app.get('/api/rundown/:id/next',  companionHandler(() => engine.next()));
  app.get('/api/rundown/:id/prev',  companionHandler(() => engine.prev()));

  // 404 dla nieznanych routów
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
```

- [ ] **Step 4: Uruchom testy — PASS**

```bash
cd nextime && npx vitest run tests/unit/http-server.test.ts
```

Expected: ALL PASS (5 testów)

- [ ] **Step 5: Commit**

```bash
git add electron/http-server.ts tests/unit/http-server.test.ts
git commit -m "feat: implement Companion HTTP API with start/pause/next/prev endpoints"
```

---

### Task 8: Testy integracyjne — pełny flow WS + Playback

**Files:**
- Create: `tests/integration/ws-playback.test.ts`

- [ ] **Step 1: Napisz testy integracyjne**

```typescript
// tests/integration/ws-playback.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { PlaybackEngine } from '../../electron/playback-engine';
import { RundownWsServer } from '../../electron/ws-server';
import { MockClock } from '../helpers/mock-clock';
import {
  connectAndHandshake,
  sendCommand,
  collectEvents,
} from '../helpers/ws-test-helpers';

describe('Integracja: WsServer + PlaybackEngine', () => {
  let db: Database.Database;
  let engine: PlaybackEngine;
  let server: RundownWsServer;
  let port: number;
  let clock: MockClock;
  let rundownId: string;

  beforeEach(async () => {
    db = createTestDb();
    clock = new MockClock();
    const cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);

    cueRepo.create({ rundown_id: rundownId, title: 'Intro', duration_ms: 60_000, sort_order: 0 });
    cueRepo.create({ rundown_id: rundownId, title: 'Main', duration_ms: 120_000, sort_order: 1 });
    cueRepo.create({ rundown_id: rundownId, title: 'Outro', duration_ms: 30_000, sort_order: 2 });

    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
    engine.loadRundown(rundownId);

    server = new RundownWsServer(engine, clock);
    port = await server.start(0);
  });

  afterEach(async () => {
    await server.stop();
    engine.destroy();
    db.close();
  });

  it('pełny flow: connect → play → timesnap → next → pause', async () => {
    // 1. Connect i handshake
    const { ws, welcome } = await connectAndHandshake(port);
    expect(welcome.event).toBe('server:welcome');
    const initial = (welcome as Record<string, Record<string, unknown>>).payload.initial_state;
    expect(initial).toHaveProperty('server_time_ms');

    // 2. Play
    const ackPlay = await sendCommand(ws, 'cmd:play');
    expect(ackPlay.payload).toHaveProperty('ok', true);

    // 3. Odbierz timesnap (ręczny broadcast)
    const snapPromise = collectEvents(ws, 'playback:timesnap', 1);
    server.broadcastTimesnap();
    const snaps = await snapPromise;
    expect(snaps[0]!.payload).toHaveProperty('tc_mode', 'rundown_ms');

    // 4. Next
    const ackNext = await sendCommand(ws, 'cmd:next');
    expect(ackNext.payload).toHaveProperty('ok', true);
    expect(engine.getState()!.currentCueTitle).toBe('Main');

    // 5. Pause
    const ackPause = await sendCommand(ws, 'cmd:pause');
    expect(ackPause.payload).toHaveProperty('ok', true);
    expect(engine.getState()!.is_playing).toBe(false);

    ws.close();
  });

  it('wielu klientów: broadcast dociera do wszystkich', async () => {
    const { ws: ws1 } = await connectAndHandshake(port);
    const { ws: ws2 } = await connectAndHandshake(port);
    const { ws: ws3 } = await connectAndHandshake(port);

    expect(server.getSessionCount()).toBe(3);

    await sendCommand(ws1, 'cmd:play');

    // Broadcast timesnap
    const snap1P = collectEvents(ws1, 'playback:timesnap', 1);
    const snap2P = collectEvents(ws2, 'playback:timesnap', 1);
    const snap3P = collectEvents(ws3, 'playback:timesnap', 1);
    server.broadcastTimesnap();

    const [s1, s2, s3] = await Promise.all([snap1P, snap2P, snap3P]);
    expect(s1[0]!.payload).toHaveProperty('tc_mode');
    expect(s2[0]!.payload).toHaveProperty('tc_mode');
    expect(s3[0]!.payload).toHaveProperty('tc_mode');

    ws1.close();
    ws2.close();
    ws3.close();
  });

  it('resync: klient żąda pełnego stanu po gap', async () => {
    const { ws } = await connectAndHandshake(port);
    await sendCommand(ws, 'cmd:play');

    // Żądaj resync — powinno dostać server:welcome z aktualnym stanem
    const resyncP = collectEvents(ws, 'server:welcome', 1);
    await sendCommand(ws, 'cmd:resync');
    const resyncMsgs = await resyncP;
    const state = resyncMsgs[0];
    expect(state).toHaveProperty('event', 'server:welcome');
    expect((state as Record<string, Record<string, unknown>>).payload).toHaveProperty('initial_state');

    ws.close();
  });
});
```

- [ ] **Step 2: Uruchom testy integracyjne — PASS**

```bash
cd nextime && npx vitest run tests/integration/ws-playback.test.ts
```

Expected: ALL PASS (3 testy)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/ws-playback.test.ts
git commit -m "test: add integration tests for WsServer + PlaybackEngine full flow"
```

---

### Task 9: Uruchom WSZYSTKIE testy + finalna weryfikacja

- [ ] **Step 1: Uruchom pełen zestaw testów**

```bash
cd nextime && npx vitest run
```

Expected: ALL PASS — testy z Fazy 1 (unit + integration) + nowe testy Fazy 2

- [ ] **Step 2: Sprawdź TypeScript strict**

```bash
cd nextime && npx tsc --noEmit
```

Expected: Zero błędów

- [ ] **Step 3: Commit końcowy**

```bash
git add -A
git commit -m "feat: Phase 2 complete — PlaybackEngine, WsServer, HttpServer with full test coverage"
```

---

## Podsumowanie testów

| Moduł | Plik testowy | Liczba testów | Typ |
|-------|-------------|---------------|-----|
| PlaybackEngine | `tests/unit/playback-engine.test.ts` | ~19 | Unit |
| WsServer | `tests/unit/ws-server.test.ts` | ~13 | Unit |
| HttpServer | `tests/unit/http-server.test.ts` | ~5 | Unit |
| WS + Playback | `tests/integration/ws-playback.test.ts` | ~3 | Integration |
| **RAZEM Faza 2** | | **~40** | |
| **+ Faza 1** | | **~111** | |
| **ŁĄCZNIE** | | **~151** | |

## Nowe pliki (Faza 2)

| Plik | Linii (szacunek) |
|------|-----------------|
| `electron/playback-engine.ts` | ~210 |
| `electron/ws-server.ts` | ~260 |
| `electron/http-server.ts` | ~60 |
| `tests/helpers/mock-clock.ts` | ~25 |
| `tests/helpers/ws-test-helpers.ts` | ~90 |
| `tests/unit/playback-engine.test.ts` | ~210 |
| `tests/unit/ws-server.test.ts` | ~170 |
| `tests/unit/http-server.test.ts` | ~70 |
| `tests/integration/ws-playback.test.ts` | ~110 |
| **RAZEM** | **~1205** |
