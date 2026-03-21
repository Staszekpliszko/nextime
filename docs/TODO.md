# NEXTIME — TODO / Historia postępów

## Faza 1 — Fundament [UKOŃCZONA]

- [x] `package.json` + `tsconfig.json` + `vite.config.ts` + `vitest.config.ts`
- [x] `electron/db/connection.ts` — better-sqlite3 singleton + PRAGMAy (WAL, FK, synchronous)
- [x] `electron/db/migrate.ts` — runner schema.sql (exec + fromString)
- [x] `electron/db/repositories/base.ts` — generateId, toBool, fromBool, parseJson, toJson
- [x] 15 repozytoriów CRUD (`electron/db/repositories/*.repo.ts`):
  - user, event, project, rundown, column, cue-group, cue, cell,
    private-note, text-variable, output-config, act, track, timeline-cue, media-file
- [x] Discriminated unions: Cue (soft/hard), TimelineCue (7 typów)
- [x] Boolean 0/1 konwersja, JSON parse/stringify w repo layer
- [x] `tests/helpers/test-db.ts` — in-memory DB + seeds (user, event, project, rundown)
- [x] 17 plików testów unit (`tests/unit/db/*.test.ts`) — 111 testów
- [x] Test integracyjny cascade delete (`tests/integration/db/cascade-delete.test.ts`)
- [x] TypeScript strict, zero `any`, zero błędów `tsc --noEmit`
- [x] Demo UI (`src/NextTime.jsx`) — showcase komponentów

**Statystyki Fazy 1:** 111 testów, ~8100 linii kodu

---

## Faza 2 — WebSocket Server + Playback Engine [UKOŃCZONA]

- [x] `electron/playback-engine.ts` — PlaybackEngine (state machine + EventEmitter):
  - Eksportuje interfejs `Clock` (DI dla deterministycznego testowania)
  - Typy: `EngineRundownMsState`, `EngineCue`, `TimesnapPayload`, `TcProfileRundownMs`
  - Metody: `loadRundown()`, `play()`, `pause()`, `next()`, `prev()`, `goto()`, `buildTimesnap()`, `destroy()`
  - Emituje eventy: `state-changed`, `cue-changed`
  - Over/under obliczenia, hard-start countdown
  - Auto_start logika (cue z auto_start=true startuje automatycznie)
- [x] `electron/ws-server.ts` — RundownWsServer:
  - WebSocketServer na port 0 (auto-assign) lub konfigurowalny
  - Handshake: `client:hello` → `server:welcome` z initial_state
  - Sesje: `Map<string, WsSession>` z seq counter per klient
  - Komendy C→S: play, pause, next, prev, goto, resync
  - Ack: `server:ack` po każdej komendzie (ok/error)
  - Ping/pong: `client:ping` → `server:pong` z RTT
  - Broadcast: timesnap co 100ms, server:time co 30s
  - Timery startują po `listening` event (nie przed)
  - Handshake timeout 5s, odrzucenie bez `client:hello`
- [x] `electron/http-server.ts` — Companion HTTP API:
  - `createHttpServer(engine)` → Express app
  - 4 endpointy GET: `/api/rundown/:id/start|pause|next|prev`
  - Walidacja rundown ID (404 jeśli nie zgadza się z załadowanym)
  - Helper `companionHandler()` eliminuje duplikację
  - Zwraca `CompanionApiResponse { ok, timesnap }`
- [x] `tests/helpers/mock-clock.ts` — MockClock (importuje Clock z engine)
- [x] `tests/helpers/ws-test-helpers.ts` — współdzielone helpery WS:
  - `connectAndHandshake()`, `sendCommand()`, `waitForEvent()`, `collectEvents()`
- [x] `tests/unit/playback-engine.test.ts` — 21 testów unit
- [x] `tests/unit/ws-server.test.ts` — 12 testów unit
- [x] `tests/unit/http-server.test.ts` — 6 testów unit
- [x] `tests/integration/ws-playback.test.ts` — 3 testy integracyjne
- [x] TypeScript strict, zero `any`, zero błędów `tsc --noEmit`
- [x] `supertest` + `@types/supertest` dodane do devDependencies

**Statystyki Fazy 2:** 42 nowe testy, ~1200 linii nowego kodu
**ŁĄCZNIE:** 153 testy, 21 plików testów, ~9300 linii kodu

---

## Jak testować Fazę 2

### Komendy

```bash
cd nextime

# Wszystkie testy (Faza 1 + 2)
npm test                                           # 153 testy, ~1s

# Tylko testy Fazy 2
npx vitest run tests/unit/playback-engine.test.ts  # 21 testów — state machine
npx vitest run tests/unit/ws-server.test.ts        # 12 testów — WS serwer
npx vitest run tests/unit/http-server.test.ts      # 6 testów — HTTP API
npx vitest run tests/integration/ws-playback.test.ts # 3 testy — pełny flow

# TypeScript strict
npx tsc --noEmit                                   # zero błędów

# Watch mode (podczas developmentu)
npx vitest tests/unit/playback-engine.test.ts      # auto-rerun przy zmianie
```

### Co jest testowane

#### PlaybackEngine (`tests/unit/playback-engine.test.ts` — 21 testów)

| Test | Co sprawdza |
|------|-------------|
| Stan idle | `getState()` zwraca `null` przed `loadRundown()` |
| loadRundown | Ładuje cues z DB, ustawia pierwszy jako current, `is_playing=false` |
| play | Ustawia `kickoff_epoch_ms`, `deadline_epoch_ms`, `is_playing=true` |
| pause | Ustawia `last_stop_epoch_ms=now`, `is_playing=false` |
| resume po pause | `remaining = deadline - last_stop` zachowane po wznowieniu |
| next | Przeskakuje na następny cue, kontynuuje play jeśli grał |
| next na ostatnim | Zostaje na ostatnim cue (nie wychodzi poza zakres) |
| prev | Wraca do poprzedniego cue |
| prev na pierwszym | Zostaje na pierwszym cue |
| goto | Skacze do cue po ID |
| goto nieistniejący | Rzuca Error |
| buildTimesnap | Generuje `WsTimesnapPayload` z `tc_mode='rundown_ms'` |
| over/under ahead | `-30_000` gdy 30s elapsed z 60s cue |
| over/under behind | `+10_000` gdy 70s elapsed z 60s cue |
| event state-changed | Emitowany przy play/pause |
| event cue-changed | Emitowany przy next z current + next cue |
| auto_start | Cue z `auto_start=true` startuje automatycznie przy next |
| play bez rundownu | Rzuca "No rundown loaded" |
| loadRundown nieistniejący | Rzuca "not found" |
| buildTimesnap idle | Zwraca `null` |
| hard-start countdown | `next_hard_start_cue_id` wskazuje na najbliższy hard cue |

**Kluczowy mechanizm:** MockClock (`tests/helpers/mock-clock.ts`) — pozwala kontrolować czas:
```typescript
clock = new MockClock(1_000_000_000_000); // stały start
engine.play();                              // kickoff = 1_000_000_000_000
clock.advance(10_000);                      // "mija" 10 sekund
engine.pause();                             // last_stop = 1_000_000_010_000
```

#### WsServer (`tests/unit/ws-server.test.ts` — 12 testów)

| Test | Co sprawdza |
|------|-------------|
| Handshake | `client:hello` → `server:welcome` z `session_id` + `initial_state` |
| Odrzucenie | Wiadomość inna niż `client:hello` → `server:error(AUTH_FAILED)` |
| Ping/pong | `client:ping` → `server:pong` z `client_ts` + `server_ts` |
| cmd:play | Engine.play() + `server:ack(ok=true)` |
| cmd:pause | Engine.pause() + `server:ack(ok=true)` |
| cmd:next | Engine.next() + `server:ack(ok=true)` |
| cmd:prev | Engine.prev() + `server:ack(ok=true)` |
| cmd:goto | Engine.goto(cue_id) + `server:ack(ok=true)` |
| cmd:resync | Odsyła `server:welcome` z pełnym stanem |
| Seq numbering | `seq` inkrementuje per sesja (welcome=0, pong=1, ...) |
| Broadcast | Timesnap dociera do WSZYSTKICH klientów |
| Rozłączenie | Sesja usuwana z mapy po `ws.close()` |

**Kluczowy mechanizm:** Real WebSocket na random port (`server.start(0)`) — nie mockujemy WS, testujemy prawdziwe połączenie.

Helpery w `tests/helpers/ws-test-helpers.ts`:
```typescript
const { ws, welcome } = await connectAndHandshake(port); // handshake
const ack = await sendCommand(ws, 'cmd:play');            // komenda + ack
const msg = await waitForEvent(ws, 'server:pong');        // czekaj na event
const msgs = await collectEvents(ws, 'playback:timesnap', 3); // zbierz N eventów
```

#### HttpServer (`tests/unit/http-server.test.ts` — 6 testów)

| Test | Co sprawdza |
|------|-------------|
| GET .../start | `200`, `ok=true`, `timesnap.tc_mode='rundown_ms'`, engine.is_playing=true |
| GET .../pause | `200`, `ok=true`, engine.is_playing=false |
| GET .../next | `200`, `ok=true`, cue przesunięty |
| GET .../prev | `200`, `ok=true`, cue cofnięty |
| Wrong ID | `404`, `ok=false` (walidacja rundown ID) |
| Unknown route | `404` |

**Kluczowy mechanizm:** `supertest` — testuje Express app bez startowania serwera:
```typescript
const res = await request(app).get(`/api/rundown/${rundownId}/start`);
expect(res.status).toBe(200);
```

#### Integracja (`tests/integration/ws-playback.test.ts` — 3 testy)

| Test | Co sprawdza |
|------|-------------|
| Pełny flow | connect → play → timesnap → next → pause (cały cykl) |
| Wielu klientów | 3 klientów, broadcast dociera do wszystkich |
| Resync | cmd:resync → server:welcome z aktualnym stanem |

### Jak dodawać nowe testy

1. **Nowy test PlaybackEngine:**
   ```typescript
   // tests/unit/playback-engine.test.ts
   it('powinno [opis po polsku]', () => {
     engine.loadRundown(rundownId);
     clock.advance(5000); // kontroluj czas
     // asercje
   });
   ```

2. **Nowy test WsServer:**
   ```typescript
   // tests/unit/ws-server.test.ts
   it('powinno [opis po polsku]', async () => {
     const { ws } = await connectAndHandshake(port);
     const ack = await sendCommand(ws, 'cmd:nowa_komenda', { /* payload */ });
     expect(ack.payload).toHaveProperty('ok', true);
     ws.close(); // ZAWSZE zamykaj!
   });
   ```

3. **Nowy test HTTP:**
   ```typescript
   // tests/unit/http-server.test.ts
   it('powinno [opis po polsku]', async () => {
     const res = await request(app).get(`/api/rundown/${rundownId}/nowy`);
     expect(res.status).toBe(200);
   });
   ```

### Architektura testów

```
tests/
├── helpers/
│   ├── test-db.ts           # createTestDb(), seeds (Faza 1)
│   ├── mock-clock.ts        # MockClock — kontrola czasu (Faza 2)
│   └── ws-test-helpers.ts   # connectAndHandshake, sendCommand, ... (Faza 2)
├── unit/
│   ├── db/                  # 17 plików — repozytoria CRUD (Faza 1)
│   ├── playback-engine.test.ts  # 21 testów (Faza 2)
│   ├── ws-server.test.ts        # 12 testów (Faza 2)
│   └── http-server.test.ts      # 6 testów (Faza 2)
└── integration/
    ├── db/cascade-delete.test.ts # FK, cascade, triggers (Faza 1)
    └── ws-playback.test.ts       # pełny flow WS+Engine (Faza 2)
```

---

## Faza 3 — Electron Main + React UI + WS Klient [UKOŃCZONA]

- [x] Tailwind CSS: `@tailwindcss/vite` plugin, `src/styles/globals.css` (ciemny broadcast UI)
- [x] `index.html` — Vite entry z CSP (Content Security Policy)
- [x] `vite.config.ts` — dodany plugin Tailwind + preload entry
- [x] `electron/preload.ts` — contextBridge z NextimeApi:
  - `getRundowns()`, `loadRundown(id)`, `getState()`, `getWsPort()`, `getCues(rundownId)`
- [x] `src/types/electron.d.ts` — deklaracja `Window.nextime` z pełnymi typami
- [x] `electron/main.ts` — Electron main process:
  - `app.whenReady()` → openDatabase → runMigrations → createRepos → engine → WS(3141) → HTTP(3142)
  - BrowserWindow z preload, dev URL / file:// prod
  - 5 IPC handlers: getRundowns, loadRundown, getState, getWsPort, getCues
  - Cleanup: engine.destroy(), wsServer.stop(), httpServer.close(), closeDb()
- [x] `src/main.tsx` — React entry point z StrictMode
- [x] `src/App.tsx` — root komponent:
  - Init: getRundowns → loadRundown(first) → getCues → store
  - Layout: TransportBar (top) + RundownTable (flex-1)
  - Loading state + empty state
- [x] `src/store/playback.store.ts` — Zustand store:
  - State: playback, currentCue, nextCue, cues, clockDrift, connected
  - Actions: setPlayback (auto-resolve currentCue/nextCue z cues), setCues, setClockDrift, setConnected
- [x] `src/hooks/useRundownSocket.ts` — WebSocket klient:
  - Handshake: `client:hello` → `server:welcome` → dispatch initial_state
  - Dispatch: `playback:timesnap`, `server:time`, `rundown:current_cue`
  - Gap detection (seq) → `cmd:resync`
  - Clock drift: `server_time_ms - Date.now()`
  - Auto-reconnect: exponential backoff (1s → 2s → 4s → max 10s)
  - `sendCommand(event, payload)` do wysyłania komend C→S
- [x] `src/hooks/usePlayback.ts` — obliczenia timing:
  - `calcRemainingMs()` / `calcElapsedMs()` z korekcją clock drift
  - `formatTime(ms)` → "MM:SS" lub "HH:MM:SS"
  - `formatOverUnder(ms)` → "+01:30" / "-00:45"
  - `useAnimationFrame()` — 60fps update dla smooth countdown
  - `usePlayback()` hook → PlaybackTiming (remaining, elapsed, overUnder, isOverrun, isWarning)
- [x] `src/components/TransportBar/TransportBar.tsx`:
  - Connection indicator (zielona/czerwona kropka)
  - Play/Pause toggle, Next, Prev — komendy WS
  - Countdown: remaining z kolorami (zielony/żółty/czerwony)
  - Current cue title + subtitle, Over/Under, Duration
  - Next cue preview, Server time (HH:MM:SS z drift correction)
- [x] `src/components/RundownTable/RundownTable.tsx`:
  - Tabela cue'ów: #, Title, Subtitle, Duration, Start Type, Status
  - Podświetlenie: aktualny (zielony), następny (żółty)
  - Auto-scroll do aktywnego cue (smooth, center)
  - Kliknięcie → `cmd:goto` przez WS
  - Badge: HARD/soft, auto_start (A), locked (🔒)
  - Custom background_color z opacity
- [x] `tests/unit/playback-store.test.ts` — 12 testów:
  - setPlayback z auto-resolve cue, null handling, setCues, setClockDrift (ujemny), setConnected, setCurrentCue/setNextCue
- [x] `tests/unit/playback-timing.test.ts` — 17 testów:
  - formatTime (0ms, 30s, 5min, 1h, 1h5m30s, ujemne, ms truncation)
  - formatOverUnder (ahead, behind, zero)
  - calcRemainingMs (pauza, playing, clock drift)
  - calcElapsedMs (pauza, playing, clock drift)
- [x] TypeScript strict, zero `any`, zero błędów `tsc --noEmit`

**Statystyki Fazy 3:** 29 nowych testów, ~750 linii nowego kodu (UI + store + hooks + testy)
**ŁĄCZNIE:** 182 testy, 25 plików testów, ~10050 linii kodu

---

## Jak testować Fazę 3

### Komendy

```bash
cd nextime

# Wszystkie testy (Faza 1 + 2 + 3)
npm test                                                     # 182 testy, ~1s

# Tylko testy Fazy 3
npx vitest run tests/unit/playback-store.test.ts             # 12 testów — Zustand store
npx vitest run tests/unit/playback-timing.test.ts            # 17 testów — timing calculations

# TypeScript strict
npx tsc --noEmit                                             # zero błędów

# Uruchomienie Electrona (wymaga rundownu w bazie)
npm run dev                                                  # Vite + Electron
```

### Co jest testowane

#### Zustand Store (`tests/unit/playback-store.test.ts` — 12 testów)

| Test | Co sprawdza |
|------|-------------|
| setPlayback payload | Zapisuje TimesnapPayload do store |
| auto-resolve currentCue | Znajduje cue po rundown_cue_id z listy cues |
| auto-resolve nextCue | Znajduje cue po next_cue_id z listy cues |
| nextCue null | Brak next_cue_id → nextCue = null |
| setCues | Lista cue'ów załadowana z IPC |
| setClockDrift | Drift wartość (dodatni i ujemny) |
| setConnected | true/false toggle |
| setCurrentCue ręcznie | Ręczne ustawienie + wyczyszczenie na null |
| setNextCue ręcznie | Ręczne ustawienie |

#### Timing Calculations (`tests/unit/playback-timing.test.ts` — 17 testów)

| Test | Co sprawdza |
|------|-------------|
| formatTime 0ms | "00:00" |
| formatTime 30s | "00:30" |
| formatTime 5min | "05:00" |
| formatTime 1h | "01:00:00" (format z godzinami) |
| formatTime ujemne | Bierze abs, zwraca poprawnie |
| formatTime ms truncation | 30999ms → "00:30" (floor) |
| formatOverUnder ahead | "-00:45" (ujemne = ahead of schedule) |
| formatOverUnder behind | "+01:30" (dodatnie = za plan) |
| calcRemainingMs pauza | deadline - last_stop |
| calcRemainingMs playing | deadline - now (z drift korekcją) |
| calcRemainingMs drift | Drift wpływa na wynik (~5s różnica) |
| calcElapsedMs pauza | last_stop - kickoff |
| calcElapsedMs playing | now - kickoff |
| calcElapsedMs drift | Drift +3s → elapsed +3s |

### Architektura testów (aktualna)

```
tests/
├── helpers/
│   ├── test-db.ts           # createTestDb(), seeds (Faza 1)
│   ├── mock-clock.ts        # MockClock — kontrola czasu (Faza 2)
│   └── ws-test-helpers.ts   # connectAndHandshake, sendCommand, ... (Faza 2)
├── unit/
│   ├── db/                  # 17 plików — repozytoria CRUD (Faza 1)
│   ├── playback-engine.test.ts  # 21 testów (Faza 2)
│   ├── ws-server.test.ts        # 12 testów (Faza 2)
│   ├── http-server.test.ts      # 6 testów (Faza 2)
│   ├── playback-store.test.ts   # 12 testów (Faza 3)
│   └── playback-timing.test.ts  # 17 testów (Faza 3)
└── integration/
    ├── db/cascade-delete.test.ts # FK, cascade, triggers (Faza 1)
    └── ws-playback.test.ts       # pełny flow WS+Engine (Faza 2)
```

---

## Faza 4 — Edycja Rundownu (CRUD cue'ów w UI) [UKOŃCZONA]

- [x] `electron/ws-protocol-types.ts` — wspólne typy: `WsCueSummary`, `RundownChange`
- [x] `electron/main.ts` — 7 nowych IPC handlers:
  - `nextime:createCue`, `nextime:updateCue`, `nextime:deleteCue`
  - `nextime:reorderCues`, `nextime:createRundown`, `nextime:deleteRundown`, `nextime:getProjects`
  - Helper `reloadEngineIfActive()` — odświeża engine po zmianach cue
- [x] `electron/preload.ts` — rozszerzony contextBridge o CRUD metody
- [x] `src/types/electron.d.ts` — pełne typy NextimeApi (CRUD + getProjects)
- [x] `electron/ws-server.ts` — metoda `broadcastDelta(rundownId, changes)`:
  - Broadcast `rundown:delta` po każdej operacji CRUD
- [x] `src/store/playback.store.ts` — rozszerzony Zustand store:
  - Nowe typy: `RundownSummary`, `RundownChange`
  - Nowy state: `selectedCueId`, `rundowns`, `activeRundownId`
  - Nowe akcje: `setSelectedCueId`, `setRundowns`, `setActiveRundownId`
  - CRUD akcje: `addCue`, `updateCue`, `removeCue` (auto-select next), `reorderCues`
  - WS delta: `applyDelta(changes)` — obsługa `cue_added/updated/deleted/moved`
- [x] `src/hooks/useRundownSocket.ts` — obsługa `rundown:delta` event
- [x] `src/components/CueEditPanel/CueEditPanel.tsx` — panel edycji cue:
  - Formularz: Title, Subtitle, Duration (MM:SS), Start Type toggle (soft/hard)
  - Hard Start datetime picker (warunkowy), Auto-start checkbox
  - Background color picker (8 presetów), Save/Cancel/Delete
  - Parsowanie duration: `parseDurationInput()`, `formatDurationForInput()`
- [x] `src/components/RundownTable/RundownTable.tsx` — pełna przebudowa:
  - @dnd-kit: DndContext + SortableContext + SortableCueRow z useSortable
  - Drag handle (`⠿`), PointerSensor (distance: 5), KeyboardSensor
  - Dodawanie cue: przycisk "+" (po zaznaczonym lub na końcu)
  - Selected state: `ring-1 ring-blue-500/50` border
  - Custom background_color, locked badge, auto_start badge
- [x] `src/components/RundownSidebar/RundownSidebar.tsx` — sidebar rundownów:
  - Lista rundownów z active highlighting (blue)
  - Formularz tworzenia (nazwa + auto-select projektu)
  - Usuwanie z confirm dialog, auto-switch po usunięciu aktywnego
- [x] `src/App.tsx` — trójpanelowy layout:
  - Lewo: RundownSidebar (w-60)
  - Środek: TransportBar + RundownTable (flex-1)
  - Prawo: CueEditPanel (w-80, warunkowy — gdy selectedCue)
- [x] `tests/unit/ipc-handlers.test.ts` — 19 testów IPC handlers
- [x] `tests/unit/playback-store-crud.test.ts` — 20 testów CRUD store
- [x] `tests/integration/ws-crud-broadcast.test.ts` — 4 testy WS broadcast delta
- [x] `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — nowe zależności
- [x] TypeScript strict, zero `any`, zero błędów `tsc --noEmit`

**Statystyki Fazy 4:** 43 nowe testy, ~900 linii nowego kodu (UI + IPC + testy)
**ŁĄCZNIE:** 225 testów, 28 plików testów, ~10950 linii kodu

---

## Jak testować Fazę 4

### Komendy

```bash
cd nextime

# Wszystkie testy (Faza 1 + 2 + 3 + 4)
npm test                                                     # 225 testów, ~1s

# Tylko testy Fazy 4
npx vitest run tests/unit/ipc-handlers.test.ts               # 19 testów — IPC CRUD
npx vitest run tests/unit/playback-store-crud.test.ts        # 20 testów — Store CRUD + delta
npx vitest run tests/integration/ws-crud-broadcast.test.ts   # 4 testy — WS broadcast

# TypeScript strict
npx tsc --noEmit                                             # zero błędów
```

### Co jest testowane

#### IPC Handlers (`tests/unit/ipc-handlers.test.ts` — 19 testów)

| Test | Co sprawdza |
|------|-------------|
| createCue | Tworzy cue z domyślnymi wartościami |
| createCue sort_order | Wstawia cue we właściwe miejsce |
| createCue + broadcast | Delta `cue_added` broadcastowana |
| createCue + engine reload | PlaybackEngine przeładowany po dodaniu |
| updateCue title | Aktualizuje tylko podane pola |
| updateCue start_type | Zmiana soft → hard z datetime |
| updateCue + broadcast | Delta `cue_updated` broadcastowana |
| updateCue nieistniejący | Zwraca undefined |
| updateCue duration | Zmiana czasu trwania |
| updateCue background_color | Ustawienie koloru tła |
| deleteCue | Usuwa cue z bazy |
| deleteCue + broadcast | Delta `cue_deleted` broadcastowana |
| deleteCue nieistniejący | Zwraca false |
| reorderCues | Zmienia sort_order w bazie |
| createRundown | Tworzy rundown z nazwą |
| createRundown domyślne | Ustawia status=draft |
| deleteRundown | Usuwa rundown + cascade cues |
| deleteRundown nieistniejący | Zwraca false |
| getProjects | Zwraca listę projektów |

#### Store CRUD (`tests/unit/playback-store-crud.test.ts` — 20 testów)

| Test | Co sprawdza |
|------|-------------|
| setSelectedCueId | Ustawia i czyści zaznaczenie |
| setRundowns | Lista rundownów do sidebar |
| setActiveRundownId | Aktywny rundown |
| addCue pusta lista | Dodaje do pustej listy |
| addCue sort_order | Wstawia we właściwe miejsce |
| updateCue title | Aktualizuje jedno pole |
| updateCue partial | Nie zmienia innych pól |
| updateCue inny id | Nie modyfikuje innych cue |
| removeCue | Usuwa z listy |
| removeCue + auto-select next | Zaznacza następny po usunięciu |
| removeCue ostatni | Zaznacza poprzedni |
| removeCue jedyny | selectedCueId = null |
| reorderCues | Nowa kolejność + sort_order |
| applyDelta cue_added | Dodaje z deduplication |
| applyDelta cue_updated | Merge partial |
| applyDelta cue_deleted | Usuwa z listy |
| applyDelta cue_moved | Zmienia sort_order |
| applyDelta wiele zmian | Obsługuje batch changes |
| applyDelta duplikat | Nie duplikuje cue |

#### WS Broadcast (`tests/integration/ws-crud-broadcast.test.ts` — 4 testy)

| Test | Co sprawdza |
|------|-------------|
| cue_added broadcast | Po createCue → rundown:delta z op=cue_added |
| cue_updated broadcast | Po updateCue → rundown:delta z op=cue_updated |
| cue_deleted broadcast | Po deleteCue → rundown:delta z op=cue_deleted |
| multi-client | Delta dociera do WSZYSTKICH podłączonych klientów |

### Architektura testów (aktualna)

```
tests/
├── helpers/
│   ├── test-db.ts           # createTestDb(), seeds (Faza 1)
│   ├── mock-clock.ts        # MockClock — kontrola czasu (Faza 2)
│   └── ws-test-helpers.ts   # connectAndHandshake, sendCommand, ... (Faza 2)
├── unit/
│   ├── db/                  # 17 plików — repozytoria CRUD (Faza 1)
│   ├── playback-engine.test.ts    # 21 testów (Faza 2)
│   ├── ws-server.test.ts          # 12 testów (Faza 2)
│   ├── http-server.test.ts        # 6 testów (Faza 2)
│   ├── playback-store.test.ts     # 12 testów (Faza 3)
│   ├── playback-timing.test.ts    # 17 testów (Faza 3)
│   ├── ipc-handlers.test.ts       # 19 testów (Faza 4)
│   └── playback-store-crud.test.ts # 20 testów (Faza 4)
└── integration/
    ├── db/cascade-delete.test.ts      # FK, cascade, triggers (Faza 1)
    ├── ws-playback.test.ts            # pełny flow WS+Engine (Faza 2)
    └── ws-crud-broadcast.test.ts      # CRUD → delta broadcast (Faza 4)
```

---

## Faza 5 — Timeline Core (CuePilot-style) [UKOŃCZONA]

- [x] `src/utils/timecode.ts` — konwersja frames ↔ timecode (SMPTE drop-frame), 27 testów
- [x] PlaybackEngine: tryb `timeline_frames` (loadAct, scrub, setSpeed, tickFrames, vision cue tracking), 31 testów
- [x] IPC handlers: Act/Track/TimelineCue CRUD (12 nowych handlerów w main.ts)
- [x] `electron/preload.ts` + `electron.d.ts` — rozszerzone o timeline API
- [x] WS Server: `cmd:scrub`, `cmd:set_speed`, `act:active_vision_cue` broadcast
- [x] Zustand store: timeline state (acts, tracks, timelineCues, viewMode, visionCue, fps)
- [x] `useRundownSocket.ts` — obsługa timeline events + `act:active_vision_cue`
- [x] `src/components/Timeline/` — 6 komponentów:
  - Timeline.tsx (główny kontener, toolbar, zoom, auto-scroll)
  - TimelineRuler.tsx (linijka timecode z klikaniem)
  - TimelineTrack.tsx (pas z cue blokami, kolory per typ)
  - TimelineCueBlock.tsx (drag do zmiany pozycji)
  - TimelinePlayhead.tsx (czerwona linia bieżącej pozycji)
  - useTimelineZoom.ts (zoom levels, scroll, px↔frames)
- [x] `src/components/ShotlistPanel/ShotlistPanel.tsx` — lista vision cue'ów (active/next highlighting)
- [x] `src/components/ActSelector/ActSelector.tsx` — zakładki aktów
- [x] `src/App.tsx` — toggle Rundown/Timeline view
- [x] TypeScript strict, zero `any`, zero błędów `tsc --noEmit`

**Statystyki Fazy 5:** 58 nowych testów (timecode: 27, engine-timeline: 31), ~2000 linii nowego kodu
**ŁĄCZNIE:** 107 testów przechodzących (mock-based), ~12950 linii kodu

**UWAGA:** Faza 5 dostarczyła backend + UI read-only. Brakuje UI do tworzenia/edycji/usuwania aktów, tracków i timeline cue'ów — to jest Faza 5b.

---

## Faza 5b — Timeline Management UI [UKOŃCZONA]

- [x] Store: addAct, removeAct, updateAct, addTrack, removeTrack akcje
- [x] ActSelector: przycisk "+", formularz tworzenia aktu (nazwa, artysta, fps, kolor, duration)
- [x] ActSelector: edycja aktu (klik prawym / przycisk edit), usuwanie z potwierdzeniem
- [x] Timeline: przycisk "Add Track", dialog wyboru typu (vision/lyrics/osc/midi/gpi/media/marker)
- [x] Timeline: usuwanie tracków (przycisk × w header tracku)
- [x] Timeline: dodawanie cue na tracku (double-click na pustym miejscu)
- [x] Timeline: edycja cue (double-click → dialog z formularzem per typ cue)
- [x] Timeline: usuwanie cue (right-click → context menu, klawisz Delete)
- [x] Timeline: resize cue z prawej krawędzi (zmiana tc_out_frames)
- [x] ShotlistPanel: tworzenie vision cue'ów z panelu
- [x] TypeScript strict, zero `any`, zero błędów `tsc --noEmit`
- [x] 120 testów przechodzących (mock-based)

**Statystyki Fazy 5b:** ~800 linii nowego kodu (UI + store akcje)

---

## Faza 6 — Live Timeline Playback + Keyboard Shortcuts [UKOŃCZONA]

> Szczegółowy plan implementacji: `docs/plan.md`

### Krok 1: Cue Cache w PlaybackEngine
- [x] Dodać `findByAct()` do interfejsu `TimelineCueRepoLike`
- [x] Nowy typ `CachedTimelineCue` (id, track_id, type, tc_in/out, data)
- [x] Nowe pola prywatne: `cachedCues[]`, `activeCueIds`, `firedPointCueIds`, `preWarnedCueIds`
- [x] `loadCueCache()` wywoływany z `loadAct()`
- [x] `reloadTimelineCues()` — publiczna metoda do odświeżania cache
- [x] `resetCueTracker()` — czyszczenie setów
- [x] `isCueAtFrame()` — helper: czy cue jest aktywny na danej klatce

### Krok 2: Cue Executor
- [x] `executeCues()` — główna pętla: enter/exit detection per cue
- [x] `onCueEnter(cue)` — emituje typed events (lyric-changed, marker-active, osc/midi/gpi/media-trigger)
- [x] `onCueExit(cue)` — emituje exit events (lyric null, marker-inactive)
- [x] `updateVisionCueFromCache()` — zastępuje `updateActiveVisionCue()` (cache zamiast DB query)
- [x] Point cue: fired raz (firedPointCueIds), nie re-fire
- [x] Pre-warning dla markerów (pre_warn_frames)
- [x] Zamiana `updateActiveVisionCue()` → `executeCues()` w `tickFrames()`
- [x] Zamiana `updateActiveVisionCue()` → `recalculateActiveCues()` w `scrub()`

### Krok 3: Step Mode + Hold Mode
- [x] Rozszerzenie `EngineTimelineFramesState`: `stepMode: boolean`, `holdMode: boolean`
- [x] `toggleStepMode()` — flip stepMode, pauza jeśli grało
- [x] `toggleHoldMode()` — flip holdMode
- [x] `stepToNextCue()` — skok do następnego vision cue (frame-exact)
- [x] `takeNextShot()` — force next vision cue jako aktywny
- [x] Blokada `play()` w step mode
- [x] Hold mode blokuje zmiany vision cue w `updateVisionCueFromCache()`
- [x] Emit `mode-changed` event

### Krok 4: Rozszerzony Timesnap + Nowe typy
- [x] Rozszerzenie `TimesnapTimelineFrames`: `speed`, `step_mode`, `hold_mode`, `active_lyric_text`
- [x] Aktualizacja `buildTimelineTimesnap()` — wypełnia nowe pola

### Krok 5: WS Server — rozdzielenie tick/broadcast + nowe eventy
- [x] Rozdzielenie: `tickTimer` (40ms, ~25fps) vs `timesnapTimer` (100ms broadcast)
- [x] Usunięcie `this.engine.tick()` z `broadcastTimesnap()`
- [x] Nowy listener: `cue-entered` → broadcast `act:cue_executed` (action: entered)
- [x] Nowy listener: `cue-exited` → broadcast `act:cue_executed` (action: exited)
- [x] Nowy listener: `lyric-changed` → broadcast `act:lyric_changed`
- [x] Nowy listener: `mode-changed` → broadcast `act:mode_changed`
- [x] Nowy listener: `cue-pre-warning` → broadcast `act:marker_warning`
- [x] Nowa komenda: `cmd:step_mode` → `engine.toggleStepMode()`
- [x] Nowa komenda: `cmd:hold_mode` → `engine.toggleHoldMode()`
- [x] Nowa komenda: `cmd:step_next` → `engine.stepToNextCue()`
- [x] Nowa komenda: `cmd:take_shot` → `engine.takeNextShot()`

### Krok 6: Store + WS klient
- [x] Nowe pola store: `stepMode`, `holdMode`, `speed`, `activeLyricText`, `activeMarker`
- [x] Nowe pola store: `lastTimesnapAt`, `lastTimesnapFrames` (do interpolacji)
- [x] Nowe akcje store: `setStepMode`, `setHoldMode`, `setSpeed`, `setActiveLyricText`, `setActiveMarker`
- [x] Rozszerzenie `setPlayback` dla timeline_frames — wyciągnięcie nowych pól
- [x] `useRundownSocket.ts`: handler `act:lyric_changed`
- [x] `useRundownSocket.ts`: handler `act:mode_changed`
- [x] `useRundownSocket.ts`: handler `act:marker_warning` (+ auto-clear 3s)

### Krok 7: Interpolacja playhead (klient)
- [x] Eksport `useAnimationFrame()` z `usePlayback.ts` (obecnie prywatna)
- [x] Nowy hook `useTimelinePlayhead()` — interpolacja kliencka (rAF + speed + fps)
- [x] Timeline.tsx: zamiana `framesToPx(currentTcFrames)` → `framesToPx(useTimelinePlayhead())`

### Krok 8: Keyboard Shortcuts
- [x] Nowy plik: `src/hooks/useKeyboardShortcuts.ts`
- [x] Helper `isEditable()` — ignoruj skróty w input/textarea/contentEditable
- [x] `Space` → Play/Pause (globalny)
- [x] `F3` → Toggle Step Mode (tylko timeline)
- [x] `F8` → Take Next Shot (tylko timeline)
- [x] `F9` → Toggle Hold Mode (tylko timeline)
- [x] `J` → Step to Next Cue (tylko timeline)
- [x] `ArrowLeft/Right` → Scrub ±1 klatka (Shift: ±10)
- [x] `Ctrl+ArrowLeft/Right` → Move selected cue ±1 klatka (Shift: ±10)
- [x] Integracja w `App.tsx`: `useKeyboardShortcuts({ sendCommand })`

### Krok 9: UI — TransportBar + ShotlistPanel
- [x] TransportBar: badge STEP (amber) gdy `stepMode=true`
- [x] TransportBar: badge HOLD (red) gdy `holdMode=true`
- [x] TransportBar: wskaźnik speed (np. "0.5x") gdy `speed !== 1.0`
- [x] TransportBar: timecode timeline (HH:MM:SS:FF) w trybie timeline
- [x] ShotlistPanel: banner "Camera HOLD" (czerwony) gdy `holdMode=true`
- [x] TransportBar: rozróżnienie countdown rundown vs timecode timeline

### Krok 10: main.ts — reload cache po CRUD
- [x] Po `nextime:createTimelineCue` → `engine.reloadTimelineCues()`
- [x] Po `nextime:updateTimelineCue` → `engine.reloadTimelineCues()`
- [x] Po `nextime:deleteTimelineCue` → `engine.reloadTimelineCues()`

### Krok 11: Testy
- [x] `tests/unit/cue-executor.test.ts` — 9 testów: vision enter/exit, lyric changed, marker pre-warn, point cue fired-once, multi-cue, scrub recalculate, reloadTimelineCues
- [x] `tests/unit/step-hold-mode.test.ts` — 19 testów: toggleStep, toggleHold, play blocked in step, stepToNextCue, takeNextShot, holdMode blocks vision, rozszerzony timesnap
- [x] Rozszerzenie `playback-engine-timeline.test.ts` — nowe pola timesnap (stepMode/holdMode init, speed/step_mode/hold_mode w timesnap)

### Weryfikacja końcowa
- [x] `npx tsc --noEmit` — zero błędów TypeScript
- [x] `npx vitest run` — 73 testy mock-based przechodzą (28 nowych)
- [x] `npm run dev` — manualne testy:
  - [x] Space → Play/Pause timeline
  - [x] Strzałki → scrub ±1/±10 klatek
  - [x] Ctrl+Strzałki → przesunięcie zaznaczonego cue
  - [x] F3 → badge STEP w TransportBar
  - [x] F9 → badge HOLD w TransportBar + ShotlistPanel
  - [x] J → step do następnego vision cue
  - [x] F8 → take next shot
  - [x] Playhead interpolacja — płynny ruch
  - [x] Cue executor — auto-highlight vision cue przy przejściu playhead

**Statystyki Fazy 6:** 28 nowych testów (cue-executor: 9, step-hold-mode: 19), ~600 linii nowego kodu

---

## Faza 7 — Cue Executor rozszerzony + OSC/MIDI/GPI senders [UKOŃCZONA]

### Sendery (main process)
- [x] `electron/senders/osc-sender.ts` — OSC sender via UDP (minimalny encoder, bez zależności)
  - buildOscMessage() — kodowanie OSC (string, int, float, bool)
  - OscSender — nasłuchuje 'osc-trigger', wysyła pakiety UDP
  - Konfiguracja: host, port, enabled
- [x] `electron/senders/midi-sender.ts` — MIDI sender (placeholder z callback)
  - Buduje poprawne bajty MIDI (Note On/Off, CC, Program Change)
  - Clampowanie wartości 0-127, kanały 1-16
  - Callback onMessage do testów i przyszłej integracji hardware
- [x] `electron/senders/gpi-sender.ts` — GPI sender (placeholder z callback)
  - Obsługa typów: pulse, on, off
  - Kanały 1-8, konfigurowalny czas impulsu
- [x] `electron/senders/media-sender.ts` — Media sender (placeholder)
  - Obsługa file_path, volume (0-100), loop
- [x] `electron/senders/index.ts` — SenderManager (centralny manager senderów)
  - Podpina wszystkie sendery do PlaybackEngine
  - Re-eksport konfiguracji

### Integracja w main.ts
- [x] Import SenderManager, tworzenie instancji, attach do engine
- [x] Cleanup w before-quit (senderManager.destroy())

### Marker notifications w UI
- [x] TransportBar: wizualne powiadomienie markera (label + kolor + animacja pulse)
- [x] useRundownSocket: obsługa 'act:cue_executed' — marker enter/exit aktualizuje activeMarker w store

### Lyric display w UI
- [x] TransportBar: wyświetlanie activeLyricText (cyjanowy tekst pod cue info) w trybie timeline

### Rozszerzenie TimelineCueDialog — pełne formularze
- [x] OSC: host, port, address, args (JSON)
- [x] MIDI: channel (1-16), message_type, note/cc, velocity/value (dynamiczne etykiety per typ)
- [x] GPI: channel (1-8), trigger_type (pulse/on/off), pulse_ms (widoczne tylko dla pulse)
- [x] Marker: label, color, pre_warn_frames (z opisem)
- [x] Media: file_path, volume (slider), loop, offset_frames (z opisem)

### Testy
- [x] `tests/unit/senders.test.ts` — 24 testy:
  - OscSender: budowanie pakietów (string+int, float, pusty), trigger z engine, disabled, brak adresu, konfiguracja
  - MidiSender: Note On/Off, CC, Program Change, clamp 0-127, disabled
  - GpiSender: pulse, on/off, clamp kanał 1-8, domyślny pulse_ms, disabled
  - MediaSender: pełne dane, domyślne, clamp głośność, disabled
  - SenderManager: attach do engine (4 typy), konfiguracja per sender

### Weryfikacja końcowa
- [x] `npx tsc --noEmit` — zero błędów TypeScript
- [x] `npx vitest run` — 174 testy mock-based przechodzą (24 nowych z senders.test.ts)

**Statystyki Fazy 7:** 24 nowe testy, ~800 linii nowego kodu (sendery + UI + testy)

---

## Faza 8 — Vision Switcher (ATEM integration) [UKOŃCZONA]

### AtemSender (backend)
- [x] `electron/senders/atem-sender.ts` — placeholder z interfejsem kompatybilnym (connect, disconnect, performCut, performMix, setPreview)
- [x] Konfiguracja: IP, ME index, auto-switch, transition type (cut/mix), mix duration
- [x] Status: connected, programInput, previewInput, modelName
- [x] Auto-switch: nasłuchuje 'vision-cue-changed', mapuje camera_number → ATEM input
- [x] Manual override: performCut(input), setPreview(input)
- [x] EventEmitter: connected, disconnected, program-changed, preview-changed
- [x] `electron/senders/index.ts` — AtemSender dodany do SenderManager

### IPC + WS
- [x] IPC handlers: atemGetStatus, atemConfigure, atemConnect, atemDisconnect, atemCut, atemPreview
- [x] WS komendy C→S: cmd:atem_cut, cmd:atem_preview
- [x] WS event S→C: atem:status (broadcast przy zmianie stanu ATEM)
- [x] Preload + electron.d.ts — pełne typy ATEM API

### UI
- [x] TransportBar: wskaźnik ATEM (zielony/szary dot + PGM input) w trybie timeline
- [x] AtemPanel: dialog konfiguracji (IP, ME, transition, auto-switch)
- [x] AtemPanel: status Program/Preview (duże cyfry)
- [x] AtemPanel: manual override — siatka 8 kamer (PGM/PVW przyciski)
- [x] App.tsx: przycisk "ATEM ON/OFF" w toolbar timeline

### Store + WS klient
- [x] Zustand: atemConnected, atemProgramInput, atemPreviewInput, atemAutoSwitch, atemModelName
- [x] useRundownSocket: handler atem:status

### Testy
- [x] `tests/unit/atem-sender.test.ts` — 21 testów:
  - Połączenie/rozłączenie, eventy connected/disconnected
  - Auto-switch CUT/MIX, ignorowanie gdy disabled/disconnected/no camera
  - Manual performCut, setPreview, program-changed event
  - Konfiguracja (IP change → reconnect), disabled
  - Destroy, SenderManager integracja

### Weryfikacja
- [x] `npx tsc --noEmit` — zero błędów TypeScript
- [x] `npx vitest run` — 375 testów przechodzących (21 nowych)

**Statystyki Fazy 8:** 21 nowych testów, ~500 linii nowego kodu (AtemSender + UI + testy)

---

## Faza 9 — CueApp + Prompter + Output Config [UKOŃCZONA]

### Output Config CRUD — Backend
- [x] `electron/main.ts` — import outputConfigRepo, columnRepo, cellRepo + inicjalizacja
- [x] IPC handlers: getOutputConfigs, createOutputConfig, updateOutputConfig, deleteOutputConfig, getOutputConfigByToken
- [x] IPC: getColumns (lista kolumn rundownu do wyboru w OutputPanel)
- [x] IPC: getHttpPort (do budowania linków output)
- [x] share_token generowany przez crypto.randomUUID() po stronie serwera (bezpieczny)
- [x] `electron/preload.ts` — 8 nowych metod contextBridge
- [x] `src/types/electron.d.ts` — pełne typy OutputConfig API

### HTTP Server — endpointy Output
- [x] `electron/http-server.ts` — rozszerzony o parametr `repos` (wsteczna kompatybilność)
- [x] `GET /api/output/:token/config` — JSON z konfiguracją outputu
- [x] `GET /api/output/:token/cues` — JSON z cue'ami rundownu
- [x] `GET /api/output/:token/script` — JSON z tekstem skryptu (tytuły + content z kolumny script)
- [x] `GET /api/output/:token/state` — JSON z timesnapem + ws_port
- [x] `GET /output/:token` — HTML widok (CueApp/Prompter/Single)
- [x] Walidacja share_token — 404 dla nieistniejącego tokenu
- [x] Helper `extractPlainText()` — wyciąganie tekstu z richtext JSON

### CueApp — widok List (layout=list)
- [x] Tabela cue'ów z numeracją, tytułem, subtitle, duration
- [x] Podświetlenie aktywnego cue (zielony) i następnego (żółty)
- [x] WebSocket klient — handshake, timesnap, auto-reconnect (exponential backoff)
- [x] Auto-scroll do aktywnego cue (smooth, center)
- [x] Status bar: wskaźnik połączenia (zielona/czerwona kropka)
- [x] Responsywny design (tablet-first)

### CueApp — widok Single (layout=single)
- [x] Pełnoekranowy widok aktywnego cue (duży tytuł + subtitle)
- [x] Countdown z kolorami (zielony/żółty/czerwony)
- [x] Opcjonalny time of day (settings.time_of_day)
- [x] Opcjonalny next cue preview (settings.next_cue)
- [x] Aktualizacja co 200ms (real-time countdown)

### Prompter (layout=prompter)
- [x] Czarne tło, biały tekst, konfigurowalna wielkość (prompter_text_size)
- [x] Auto-scroll do aktywnego cue (smooth)
- [x] Mirror mode (CSS transform: scaleX/scaleY dla beam-splitter)
- [x] Wskaźnik pozycji (prompter_indicator: % od góry)
- [x] Opcjonalny uppercase (prompter_uppercase)
- [x] Stany: past (30% opacity), active (100%), future (60%)
- [x] Wyświetlanie: tytuł cue + script_text z kolumny lub subtitle

### WS Server — filtrowane broadcasty
- [x] `broadcastCueAppView()` — filtrowany broadcast do klientów CueApp
- [x] Filtrowanie po camera_filter per sesja WS
- [x] `broadcastToType()` — broadcast do klientów danego typu
- [x] Obsługa komendy `cmd:prompter_update` → re-broadcast prompter:sync

### Output Panel UI
- [x] `src/components/OutputPanel/OutputPanel.tsx` — dialog zarządzania wyjściami
- [x] Lista outputów z badge typu (LIST/SINGLE/PROMPT), przyciskami Link/Otwórz/Usuń
- [x] Formularz tworzenia: nazwa, layout (list/single/prompter), kolumna script
- [x] OutputSettingsEditor: edycja ustawień per output (kolor tła, mirror, prompter settings)
- [x] `src/store/playback.store.ts` — outputConfigs state + akcje CRUD
- [x] `src/App.tsx` — przycisk "Outputs" w toolbar + OutputPanel dialog

### Testy
- [x] `tests/unit/output-config-ipc.test.ts` — 15 testów:
  - CREATE: domyślny layout, prompter z settings, single
  - FIND: po ID, po share_token, undefined dla nieistniejącego, findByRundown (posortowane), pusta lista
  - UPDATE: nazwa, layout, settings (merge), brak zmian
  - DELETE: usunięcie, false dla nieistniejącego
  - Bezpieczeństwo: UNIQUE constraint na share_token
- [x] `tests/unit/http-output.test.ts` — 14 testów:
  - Wsteczna kompatybilność: Companion GET .../start nadal działa
  - Output API: config, cues, state, script (z/bez kolumny)
  - HTML: list, single (z time_of_day), prompter (uppercase, text_size), 404 HTML, mirror mode
  - Bezpieczeństwo: token powiązany z rundownem

### Weryfikacja
- [x] `npx tsc --noEmit` — zero błędów TypeScript
- [x] `npx vitest run` — 404 testy przechodzące (29 nowych)

**Statystyki Fazy 9:** 29 nowych testów, ~1200 linii nowego kodu (HTTP+UI+Store+WS+testy)
**ŁĄCZNIE:** 404 testy, 36 plików testów

---

## Faza 10 — LTC Sync + PTZ Camera Presets + Media Playback + ATEM Connection [UKOŃCZONA]

### LTC Reader + Engine LTC mode
- [x] `electron/senders/ltc-reader.ts` — placeholder LTC reader z interfejsem do podpięcia hardware
  - Emituje: tc-received, tc-lost, source-changed
  - Metody: connect(), disconnect(), setSource(), feedTc(), getStatus()
  - Config: enabled, source (internal|ltc|mtc|manual)
- [x] PlaybackEngine: `setLtcSource()` — przełącza źródło TC w state
- [x] PlaybackEngine: `feedExternalTc(frames)` — przyjmuje zewnętrzny TC (LTC/MTC/manual)
- [x] PlaybackEngine: `tickFrames()` — w trybie ltc/mtc nie advance wewnętrznie
- [x] PlaybackEngine: emit `ltc-source-changed` event
- [x] WS Server: `cmd:set_ltc_source { source }` → `engine.setLtcSource()`
- [x] WS Server: `cmd:set_manual_tc { frames }` → `engine.feedExternalTc()`
- [x] WS Server: broadcast `act:ltc_source_changed` przy zmianie
- [x] IPC: `nextime:getLtcStatus`, `nextime:setLtcSource`
- [x] Preload + electron.d.ts: `getLtcStatus()`, `setLtcSource()`
- [x] Store: `ltcSource` state + `setLtcSource` akcja + sync z timesnap
- [x] useRundownSocket: handler `act:ltc_source_changed`
- [x] UI TransportBar: badge TC:INT/LTC/MTC/MAN z przyciskiem przełączania
- [x] Keyboard shortcut F1 → cycle LTC source (internal→ltc→mtc→manual)
- [x] main.ts: LtcReader wiring (tc-received → engine.feedExternalTc)

### CameraPreset CRUD + PTZ Sender
- [x] `electron/db/repositories/camera-preset.repo.ts` — CRUD na tabeli camera_presets
  - create, findById, findByProject, update, delete
- [x] `electron/senders/ptz-sender.ts` — placeholder VISCA over IP
  - attach(engine), recallPreset(cameraNumber), onCommand callback
  - Nasłuchuje vision-cue-changed → recall preset
- [x] SenderManager: dodanie ltc + ptz (LtcReader, PtzSender)
- [x] IPC: getCameraPresets, createCameraPreset, updateCameraPreset, deleteCameraPreset
- [x] Preload + electron.d.ts: 4 metody CameraPreset
- [x] UI: CameraPresetPanel — dialog konfiguracji kamer (numer, label, kolor, kanał, operator)
- [x] App.tsx: przycisk "Cameras" w toolbar Timeline view

### Media Playback (rozszerzony)
- [x] MediaSender: rozszerzenie — play/stop/setVolume/getStatus, attach cue-exited → stop
- [x] MediaSender: pola stanu: _playing, _currentFile, _volume
- [x] IPC: getMediaFiles, createMediaFile, deleteMediaFile, getMediaStatus
- [x] Preload + electron.d.ts: 4 metody MediaFile + getMediaStatus
- [x] UI: MediaLibraryPanel — lista plików audio/video, dodawanie, usuwanie
- [x] App.tsx: przycisk "Media" w toolbar Timeline view

### ATEM Connection (prawdziwy via atem-connection npm)
- [x] `npm install atem-connection` — dodanie zależności
- [x] `atem-sender.ts` — prawdziwe połączenie via atem-connection npm:
  - `connectReal()` — `new Atem()` + `.connect(ip)` + event listeners
  - `performCut(input)` — changePreviewInput → cut
  - `performMix(input, duration)` — changePreviewInput → autoTransition
  - `setPreview(input)` — changePreviewInput
  - `syncStateFromAtem()` — odczyt programInput/previewInput z atem.state
  - Real-time feedback: `stateChanged` → emit program-changed/preview-changed
  - Model name z `atem.state.info.productIdentifier`
  - Auto-reconnect co 5s przy disconnect
  - Graceful fallback: jeśli `atem-connection` niedostępny → placeholder behavior
  - `forcePlaceholder` option w constructor (do testów)

### Testy
- [x] `tests/unit/ltc-reader.test.ts` — 16 testów:
  - Status, source change, connect/disconnect, feedTc, callback, disabled, config, destroy
- [x] `tests/unit/ptz-sender.test.ts` — 9 testów:
  - Recall preset (z/bez config), disabled, attach, null/missing camera, config, destroy
- [x] `tests/unit/camera-preset-repo.test.ts` — 13 testów:
  - Create (domyślny/pełny), find (by ID/project/nonexistent), update (label/operator/empty/nonexistent), delete, UNIQUE constraint
- [x] `tests/unit/engine-ltc.test.ts` — 9 testów:
  - setLtcSource, feedExternalTc, clamp, ignore internal, tickFrames w ltc/internal, timesnap ltc_source
- [x] `tests/unit/media-playback.test.ts` — 11 testów:
  - Status, trigger→play, callback, stop, onStop, volume, clamp, cue-exited→stop, non-media exit, disabled, destroy
- [x] Rozszerzenie `senders.test.ts` — +1 test SenderManager z ltc + ptz
- [x] Aktualizacja `atem-sender.test.ts` — forcePlaceholder w testach

### Weryfikacja
- [x] `npx tsc --noEmit` — zero błędów TypeScript
- [x] `npx vitest run` — 466 testów przechodzących (62 nowych)

**Statystyki Fazy 10:** 62 nowe testy, ~1500 linii nowego kodu
**ŁĄCZNIE:** 466 testów, 44 pliki testów

---

## Uwagi do przyszłych faz

### PTZ — rozszerzenie protokołów
Aktualnie PtzSender obsługuje tylko placeholder VISCA over IP. Należy rozszerzyć o:
- **VISCA over IP** (UDP :52381) — prawdziwa implementacja encoder/decoder pakietów VISCA (recall preset = ~6 bajtów)
- **VISCA over Serial** (RS-232/RS-422) — via `serialport` npm, starsze kamery Sony/Panasonic
- **NDI PTZ** (TCP, NDI SDK) — kamery NDI
- **ONVIF** (HTTP/SOAP) — kamery IP
- **Pelco-D/P** (Serial RS-485) — kamery ochrony

Konfiguracja per kamera: `protocol` field w `PtzCameraConfig` — wybór protokołu per kamera.

---

## Faza 11 — Multi-user Polish + UX Improvements + Stabilizacja [UKONCZONA]

### Chunk 1: Multi-user Session Management
- [x] `electron/ws-server.ts`: `getConnectedClients()` — lista aktywnych sesji z typem klienta
- [x] `electron/ws-server.ts`: `scheduleBroadcastClientsChanged()` — debounced broadcast (max 1/500ms)
- [x] `electron/ws-server.ts`: broadcast `server:clients_changed` po connect/disconnect
- [x] `electron/ws-server.ts`: rozszerzony `sendWelcome()` z `connected_clients` w initial_state
- [x] `src/store/playback.store.ts`: pole `connectedClients`, akcja `setConnectedClients`
- [x] `src/hooks/useRundownSocket.ts`: handler `server:clients_changed` + obsługa w welcome
- [x] `src/components/ConnectedClients/ConnectedClients.tsx` — NOWY: badge z liczbą + popup z listą klientów (ikony per typ)
- [x] `src/components/TransportBar/TransportBar.tsx`: integracja ConnectedClients

### Chunk 2: Text Variables (CRUD + Substitution)
- [x] `electron/main.ts`: 5 IPC handlers (getTextVariables, createTextVariable, updateTextVariable, deleteTextVariable, getTextVariableMap)
- [x] `electron/main.ts`: walidacja klucza `/^[a-z0-9-]+$/`
- [x] `electron/ws-protocol-types.ts`: rozszerzony RundownChange o `variable_changed`
- [x] `electron/preload.ts` + `src/types/electron.d.ts`: 5 nowych metod
- [x] `src/store/playback.store.ts`: pole `textVariables`, akcje CRUD
- [x] `src/store/playback.store.ts`: obsługa `variable_changed` w `applyDelta`
- [x] `src/utils/textVariables.ts` — NOWY: `substituteVariables()`, `buildVariableMap()`
- [x] `src/components/TextVariablePanel/TextVariablePanel.tsx` — NOWY: dialog zarządzania zmiennymi
- [x] `src/components/RundownTable/RundownTable.tsx`: substitution w tytułach i subtitle cue'ów
- [x] `src/App.tsx`: przycisk "Variables" w toolbar + ładowanie zmiennych po wyborze rundownu

### Chunk 3: Cue Groups (grupowanie cue'ów)
- [x] `electron/main.ts`: 4 IPC handlers (getCueGroups, createCueGroup, updateCueGroup, deleteCueGroup)
- [x] `electron/main.ts`: walidacja (label wymagany)
- [x] `electron/ws-protocol-types.ts`: rozszerzony RundownChange o `group_added`, `group_deleted`
- [x] `electron/preload.ts` + `src/types/electron.d.ts`: 4 nowe metody
- [x] `src/store/playback.store.ts`: pole `cueGroups`, akcje CRUD + `toggleCueGroupCollapsed`
- [x] `src/store/playback.store.ts`: obsługa `group_added` i `group_deleted` w `applyDelta`
- [x] `src/components/RundownTable/RundownTable.tsx`: nagłówki grup (kolor, collapse/expand), filtrowanie zwiniętych
- [x] `src/App.tsx`: ładowanie grup po wyborze rundownu

### Chunk 4: UX Polish
- [x] `electron/main.ts`: confirm dialog przed zamknięciem (dialog.showMessageBox) gdy playback aktywny
- [x] `src/components/ErrorBoundary/ErrorBoundary.tsx` — NOWY: class component, czytelny ekran błędu, przycisk odświeżenia
- [x] `src/main.tsx`: wrapowanie App w ErrorBoundary
- [x] `src/components/Toast/Toast.tsx` — NOWY: toast store (Zustand), auto-dismiss 3s, ToastContainer
- [x] `src/components/ShortcutHelp/ShortcutHelp.tsx` — NOWY: overlay z tabelą skrótów (globalne, rundown, timeline)
- [x] `src/hooks/useKeyboardShortcuts.ts`: obsługa `?` → toggle shortcut help
- [x] `src/App.tsx`: integracja ToastContainer + ShortcutHelp

### Chunk 5: Stabilizacja + Edge Cases
- [x] `src/store/playback.store.ts`: pole `reconnecting`, akcja `setReconnecting`
- [x] `src/hooks/useRundownSocket.ts`: ustawienie `reconnecting` przy auto-reconnect
- [x] `src/components/TransportBar/TransportBar.tsx`: rozszerzony indicator (zielony/żółty-pulsujący/czerwony)
- [x] `electron/main.ts`: walidacja `duration_ms >= 0` w createCue
- [x] `electron/main.ts`: orphan cleanup — `reloadTimelineCues()` po deleteTrack
- [x] `electron/main.ts`: reset engine po deleteAct jeśli aktywny akt
- [x] `electron/ws-server.ts`: debounce broadcastClientsChanged (max 1/500ms)

### Chunk 6: Testy
- [x] `tests/unit/text-substitution.test.ts` — 8 testów: substituteVariables + buildVariableMap
- [x] `tests/unit/text-variable-ipc.test.ts` — 10 testów: CRUD repo + upsert + getVariableMap
- [x] `tests/unit/cue-group-ipc.test.ts` — 8 testów: CRUD repo + sortowanie + collapsed
- [x] `tests/unit/connected-clients.test.ts` — 4 testy: welcome, getConnectedClients, getSessionCount, broadcast

### Weryfikacja koncowa
- [x] `npx tsc --noEmit` — zero błędów TypeScript
- [x] `npx vitest run` — 496 testów przechodzących (30 nowych)

**Statystyki Fazy 11:** 30 nowych testów, ~1500 linii nowego kodu
**LACZNIE:** 496 testów, 47 plików testów

---

## Faza 12 — Column & Cell Editing + Richtext Editor (TipTap) [UKONCZONA]

### Chunk 1: Column CRUD backend
- [x] IPC handlers: `nextime:createColumn`, `nextime:updateColumn`, `nextime:deleteColumn`, `nextime:reorderColumns`
- [x] `column.repo.ts` — nowa metoda `reorder(rundownId, columnIds)` (batch update w transakcji)
- [x] Broadcast delta: `column_added`, `column_deleted` przez WS
- [x] Walidacja: nazwa kolumny nie może być pusta

### Chunk 2: Cell CRUD backend
- [x] IPC handlers: `nextime:getCells`, `nextime:updateCell` (upsert)
- [x] Broadcast delta: `cell_updated` (cue_id + column_id + content)
- [x] Preload + electron.d.ts: 7 nowych metod (Column CRUD + Cell CRUD)

### Chunk 3: Store — columns + cells state
- [x] Nowe typy: `ColumnInfo`, `CellContent`
- [x] Nowe pola state: `columns: ColumnInfo[]`, `cells: Record<string, Record<string, CellContent>>`
- [x] Nowe akcje: `setColumns`, `addColumn`, `updateColumnInStore`, `removeColumn`, `setCellContent`, `setCellsForCue`
- [x] `RundownChange` rozszerzony o: `column_added`, `column_deleted`, `cell_updated`
- [x] `applyDelta` obsługuje nowe operacje

### Chunk 4: TipTap + RichtextEditor
- [x] Instalacja: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/pm`, `@tiptap/core`
- [x] `src/components/RichtextEditor/RichtextEditor.tsx` — edytor inline z debounced auto-save (500ms)
- [x] Minimalna konfiguracja StarterKit (paragraphs, bold, italic, hard breaks)
- [x] Aktualizacja treści z zewnątrz (WS delta) bez nadpisywania gdy user edytuje

### Chunk 5: TextVariable mark — TipTap extension
- [x] `TextVariableMark.ts` — custom TipTap Mark z atrybutem `key`, cyjanowe tło
- [x] `VariableSuggestion.tsx` — autocomplete popup po wpisaniu `$` (lista zmiennych ze store)
- [x] `extractPlainTextFromRichtext()` w `src/utils/textVariables.ts` — wyciąga plain text z TipTap doc z substitution zmiennych

### Chunk 6: RundownTable — dynamiczne kolumny + ColumnManager
- [x] `ColumnManager.tsx` — dialog zarządzania kolumnami (CRUD, reorder, formularz z nazwa/typ/szerokosc/opcje)
- [x] `CellRenderer.tsx` — komponent renderujący komórkę (richtext: RichtextEditor, dropdown: select)
- [x] RundownTable rozszerzony o dynamiczne nagłówki kolumn z resize handle
- [x] Przycisk "+Col" w nagłówku tabeli otwiera ColumnManager
- [x] Lazy loading komórek per cue (getCells przy pierwszym renderze)

### Chunk 7: Ładowanie kolumn/komórek w App + WS delta
- [x] `App.tsx` — `getColumns(rundownId)` + `setColumns()` przy ładowaniu rundownu
- [x] WS delta `column_added`/`column_deleted`/`cell_updated` działa przez istniejący `applyDelta`
- [x] `ws-protocol-types.ts` rozszerzony o nowe operacje delta

### Chunk 8: Prompter extractPlainText rozszerzony
- [x] `extractPlainText()` w http-server.ts — obsługuje TipTap doc format + rekursywne przejście nodów
- [x] Obsługa TextVariableMark → zamiana na wartość z mapy zmiennych
- [x] Endpoint `/api/output/:token/script` — pobiera variableMap z textVariableRepo
- [x] `HttpServerRepos` rozszerzony o opcjonalne `textVariableRepo`

### Chunk 9: Testy
- [x] `tests/unit/db/column.repo.test.ts` — 2 nowe testy: reorder, delete
- [x] `tests/unit/richtext-variables.test.ts` — 8 nowych testów: extractPlainTextFromRichtext z TipTap doc, TextVariable marks, edge cases

### Weryfikacja koncowa
- [x] `npx tsc --noEmit` — zero błędów TypeScript
- [x] `npx vitest run` — 506 testów przechodzących (10 nowych)

**Statystyki Fazy 12:** 10 nowych testów, ~1400 linii nowego kodu, 5 nowych plików komponentów
**LACZNIE:** 506 testów, 48 plików testów

---

## Faza 13 — Private Notes + Column Visibility + CueApp/Prompter rozszerzenia [UKONCZONA]

### Chunk 1+3: Backend — IPC + Preload
- [x] `private-note.repo.ts` — nowe metody: `findByRundownAndUser()`, `deleteByCueAndUser()`
- [x] `electron/main.ts` — 5 nowych handlerów IPC: getPrivateNotes, upsertPrivateNote, deletePrivateNote, setColumnVisibility, getColumnVisibilities
- [x] `electron/main.ts` — globalny `localUserId` (pobierany z pierwszego projektu, brak auth)
- [x] `electron/main.ts` — import + inicjalizacja `privateNoteRepo`
- [x] `electron/preload.ts` — 5 nowych metod w contextBridge
- [x] `src/types/electron.d.ts` — rozszerzenie NextimeApi o PrivateNote + ColumnVisibility

### Chunk 2: Prywatne notatki — Store + UI
- [x] `playback.store.ts` — nowy stan: `privateNotes`, `hiddenColumnIds` + akcje
- [x] **NOWY** `src/components/PrivateNotePanel/PrivateNotePanel.tsx` — panel prywatnej notatki (textarea z debounced auto-save 500ms, przycisk usunięcia)
- [x] `CueEditPanel.tsx` — integracja PrivateNotePanel na dole panelu edycji
- [x] `RundownTable.tsx` — ikona 📝 w wierszu cue jeśli ma notatkę
- [x] `App.tsx` — ładowanie notatek i widoczności kolumn przy zmianie rundownu

### Chunk 4: Widoczność kolumn — Store + UI
- [x] `ColumnManager.tsx` — checkbox „Widoczna" per kolumna z IPC setColumnVisibility
- [x] `RundownTable.tsx` — filtrowanie kolumn po `hiddenColumnIds` (ukryte nie renderują się)

### Chunk 5: CueApp rozszerzenia
- [x] Nowy endpoint `/api/output/:token/cells` — pobiera komórki ze wszystkimi kolumnami per cue
- [x] WS klient JS: obsługa `rundown:delta` → odświeżenie danych z API

### Chunk 6: Prompter rozszerzenia
- [x] Polling `/api/output/:token/script` co 5s (odświeżanie treści)
- [x] Wskaźnik aktualnego cue: strzałka ▶ przed tytułem aktywnego cue w prompterze

### Chunk 7: RundownTable drobne ulepszenia
- [x] Podwójne kliknięcie na wiersz cue → otwiera CueEditPanel (ustawia selectedCueId)

### Chunk 8: Testy
- [x] `private-note.repo.test.ts` — 3 nowe testy: findByRundownAndUser, deleteByCueAndUser, deleteByCueAndUser zwraca false
- [x] `column.repo.test.ts` — 1 nowy test: getVisibilitiesByUser
- [x] `http-output.test.ts` — 2 nowe testy: endpoint /cells z komórkami, /cells 404

### Weryfikacja koncowa
- [x] `npx tsc --noEmit` — zero błędów TypeScript
- [x] `npx vitest run` — 512 testów przechodzących (6 nowych)

**Statystyki Fazy 13:** 6 nowych testów, ~350 linii nowego kodu, 1 nowy komponent (PrivateNotePanel)
**LACZNIE:** 512 testów, 44 pliki testów

---

## Faza 14 — Drag & Drop kolumn + Menu kontekstowe + Inline edit + Status + UX [UKOŃCZONA]

- [x] Drag & Drop kolumn w nagłówku tabeli (@dnd-kit horizontal, SortableColumnHeader z resize)
- [x] Menu kontekstowe cue (prawy klik): edytuj, duplikuj, wstaw powyżej/poniżej, zablokuj/odblokuj, zmień kolor tła, usuń
- [x] Edycja inline tytułu cue (podwójne kliknięcie → input, Enter/Escape/blur)
- [x] Edycja inline subtitle cue (analogicznie do tytułu)
- [x] Status cue (ready/standby/done/skipped): migracja SQLite, pole w repo/store, kolumna w tabeli z dropdown
- [x] Skrót Delete → usuwa zaznaczony cue (z potwierdzeniem)
- [x] Skrót Ctrl+D → duplikuje zaznaczony cue
- [x] Skrót Ctrl+Enter → wstawia nowy cue poniżej
- [x] Skrót Escape → odznacza cue + zamyka panel edycji
- [x] Tooltip na truncated subtitle
- [x] Zaktualizowano ShortcutHelp z nowymi skrótami rundown
- [x] 17 nowych testów (store, repo, status DB, DnD kolumn, inline edit, skróty)
- [x] TypeScript strict zero błędów, 529 testów przechodzących

**Statystyki Fazy 14:** 17 nowych testów, ~600 linii nowego kodu
**ŁĄCZNIE:** 529 testów, 46 plików testów

---

## Faza 15 — Seed Demo Data + Import/Export Rundownu [PLANOWANA]

- [ ] **15A — Seed demo data**
  - [ ] `electron/db/seed-demo.ts` — funkcja seedDemoData()
  - [ ] Rundown "Gala AS Media 2026" z 12 cue'ami (opening, VT, wywiad, przerwa, itd.)
  - [ ] 3 kolumny dynamiczne: "Skrypt" (richtext), "Audio" (dropdown), "Grafika" (richtext)
  - [ ] 2 grupy cue'ów: "Blok 1", "Blok 2"
  - [ ] 4 zmienne tekstowe: $presenter, $date, $venue, $sponsor
  - [ ] 1 Act "Koncert" z 5 trackami (vision, lyrics, osc, midi, media) i 15-20 timeline cue'ów
  - [ ] 3 camera presety
  - [ ] Testy seed: ~10
- [ ] **15B — Export/Import rundownu (JSON)**
  - [ ] `electron/export-import.ts` — exportRundownToJson() + importRundownFromJson()
  - [ ] IPC handlery: nextime:exportRundown (dialog Save As), nextime:importRundown (dialog Open)
  - [ ] Preload bridge + electron.d.ts
  - [ ] Przyciski "Eksportuj" / "Importuj" w RundownSidebar
  - [ ] Testy export/import: ~15

---

## Faza 16 — Undo/Redo System [PLANOWANA]

- [ ] `electron/undo-manager.ts` — klasa UndoManager (command pattern, limit 50 operacji)
- [ ] IPC handlery: nextime:undo, nextime:redo, nextime:canUndo, nextime:canRedo
- [ ] Modyfikacja istniejących CRUD handlerów — rejestracja undo po każdym create/update/delete
- [ ] Preload bridge + electron.d.ts
- [ ] Skróty: Ctrl+Z = undo, Ctrl+Shift+Z = redo w useKeyboardShortcuts.ts
- [ ] Store: pola canUndo, canRedo + akcje
- [ ] ShortcutHelp — nowe skróty
- [ ] Testy undo-manager: ~20

---

## Faza 17 — OSC Sender (prawdziwy UDP) + MIDI Sender (node-midi) [PLANOWANA]

- [ ] **17A — OSC Sender (weryfikacja + testy)**
  - [ ] osc-sender.ts — dodać testSend(), lepsze error handling
  - [ ] IPC: nextime:oscTestSend
  - [ ] Testy z mockowanym dgram: ~5
- [ ] **17B — MIDI Sender (prawdziwy node-midi)**
  - [ ] Dependency: `midi` (npm, native moduł — wymaga electron-rebuild)
  - [ ] midi-sender.ts — prawdziwa implementacja: openPort, handleTrigger, listPorts, closePort
  - [ ] Graceful fallback gdy midi niedostępne
  - [ ] IPC: nextime:midiListPorts, nextime:midiOpenPort, nextime:midiTestSend
  - [ ] Testy z mockiem midi: ~10

---

## Faza 18 — Settings Panel + Hardware Configuration UI [PLANOWANA]

- [ ] `electron/db/repositories/settings.repo.ts` — key-value store (get, set, getAll)
- [ ] Tabela `app_settings` w docs/schema.sql + migracja
- [ ] `electron/settings-manager.ts` — centralne zarządzanie, propagacja do senderów
- [ ] IPC: nextime:getSettings, nextime:updateSettings + per-sender configure
- [ ] `src/components/SettingsPanel/SettingsPanel.tsx` — zakładki:
  - [ ] Ogólne (język, auto-save)
  - [ ] OSC (host, port, enabled, test send)
  - [ ] MIDI (port dropdown, channel, enabled, test send)
  - [ ] ATEM (IP, ME index, transition, auto-switch)
  - [ ] LTC (source, device)
  - [ ] GPI (enabled, placeholder)
  - [ ] PTZ (lista kamer: IP, port, protocol)
- [ ] Przycisk "Ustawienia" w toolbar (App.tsx)
- [ ] Testy: ~16

---

## Faza 19 — Multi-Window (Prompter + Output) [PLANOWANA]

- [ ] `electron/main.ts` — Map<string, BrowserWindow> dla dodatkowych okien
- [ ] IPC: nextime:openOutputWindow, nextime:openPrompterWindow, nextime:closeOutputWindow
- [ ] Prompter window: alwaysOnTop, fullscreen, osobny monitor
- [ ] Output window: CueApp/Single view jako lokalne okno Electron
- [ ] Przycisk "Otwórz w nowym oknie" w OutputPanel
- [ ] Cleanup okien przy zamknięciu głównego
- [ ] Testy: ~8

---

## Faza 20 — Electron-Builder Config + Production Build [PLANOWANA]

- [ ] `electron-builder.yml` — konfiguracja:
  - [ ] appId: com.aslive.nextime
  - [ ] productName: NextTime
  - [ ] win: target [nsis, portable], icon
  - [ ] mac: target [dmg], icon, category
  - [ ] files, asarUnpack (better-sqlite3), extraResources (schema.sql)
- [ ] `assets/icon.ico`, `assets/icon.png` — ikona aplikacji
- [ ] package.json — skrypty: pack, dist, dist:win, dist:mac
- [ ] Poprawka ścieżki schema.sql w production (main.ts + migrate.ts)
- [ ] Smoke testy: ~3

---

## Faza 21 — E2E Testy (Playwright + Electron) [PLANOWANA]

- [ ] `playwright.config.ts` — konfiguracja
- [ ] `tests/e2e/helpers/electron-app.ts` — helper uruchamiający Electron
- [ ] `tests/e2e/rundown-crud.spec.ts` — 6 scenariuszy:
  - [ ] Start aplikacji, lista rundownów
  - [ ] Tworzenie rundownu, dodanie cue, edycja, reorder
  - [ ] Usuwanie (Delete), duplikacja (Ctrl+D)
- [ ] `tests/e2e/timeline-basic.spec.ts` — 5 scenariuszy:
  - [ ] Widok Timeline, tworzenie aktu/tracku
  - [ ] Tworzenie timeline cue, play/pause
- [ ] `tests/e2e/output-views.spec.ts` — 3 scenariusze:
  - [ ] Tworzenie output, otwarcie w przeglądarce
  - [ ] Weryfikacja wyświetlania cue'ów
- [ ] E2E testy: ~15-20

---

## Faza 22 — GPI Sender + LTC Reader + PTZ VISCA [PLANOWANA]

- [ ] **22A — GPI Sender (serialport)**
  - [ ] Dependency: `serialport` (npm)
  - [ ] gpi-sender.ts — prawdziwa implementacja: otwarcie portu, wysyłanie trigger
  - [ ] IPC: nextime:gpiListPorts, nextime:gpiConfigure
  - [ ] Graceful fallback
- [ ] **22B — LTC Reader (audio input / MTC przez MIDI)**
  - [ ] ltc-reader.ts — prawdziwy odczyt LTC z karty dźwiękowej lub MTC z MIDI
  - [ ] Alternatywa: MTC przez node-midi (z Fazy 17)
- [ ] **22C — PTZ Sender (VISCA over IP)**
  - [ ] ptz-sender.ts — socket TCP do kamery, komendy VISCA recall preset
  - [ ] Obsługa wielu kamer równocześnie
- [ ] Testy: ~15

---

## SUGEROWANA KOLEJNOŚĆ IMPLEMENTACJI

```
Faza 20 (electron-builder)  ← warunek do testów produkcyjnych
Faza 15 (seed + export)     ← daje użytkownikom coś do pracy
Faza 16 (undo/redo)         ← safety net dla edycji
Faza 17 (OSC + MIDI)        ← odblokowanie integracji hardware
Faza 18 (settings panel)    ← UI do konfiguracji hardware
Faza 19 (multi-window)      ← prompter na osobnym monitorze
Faza 21 (E2E testy)         ← regresja coverage
Faza 22 (GPI + LTC + PTZ)   ← niszowe integracje
```

## PODSUMOWANIE

| Faza | Testy | Priorytet |
|------|-------|-----------|
| 15 (Seed + Export) | ~25 | WYSOKI |
| 16 (Undo/Redo) | ~20 | WYSOKI |
| 17 (OSC + MIDI) | ~15 | WYSOKI |
| 18 (Settings Panel) | ~16 | WYSOKI |
| 19 (Multi-Window) | ~8 | ŚREDNI |
| 20 (Electron-Builder) | ~3 | KRYTYCZNY |
| 21 (E2E Testy) | ~18 | ŚREDNI |
| 22 (GPI + LTC + PTZ) | ~15 | NISKI |
| **SUMA** | **~120** | |

Po Fazie 22: **~650 testów**, pełna integracja hardware, production build, E2E coverage.
