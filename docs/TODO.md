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

## Faza 15 — Seed Demo Data + Import/Export Rundownu [UKOŃCZONA]

- [x] **15A — Seed demo data**
  - [x] `electron/db/seed-demo.ts` — funkcja seedDemoData() z pełnymi danymi demo
  - [x] Rundown "Gala AS Media 2026" z 12 cue'ami (Opening, VT Intro, Wywiad, Przerwa muzyczna, Blok sponsorski, Konkurs, VT Reportaż, Panel dyskusyjny, Występ artystyczny, Podsumowanie, Zakończenie, Credits)
  - [x] 3 kolumny dynamiczne: "Skrypt" (richtext), "Audio" (dropdown: BGM/VO/OFF/SFX), "Grafika" (richtext)
  - [x] 2 grupy cue'ów: "Blok 1 — Otwarcie", "Blok 2 — Program"
  - [x] 4 zmienne tekstowe: $presenter, $date, $venue, $sponsor
  - [x] 1 Act "Koncert Główny" (fps=25, 45000 klatek) z 5 trackami i 12 timeline cue'ów (4 vision, 3 lyric, 2 osc, 1 midi, 1 media)
  - [x] 3 camera presety (Scena/Publiczność/Zbliżenie)
  - [x] Przykładowe komórki (cells) z richtext i dropdown dla kilku cue'ów
  - [x] Idempotentność — nie tworzy duplikatów przy ponownym uruchomieniu
  - [x] Wywołanie w `electron/main.ts` w initServices() po seedowaniu user/event/project
  - [x] `docs/schema.sql` — dodano kolumnę `status` do tabeli cues (zsynchronizowano z migracją inkrementalną)
- [x] **15B — Export/Import rundownu (JSON)**
  - [x] `electron/export-import.ts` — exportRundownToJson() + importRundownFromJson()
  - [x] Format .nextime.json z wersjonowaniem (version: 1), cells z indeksami cue/kolumny, groups z ref
  - [x] Walidacja importu: wersja, app, wymagane pola, graceful handling brakujących opcjonalnych
  - [x] Nowe UUID przy imporcie — brak kolizji z istniejącymi danymi
  - [x] IPC handlery: nextime:exportRundown (dialog Save As), nextime:importRundown (dialog Open)
  - [x] Preload bridge + electron.d.ts — rozszerzone o exportRundown() i importRundown()
  - [x] `src/components/RundownSidebar/ImportExportButtons.tsx` — przyciski "Eksportuj" (↓) i "Importuj" (↑)
  - [x] Integracja z RundownSidebar — przyciski na dole panelu
  - [x] Toast notifications po udanym eksporcie/imporcie
- [x] **Testy Fazy 15**
  - [x] `tests/unit/seed-demo.test.ts` — 12 testów (seed tworzy dane, idempotentność, poprawność danych)
  - [x] `tests/unit/export-import.test.ts` — 22 testy (export struktura, roundtrip, walidacja, nowe UUID)
- [x] TypeScript strict, zero `any`, zero błędów `tsc --noEmit`

**Statystyki Fazy 15:** 34 nowe testy, ~600 linii nowego kodu
**ŁĄCZNIE:** 563 testy, 48 plików testów

---

## Faza 16 — Undo/Redo System [UKOŃCZONA]

- [x] `electron/undo-manager.ts` — klasa UndoManager (command pattern, limit 50 operacji)
  - Interfejs UndoCommand { execute, undo, description }
  - Stosy undo/redo, pushCommand, undo(), redo(), clear(), canUndo/canRedo, getDescription
  - 15 fabryk komend: createCue, deleteCue, updateCue, reorderCues, createColumn, deleteColumn, updateColumn, updateCell, createCueGroup, deleteCueGroup, updateCueGroup, createTextVariable, deleteTextVariable, updateTextVariable
  - Każda komenda przechowuje PEŁNE dane do odtworzenia (snapshot)
- [x] IPC handlery: nextime:undo, nextime:redo, nextime:getUndoState
- [x] Modyfikacja istniejących CRUD handlerów — rejestracja undo po każdym create/update/delete
  - createCue, updateCue, deleteCue (z snapshot cells), reorderCues
  - createColumn, updateColumn, deleteColumn
  - updateCell (z snapshot starej komórki)
  - createCueGroup, updateCueGroup, deleteCueGroup
  - createTextVariable, updateTextVariable, deleteTextVariable
- [x] Preload bridge (undo, redo, getUndoState) + electron.d.ts
- [x] Skróty: Ctrl+Z = undo, Ctrl+Shift+Z = redo w useKeyboardShortcuts.ts
- [x] Store: pola canUndo, canRedo, undoDescription, redoDescription + akcja setUndoState
- [x] ShortcutHelp — nowe skróty Ctrl+Z i Ctrl+Shift+Z
- [x] UI: toast po undo/redo z opisem operacji + odświeżenie danych rundownu
- [x] createWithId() w repozytoriach cue, column, cue-group, text-variable (odtwarzanie z oryginalnym ID)
- [x] Testy undo-manager: 26 testów (6 kategorii)

**Statystyki Fazy 16:** 26 nowych testów, ~500 linii nowego kodu
**ŁĄCZNIE:** 589 testów, 50 plików testów

---

## Faza 17 — OSC Sender (prawdziwy UDP) + MIDI Sender (node-midi) [UKOŃCZONA]

- [x] **17A — OSC Sender (weryfikacja + testy)**
  - [x] osc-sender.ts — testSend(), walidacja IP/port (validateOscAddress), callback w send(), socket.unref()
  - [x] IPC: nextime:oscTestSend, nextime:oscGetConfig, nextime:oscUpdateConfig
  - [x] Preload + electron.d.ts rozszerzone
  - [x] Nowy plik testów: tests/unit/osc-sender.test.ts — 18 testów (walidacja, testSend, send z callbackiem, updateConfig)
- [x] **17B — MIDI Sender (prawdziwy @julusian/midi)**
  - [x] Dependency: `@julusian/midi` (native moduł z prebuilds, N-API)
  - [x] midi-sender.ts — prawdziwa implementacja: listPorts, openPort, closePort, testSend, handleTrigger z hardware output
  - [x] Graceful fallback gdy midi niedostępne (DI: MidiOutputConstructor | null)
  - [x] IPC: nextime:midiListPorts, nextime:midiOpenPort, nextime:midiClosePort, nextime:midiTestSend, nextime:midiGetConfig, nextime:midiUpdateConfig, nextime:midiIsAvailable
  - [x] Preload + electron.d.ts rozszerzone
  - [x] Nowy plik testów: tests/unit/midi-sender.test.ts — 21 testów (listPorts, openPort, closePort, handleTrigger z/bez portu, testSend, isMidiAvailable, destroy)
- [x] **17C — Integracja SenderManager + testy**
  - [x] SenderManager destroy() poprawnie zamyka port MIDI
  - [x] Rozszerzenie tests/unit/senders.test.ts — 2 nowe testy integracyjne
  - [x] Re-eksport nowych typów z electron/senders/index.ts

**Statystyki Fazy 17:** 41 nowych testów (osc: 18, midi: 21, sender-manager: 2), ~400 linii nowego kodu
**ŁĄCZNIE:** 630 testów, 53 pliki testów

---

## Faza 18 — Settings Panel + Hardware Configuration UI [UKOŃCZONA]

- [x] `electron/db/repositories/settings.repo.ts` — key-value store (get, set, getAll, getByPrefix, setMany, delete)
- [x] Tabela `app_settings` w docs/schema.sql + migracja w migrate.ts
- [x] `electron/settings-manager.ts` — centralne zarządzanie, cache + propagacja do senderów
- [x] `electron/ipc/settings-ipc.ts` — IPC handlery: nextime:getSettings, nextime:getSettingsSection, nextime:updateSettings
- [x] Preload + electron.d.ts — 3 nowe metody (getSettings, getSettingsSection, updateSettings)
- [x] `src/components/SettingsPanel/SettingsPanel.tsx` — panel z zakładkami:
  - [x] Ogólne (język, auto-save — placeholder)
  - [x] OSC (host, port, enabled, test send)
  - [x] MIDI (port dropdown, channel, enabled, test send)
  - [x] ATEM (IP, ME index, transition, auto-switch, połącz/rozłącz)
  - [x] LTC (source: wewnętrzny/LTC/MTC/ręczny)
  - [x] GPI (enabled, domyślny impuls — placeholder)
  - [x] PTZ (lista kamer: IP, port, VISCA — dynamiczne dodawanie/usuwanie)
- [x] Przycisk "⚙ Ustawienia" w toolbar (App.tsx) — ml-auto (po prawej)
- [x] Testy: 17 nowych (9 settings repo + 8 settings manager)

**Statystyki Fazy 18:** 17 nowych testów, 6 nowych plików, 7 modyfikowanych
**ŁĄCZNIE:** 647 testów, ~12500 linii kodu

---

## Faza 19 — Multi-Window (Prompter + Output) [UKOŃCZONA]

- [x] `electron/window-manager.ts` — WindowManager z Map<string, BrowserWindow> dla dodatkowych okien
- [x] `electron/ipc/window-ipc.ts` — IPC handlery: nextime:openPrompterWindow, nextime:openOutputWindow, nextime:closeWindow, nextime:getDisplays, nextime:getOpenWindows
- [x] Prompter window: fullscreen, alwaysOnTop, osobny monitor, F11 toggle, Escape zamyka
- [x] Output window: CueApp/Single view jako lokalne okno Electron, wielu jednocześnie
- [x] Przycisk "Okno" w OutputPanel z wyborem monitora dla promptera
- [x] Cleanup okien przy zamknięciu głównego (mainWindow.on('closed') + before-quit)
- [x] Preload + electron.d.ts — 5 nowych metod IPC
- [x] Testy: 9 (WindowManager — monitory, tworzenie okien, zamykanie, cleanup)

**Statystyki Fazy 19:** 9 nowych testów, 3 nowe pliki, 4 zmodyfikowane
**ŁĄCZNIE:** 656 testów, 54 pliki testów

---

## Faza 20 — Electron-Builder Config + Production Build [UKOŃCZONA]

- [x] `electron-builder.yml` — pełna konfiguracja:
  - [x] appId: com.aslive.nextime
  - [x] productName: NextTime
  - [x] win: target [nsis, portable], icon
  - [x] mac: target [dmg], icon, category
  - [x] files, asarUnpack (better-sqlite3 + bindings), extraResources (schema.sql)
  - [x] nsis: allowToChangeInstallationDirectory, ikony instalatora
  - [x] linux: AppImage (opcjonalnie)
  - [x] directories.output: release/
- [x] `assets/icon.ico`, `assets/icon.png` — placeholder ikony (do podmiany)
- [x] package.json — skrypty: pack, dist, dist:win, dist:mac
- [x] `electron/paths.ts` — helper resolving ścieżek (dev vs prod):
  - [x] `isProduction()` — wrapper na app.isPackaged
  - [x] `resolveSchemaPath()` — dev/bundled/production candidates
  - [x] `resolvePreloadPath()` — preload.js w obu trybach
- [x] Poprawka ścieżki schema.sql w production (`electron/db/migrate.ts` — resourcesPath candidate)
- [x] Poprawka ścieżki preload.js (`electron/main.ts` — import resolvePreloadPath z paths.ts)
- [x] Smoke testy: 5 (`tests/unit/production-build.test.ts`)

**Statystyki Fazy 20:** 5 nowych testów, ~180 linii nowego kodu
**ŁĄCZNIE:** 661 testów, 56 plików testów

---

## Faza 21 — E2E Testy (Playwright + Electron) [UKOŃCZONA]

- [x] `playwright.config.ts` — konfiguracja (testDir, timeout 60s, trace on-first-retry, 1 worker)
- [x] `tests/e2e/helpers/electron-app.ts` — helper: launchApp() z izolowanym userData, closeApp() z cleanup
- [x] `electron/main.ts` — obsługa env NEXTIME_USER_DATA_DIR (izolacja bazy E2E) + NEXTIME_E2E (bez DevTools)
- [x] `tests/e2e/rundown-crud.spec.ts` — 6 scenariuszy:
  - [x] Start aplikacji — UI się ładuje, sidebar widoczny
  - [x] Tworzenie nowego rundownu — pojawia się na liście
  - [x] Dodanie cue do rundownu — wiersz w tabeli
  - [x] Edycja cue inline (dblclick na tytuł) — zmiana zapisana
  - [x] Reorder cue (context menu widoczne po right-click)
  - [x] Usuwanie cue (panel edycji → Usuń cue → confirm)
- [x] `tests/e2e/timeline-basic.spec.ts` — 5 scenariuszy:
  - [x] Przejście na zakładkę Oś czasu
  - [x] Tworzenie aktu — pojawia się w ActSelector
  - [x] Tworzenie tracku w akcie (Vision)
  - [x] Widok timeline z trackami po załadowaniu aktu
  - [x] Play/pause transport — stan się zmienia
- [x] `tests/e2e/output-views.spec.ts` — 3 scenariusze:
  - [x] Otwarcie panelu Wyjścia
  - [x] Tworzenie output config — pojawia się na liście
  - [x] Otwarcie okna output — nowe okno Electron
- [x] E2E testy: 14

**Statystyki Fazy 21:** 14 testów E2E (Playwright), 661 testów unit/integration (vitest) — razem 675

---

## Faza 22 — GPI Sender + LTC Reader + PTZ Multi-Protocol [UKOŃCZONA]

- [x] **22A — GPI Sender (serialport)** — prawdziwa implementacja
  - [x] Dependency: `serialport` 13.0 (npm)
  - [x] `electron/senders/gpi-serial.ts` — GpiSerialPort: listPorts, open, close, sendTrigger (pulse/on/off)
  - [x] `electron/senders/gpi-sender.ts` — rozszerzony o serial: openPort, closePort, testSend, isSerialAvailable
  - [x] Graceful fallback: jeśli serialport niedostępny → logowanie do konsoli (jak MIDI)
  - [x] IPC: nextime:gpiListPorts, nextime:gpiOpenPort, nextime:gpiClosePort, nextime:gpiTestSend, nextime:gpiIsAvailable
  - [x] Preload: gpiListPorts, gpiOpenPort, gpiClosePort, gpiTestSend, gpiIsAvailable
  - [x] SettingsPanel GpiTab: lista portów COM, baud rate (9600-115200), Otwórz/Zamknij port, Test trigger
  - [x] SettingsManager: rozszerzony GpiSettings o portPath, baudRate
  - [x] Testy: 14 (GpiSerialPort + GpiSender)
- [x] **22B — LTC Reader (MTC przez MIDI)** — prawdziwa implementacja MTC
  - [x] `electron/senders/mtc-parser.ts` — MtcParser: parsowanie Quarter Frame (8 QF → pełny TC), Full Frame, formatTc
  - [x] `electron/senders/ltc-reader.ts` — rozszerzony o prawdziwy tryb MTC:
    - [x] MidiInputPort DI (analogiczny wzorzec jak MidiSender)
    - [x] connectMtc(portIndex) → otwiera port MIDI Input, nasłuchuje 0xF1 QF
    - [x] disconnectMtc() → zamyka port
    - [x] listMtcPorts() → lista portów MIDI Input
    - [x] Obsługa frame rates: 24, 25, 29.97df, 30
    - [x] Status: lastTcFormatted (HH:MM:SS:FF), midiAvailable
  - [x] IPC: nextime:ltcListMtcPorts, nextime:ltcConnectMtc, nextime:ltcDisconnectMtc, nextime:ltcIsMidiAvailable
  - [x] SettingsPanel LtcTab: wybór portu MIDI Input, Połącz/Rozłącz MTC, wyświetlanie aktualnego TC
  - [x] SettingsManager: rozszerzony LtcSettings o mtcPortIndex
  - [x] Testy: 13 (MtcParser + LtcReader MTC)
- [x] **22C — PTZ Sender (Multi-Protocol — 4 protokoły broadcastowe)**
  - [x] Interfejs PtzDriver: connect, disconnect, recallPreset, panTilt, stop, getStatus
  - [x] `electron/senders/ptz-drivers/visca-protocol.ts` — stałe VISCA, buildRecallPresetCmd, buildPanTiltCmd, buildStopCmd, buildZoomCmd, parseViscaResponse
  - [x] `electron/senders/ptz-drivers/visca-ip-driver.ts` — VISCA over IP (TCP socket, port 52381) — Sony SRG/BRC, PTZOptics, Panasonic AW-UE
  - [x] `electron/senders/ptz-drivers/visca-serial-driver.ts` — VISCA over Serial (RS-422/RS-232) z graceful fallback serialport
  - [x] `electron/senders/ptz-drivers/onvif-driver.ts` — ONVIF Profile S (HTTP/SOAP) — kamery IP, GotoPreset, ContinuousMove, Stop
  - [x] `electron/senders/ptz-drivers/ndi-ptz-driver.ts` — NDI PTZ Control przez HTTP CGI API (PTZOptics/BirdDog) — bez dodatkowych zależności
  - [x] Pelco-D usunięty (kamery CCTV/security — nie broadcastowe)
  - [x] `electron/senders/ptz-sender.ts` — multi-protocol: Map<cameraNumber, PtzDriver>, connectCamera, disconnectCamera, disconnectAll, recallPreset, getCameraStatus, getAllCameraStatuses, listSerialPorts
  - [x] IPC: nextime:ptzConnect, nextime:ptzDisconnect, nextime:ptzRecallPreset, nextime:ptzGetStatus, nextime:ptzListSerialPorts
  - [x] SettingsPanel PtzTab: dropdown protokołu (VISCA IP/Serial/ONVIF/NDI), pola zależne od protokołu, Połącz/Rozłącz/Test Preset per kamera, status connection dot
  - [x] SettingsManager: rozszerzony PtzSettings o serialPath, serialBaudRate, onvifProfileToken/Username/Password
  - [x] Testy: 22 (VISCA protocol + PtzSender)
- [x] Testy łącznie Faza 22: 49 nowych

**Statystyki Fazy 22:** 49 nowych testów, 710 łącznie (661 + 49). ~2200 linii nowego kodu.

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
| 16 (Undo/Redo) | 26 ✅ | UKOŃCZONA |
| 17 (OSC + MIDI) | 41 ✅ | UKOŃCZONA |
| 18 (Settings Panel) | 17 ✅ | UKOŃCZONA |
| 19 (Multi-Window) | 9 ✅ | UKOŃCZONA |
| 20 (Electron-Builder) | 5 ✅ | UKOŃCZONA |
| 21 (E2E Testy) | 14 ✅ | UKOŃCZONA |
| 22 (GPI + LTC + PTZ) | 49 ✅ | UKOŃCZONA |
| **SUMA** | **~146** | |

Po Fazie 22: **710 testów** (696 unit/integration + 14 E2E), pełna integracja hardware, production build, E2E coverage.

---

## Faza 23 — Media Infrastructure: ffprobe + auto-detect duration + waveform [UKOŃCZONA]

- [x] `electron/media/ffprobe-utils.ts` — probeMediaFile(), generateWaveform(), findFfprobePath()
- [x] `electron/media/index.ts` — re-eksport modułów media
- [x] `electron/db/repositories/media-file.repo.ts` — updateDurationAndWaveform()
- [x] IPC: nextime:probeMediaFile, nextime:selectMediaFile, nextime:generateWaveform, nextime:updateMediaFileDuration
- [x] `electron/preload.ts` — probeMediaFile, selectMediaFile, generateWaveform, updateMediaFileDuration
- [x] `src/types/electron.d.ts` — typy NextimeApi rozszerzone o Fazę 23
- [x] `src/components/MediaLibraryPanel/MediaLibraryPanel.tsx` — Electron dialog, auto-probe, duration display
- [x] Testy: 34 nowe (744 łącznie)

**Statystyki Fazy 23:** 35 nowych testów, 745 łącznie. Deps: fluent-ffmpeg, @types/fluent-ffmpeg, @ffprobe-installer/ffprobe

---

## Faza 24 — Prawdziwy Media Playback (audio/video) [UKOŃCZONA]

- [x] `electron/media/media-ipc.ts` — MediaIpcBridge: typy MediaCommand/MediaFeedback, sendCommand, handleFeedback, registerIpcHandlers
- [x] `electron/media/index.ts` — re-eksport MediaIpcBridge i typów
- [x] PRZEBUDOWA `electron/senders/media-sender.ts` — setIpcBridge(), IPC play/stop/pause/resume/volume/seek zamiast console.log, updateFromFeedback(), rozszerzony MediaPlaybackStatus
- [x] `electron/preload.ts` — onMediaCommand, sendMediaFeedback, removeMediaCommandListener, mediaStop, mediaSeek, mediaPause, mediaResume, mediaSetVolume
- [x] `src/types/electron.d.ts` — MediaCommand, MediaFeedback, MediaPlaybackStatus, nowe metody API
- [x] `src/components/MediaPlayer/MediaPlayer.tsx` — ukryty `<audio>`/`<video>`, nasłuchuje IPC, file:// protocol, feedback co 250ms
- [x] `src/components/MediaPlayer/MediaStatusBar.tsx` — pasek z nazwą pliku, progress bar (kliknięcie=seek), elapsed/remaining, przycisk stop
- [x] `electron/main.ts` — MediaIpcBridge tworzony w initServices, setMainWindow po createWindow, IPC handlery mediaStop/Seek/Pause/Resume/SetVolume
- [x] `src/App.tsx` — zamontowane MediaPlayer + MediaStatusBar, stan media lifted
- [x] Testy: 39 nowych (3 pliki: media-ipc-bridge.test.ts, media-sender-ipc.test.ts, media-player.test.ts, media-status-bar.test.ts)

- [x] `src/components/Timeline/TimelineCueDialog.tsx` — dropdown z biblioteki mediów + przycisk "Przeglądaj..." zamiast ręcznego wklejania ścieżki
- [x] `src/components/Timeline/Timeline.tsx` — fix: handleCueDrag aktualizuje store (drag cue'ów na timeline działał w bazie ale nie w UI)
- [x] `src/components/MediaPlayer/MediaStatusBar.tsx` — fix: useCallback przed early return (React hooks order rule)

**Statystyki Fazy 24:** 39 nowych testów, 784 łącznie, 6 nowych plików, 8 modyfikacji

---

## Faza 25 — OBS WebSocket Driver [UKOŃCZONA]

- [x] `electron/senders/obs-sender.ts` — ObsSender: connect, disconnect, setScene, setPreviewScene, triggerTransition, getSceneList, getCurrentScene, getStatus, refreshScenes, auto-reconnect, graceful fallback (obs-websocket-js ESM dynamic import)
- [x] Mapping camera_number → scena OBS (sceneMap w config)
- [x] Auto-reconnect co 5s, graceful fallback na placeholder gdy brak obs-websocket-js
- [x] `electron/senders/index.ts` — ObsSender dodany do SenderManager (attach, destroy)
- [x] `electron/settings-manager.ts` — sekcja obs: ObsSettings (ip, port, password, enabled, autoSwitch, sceneMap), defaults, propagacja do sendera
- [x] `electron/ipc/obs-ipc.ts` — IPC handlery: obsConnect, obsDisconnect, obsGetStatus, obsGetScenes, obsRefreshScenes, obsSetScene, obsSetPreview, obsTriggerTransition
- [x] `electron/preload.ts` — metody obs* w contextBridge
- [x] `src/types/electron.d.ts` — typy OBS w NextimeApi
- [x] `electron/main.ts` — rejestracja registerObsIpcHandlers
- [x] `src/components/SettingsPanel/ObsSettingsTab.tsx` — zakładka OBS: IP, port, hasło, toggle aktywny/auto-switch, połącz/rozłącz ze statusem, lista scen live, scene map (camera→scena), odśwież sceny
- [x] `src/components/SettingsPanel/SettingsPanel.tsx` — zakładka OBS dodana
- [x] Testy: 31 nowych (obs-sender.test.ts: 22, obs-integration.test.ts: 9), łącznie 815

---

## Faza 26 — vMix HTTP Driver [UKOŃCZONA]

- [x] `electron/senders/vmix-xml-parser.ts` — parser XML API vMix: parseVmixXml() → VmixState (inputy, active, preview, streaming, recording)
- [x] `electron/senders/vmix-sender.ts` — VmixSender: connect/disconnect/auto-reconnect, cut/fade/merge/wipe/zoom/stinger, setPreview, playMedia/pauseMedia/setVolume, getInputList/getCurrentState/getStatus/refreshState, handleVisionCueChanged z inputMap, executeTransition wg domyślnego typu, onCommand callback, graceful fallback
- [x] `electron/senders/index.ts` — VmixSender w SenderManager (attach, destroy)
- [x] `electron/settings-manager.ts` — VmixSettings (ip, port, enabled, autoSwitch, inputMap, transitionType, transitionDuration), defaults, applyToSenders, applySectionToSender. Fix: parsowanie obiektów JSON z DB (sceneMap, inputMap)
- [x] `electron/ipc/vmix-ipc.ts` — 10 IPC handlerów (vmixConnect, vmixDisconnect, vmixGetStatus, vmixGetInputs, vmixRefreshInputs, vmixCut, vmixFade, vmixSetPreview, vmixPlayMedia, vmixPauseMedia, vmixSetVolume)
- [x] `electron/preload.ts` — 11 metod vmix* w contextBridge
- [x] `src/types/electron.d.ts` — typy vMix w NextimeApi (VmixStatus, VmixInput)
- [x] `electron/main.ts` — import i rejestracja registerVmixIpcHandlers
- [x] `src/components/SettingsPanel/VmixSettingsTab.tsx` — zakładka vMix: IP/port/toggle/auto-switch/połącz/rozłącz/status/lista inputów/input map/typ przejścia/czas przejścia/streaming+recording status
- [x] `src/components/SettingsPanel/SettingsPanel.tsx` — zakładka 'vMix' dodana do TABS
- [x] 24 nowe testy (6 XML parser + 18 VmixSender), 839 łącznie

- [x] `electron/ipc/settings-ipc.ts` — fix: dodano 'obs' i 'vmix' do validSections (zapis ustawień)
- [x] `electron/main.ts` — auto-connect vMix/OBS przy starcie (jeśli enabled), DevTools detach mode
- [x] `electron/senders/vmix-sender.ts` — PreviewInput przed Cut/Fade/Merge/Wipe/Zoom/Stinger (niezawodne przełączanie video→video), aktualizacja stanu po przełączeniu
- [x] `src/components/Timeline/TimelineCueDialog.tsx` — dropdown Kamera pokazuje inputy vMix (live z API) + status PGM/PRV
- [x] `src/components/SettingsPanel/VmixSettingsTab.tsx` — potwierdzenie zapisu "Zapisano"

**Statystyki Fazy 26:** 24 nowe testy, 839 łącznie, ~1200 linii nowego kodu

---

## Faza 27 — Vision Cue Routing + Transition Types [UKOŃCZONA]

- [x] `electron/senders/vision-router.ts` — VisionRouter: targetSwitcher ('atem'|'obs'|'vmix'|'none'), centralny routing vision cue → aktywny switcher
  - Odczytuje transition_type i transition_duration_ms z danych vision cue
  - Fallback na domyślny transition sendera gdy cue nie ma transition_type
  - Mapowanie typów przejścia na API każdego switchera (ATEM: Cut/Mix, OBS: Cut/Fade/Luma_Wipe/Stinger, vMix: Cut/Fade/Merge/Wipe/Zoom/Stinger1/Stinger2)
- [x] Vision cue data rozszerzone o transition_type (Cut/Fade/Merge/Wipe/Zoom/Stinger1/Stinger2) i transition_duration_ms
- [x] Dropdown "Typ przejścia" + input "Czas (ms)" w TimelineCueDialog (sekcja vision)
- [x] AtemSender, ObsSender, VmixSender — usunięty bezpośredni nasłuch vision-cue-changed (routing przez VisionRouter)
- [x] SenderManager — tworzy VisionRouter, przekazuje referencje do senderów, attach/destroy
- [x] SettingsManager — nowa sekcja `vision: { targetSwitcher }`, propagacja do VisionRouter
- [x] settings-ipc.ts — 'vision' dodane do validSections
- [x] SettingsPanel zakładka "Ogólne" — dropdown "Aktywny switcher wizji" (ATEM/OBS/vMix/Brak)
- [x] Auto-detect targetSwitcher: jeśli 'none' ale switcher enabled+autoSwitch → automatycznie go wybiera (wsteczna kompatybilność)
- [x] Testy: 14 nowych (vision-router.test.ts) + 3 zaktualizowane testy senderów

**Statystyki Fazy 27:** 14 nowych testów, ~350 linii nowego kodu
**ŁĄCZNIE:** 853 testy

---

## Faza 28 — SettingsPanel: zakładki OBS i vMix [UKOŃCZONA w ramach Faz 25-27]

- [x] `ObsSettingsTab.tsx` — IP, port, hasło, sceneMap, Połącz/Rozłącz, lista scen live
- [x] `VmixSettingsTab.tsx` — IP, port, lista inputów live
- [x] `SwitcherSelectField.tsx` — dropdown: ATEM/OBS/vMix/None
- [x] IPC: obsConnect, obsDisconnect, obsGetScenes, vmixConnect, vmixGetInputs
- [x] Testy: zaimplementowane w Fazach 25-27

---

## Faza 29 — OBS/vMix Feedback → UI [UKOŃCZONA]

- [x] `electron/ipc/switcher-ipc.ts` — zunifikowane IPC: switcherGetStatus, switcherSetPreview, switcherCut
- [x] `src/hooks/useSwitcherStatus.ts` — hook polling status aktywnego switchera co 500ms
- [x] `src/components/SwitcherPanel/SwitcherPanel.tsx` — uniwersalny panel PGM/PRV tally (ATEM/OBS/vMix)
- [x] `ShotlistPanel.tsx` — tally kolory (czerwony=PGM, zielony=PRV) na liście vision cue'ów
- [x] `TransportBar.tsx` — zunifikowany wskaźnik switchera (zastępuje wskaźnik ATEM)
- [x] `App.tsx` — podmiana AtemPanel → SwitcherPanel, uniwersalny przycisk "Switcher"
- [x] `electron/preload.ts` + `electron.d.ts` — nowe API: switcherGetStatus, switcherSetPreview, switcherCut
- [x] `electron/main.ts` — rejestracja registerSwitcherIpcHandlers
- [x] Testy: 10 (tests/unit/switcher-panel.test.ts)

**Statystyki Fazy 29:** 863 testów (853 + 10 nowych), 7 plików nowych/zmodyfikowanych

---

## Faza 30 — ATEM Macros, DSK, SuperSource [UKOŃCZONA]

- [x] `electron/senders/atem-fx-handler.ts` — handler vision_fx: macro → macroRun(), DSK on/off, USK on/off, SuperSource box config
- [x] atem-sender.ts — runMacro(), setDownstreamKey(), setUpstreamKey(), setSuperSourceBox() + rozszerzony AtemInstance interface
- [x] PlaybackEngine — case 'vision_fx' → emit 'vision-fx-trigger'
- [x] electron/senders/index.ts — AtemFxHandler w SenderManager (attach/destroy)
- [x] TimelineCueDialog — pełny formularz vision_fx z 4 trybami (Makro/DSK/USK/SuperSource)
- [x] Timeline.tsx — dodano 'vision_fx' do TRACK_TYPES (dropdown „+ Dodaj track")
- [x] Testy: 16 (tests/unit/atem-fx.test.ts)

**Statystyki Fazy 30:** 879 testów (863 + 16 nowych), 6 plików nowych/zmodyfikowanych

---

## Faza 31 — OSC Custom Schemas [UKOŃCZONA]

- [x] `electron/osc-schemas/schema-loader.ts` — loader JSON schematów z walidacją, cache, buildOscAddress()
- [x] `assets/osc-schemas/` — 5 schematów: disguise.json, casparcg.json, qlab.json, ross.json, generic.json
- [x] `src/components/Timeline/OscCueEditor.tsx` — dropdown urządzenie → komenda → dynamiczne argumenty + fallback surowy tryb
- [x] `src/components/Timeline/TimelineCueDialog.tsx` — integracja OscCueEditor (zamiana ręcznych inputów OSC)
- [x] `electron/preload.ts` + `electron/main.ts` — IPC: nextime:getOscSchemas
- [x] `src/types/electron.d.ts` — typ getOscSchemas()
- [x] Testy: 18 (tests/unit/osc-schemas.test.ts)

**Statystyki Fazy 31:** 897 testów (879 + 18 nowych), 8 plików nowych/zmodyfikowanych

---

## Faza 32 — Panasonic PTZ HTTP Driver [UKOŃCZONA]

- [x] `electron/senders/ptz-drivers/panasonic-http-driver.ts` — NOWY: PanasonicHttpDriver z CGI API (recallPreset #R{nn}, panTilt #PTS{pptt}, stop, auto-detect QID)
- [x] `electron/senders/ptz-drivers/ptz-driver.ts` — dodano 'panasonic_http' do PtzProtocol union type
- [x] `electron/senders/ptz-drivers/index.ts` — eksport PanasonicHttpDriver i PanasonicHttpConfig
- [x] `electron/senders/ptz-sender.ts` — case 'panasonic_http' w createDriver()
- [x] `electron/settings-manager.ts` — 'panasonic_http' w PtzSettings.protocol union
- [x] `src/components/SettingsPanel/SettingsPanel.tsx` — opcja "Panasonic HTTP (AW-HE/AW-UE)" w dropdown PTZ + pola IP/port
- [x] `tests/unit/panasonic-ptz.test.ts` — NOWY: 14 testów (driver + integracja PtzSender)

- [x] `tests/unit/obs-integration.test.ts` — FIX: dodano brakujące metody getRow/getByPrefix w mockRepo (3 miejsca)

**Statystyki Fazy 32:** 911 testów (897 + 14 nowych), 8 plików nowych/zmodyfikowanych

---

## Faza 33 — Export PDF / Print [PLANOWANA]

- [ ] `electron/pdf/rundown-pdf.ts` — tabela cue'ów, nagłówek, grupy, numeracja stron
- [ ] `electron/pdf/timeline-pdf.ts` — shotlist z TC i kamerami
- [ ] `ExportPdfDialog.tsx` — wybór kolumn, orientacja, rozmiar
- [ ] Testy: ~15

---

## Faza 34 — Companion/StreamDeck Rozszerzone API [PLANOWANA]

- [ ] 11 nowych HTTP endpointów: goto cue, state, cues list, step_next, take_shot, hold_toggle, step_toggle, ATEM cut/preview, PTZ preset, speed
- [ ] `electron/http/companion-extended.ts`
- [ ] Testy: ~15

---

## Faza 35 — Team Notes (zespołowe notatki) [PLANOWANA]

- [ ] `team-note.repo.ts` — TeamNote CRUD (rundown_id, cue_id?, author_name, content, resolved)
- [ ] `TeamNotesPanel.tsx` — panel boczny, filtr per cue, badge count
- [ ] WS broadcast: team-notes:delta
- [ ] Testy: ~12

---

## Faza 36 — Waveform Preview w Timeline [PLANOWANA]

- [ ] `WaveformCanvas.tsx` — canvas polyline z playhead overlay
- [ ] `MediaCueBlock.tsx` — blok media cue z waveform
- [ ] Testy: ~8

---

## Faza 37 — Natywny StreamDeck (USB HID) [PLANOWANA]

Bezpośrednia integracja ze StreamDeckiem przez USB — bez Companion, auto-detect modelu, konfigurowalne przyciski.
Dwie opcje sterowania: 1) natywnie (ta faza), 2) przez Companion (Faza 34).

**Deps npm:** `@elgato-stream-deck/node`, `sharp` (generowanie obrazów przycisków)

- [ ] `electron/streamdeck/streamdeck-manager.ts` — StreamDeckManager: auto-detect, listDevices(), open(), close()
  - Obsługiwane modele: Mini (6), MK.2 (15), XL (32), Plus (8+4 enc+LCD), Studio (16+2 enc), Neo (8+2+LCD), Pedal (3)
  - Eventy: down, up, rotate (encodery), lcdShortPress/lcdSwipe (Plus)
- [ ] `electron/streamdeck/streamdeck-button-renderer.ts` — generowanie obrazów przycisków z tekstem + ikoną + kolorem tła (sharp)
- [ ] `electron/streamdeck/streamdeck-pages.ts` — system stron (pages) z przyciskami konfigurowalnymi per model
- [ ] `electron/streamdeck/streamdeck-actions.ts` — mapowanie przycisk → akcja NEXTIME
- [ ] Domyślne strony:
  - **SHOW CONTROL:** Play, Pause, Next, Prev, Goto, Step Next, Take Shot, Hold, Step Mode, FTB
  - **SHOTBOX:** CAM 1-8 PGM (czerwony=LIVE) + PVW (zielony=preview), CUT, AUTO, DSK, KEY, MACRO
  - **INFO/TIMERY:** Current Cue (tekst), Next Cue, Remaining (countdown kolorowy), Elapsed, Over/Under, Timecode, Show Clock, Cue Count
  - **AUDIO/MEDIA:** Media Play/Stop, Vol Up/Down, PTZ Preset 1-4
  - **NAWIGACJA:** przełączanie stron
- [ ] Feedback w real-time: tally (czerwony PGM / zielony PVW), countdown (biały→żółty→czerwony→migający), dynamiczny tekst
- [ ] Zakładka "StreamDeck" w SettingsPanel:
  - Auto-detect podłączonego modelu (nazwa, serial, przycisków)
  - Wizualna mapa przycisków (grid wg modelu)
  - Kliknięcie na przycisk → dropdown z listą funkcji
  - Strony (pages) — dodawanie/usuwanie
  - Brightness slider
  - Przycisk "Resetuj do domyślnych"
- [ ] IPC: nextime:streamdeckList, nextime:streamdeckConnect, nextime:streamdeckSetButton, nextime:streamdeckGetConfig
- [ ] Preload + electron.d.ts — typy StreamDeck
- [ ] Testy: ~20

---

## PODSUMOWANIE FAZ 23-37

| Faza | Nazwa | Testy | Priorytet |
|------|-------|-------|-----------|
| 23 (ffprobe + duration) | ~20 | KRYTYCZNY |
| 24 (Media Playback) | ~25 | KRYTYCZNY |
| 25 (OBS WebSocket) | ~20 | WYSOKI |
| 26 (vMix HTTP) | ~18 | WYSOKI |
| 27 (Vision Routing) | ~15 | WYSOKI |
| 28 (Settings OBS/vMix) | ~10 | ŚREDNI |
| 29 (Feedback UI) | ~10 | ŚREDNI |
| 30 (ATEM Macros/DSK) | ~15 | ŚREDNI |
| 31 (OSC Schemas) | ~12 | ŚREDNI |
| 32 (Panasonic PTZ) | ~12 | NISKI |
| 33 (Export PDF) | ~15 | KRYTYCZNY |
| 34 (Companion API) | ~15 | ŚREDNI |
| 35 (Team Notes) | ~12 | NISKI |
| 36 (Waveform) | ~8 | NISKI |
| 37 (Natywny StreamDeck) | ~20 | WYSOKI |
| **SUMA** | **~217** | |

Po Fazie 37: **~927 testów** (710 + 217), pełna paryteta z CuePilot Pro + killer features (OBS/vMix/natywny StreamDeck).
