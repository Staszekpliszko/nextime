# Rundown Pro — Broadcast Rundown Application

## Czym jest ten projekt

Profesjonalna aplikacja desktopowa do zarządzania przebiegiem produkcji live (eventy, broadcasting, esport, konferencje). Łączy dwa paradygmaty:
- **Rundown Studio-style** — lista cue'ów z timerami (ms-based), kolumny, prompter
- **CuePilot-style** — timeline z klatkami (frame-based), vision cues, LTC sync

Zbudowana dla firmy AS Media (AS LIVE MEDIA Sp. z o.o.) w Polsce.

## Stack technologiczny

| Warstwa | Technologia |
|---|---|
| Desktop shell | **Electron** (Mac + Windows) |
| UI | **React 18** + **TypeScript** + **Tailwind CSS** |
| Baza danych | **SQLite** via `better-sqlite3` |
| WebSocket serwer | `ws` npm (w Electron main process) |
| HTTP API | `express` (w Electron main process) |
| Build | `electron-builder` / `vite` |
| Testy | `vitest` + `playwright` (e2e) |

## Struktura katalogów (docelowa)

```
rundown-pro/
├── electron/
│   ├── main.ts              # Electron main process — entry point
│   ├── ws-server.ts         # WebSocket serwer (port 3141)
│   ├── http-server.ts       # Express HTTP API (Companion-compatible)
│   ├── playback-engine.ts   # Silnik odtwarzania (timesnap, LTC)
│   └── db/
│       ├── connection.ts    # better-sqlite3 connection + PRAGMA
│       ├── schema.sql       # DDL — CREATE TABLE, triggers, indexes
│       ├── migrate.ts       # Runner migracji
│       └── repositories/
│           ├── rundown.repo.ts
│           ├── cue.repo.ts
│           ├── act.repo.ts
│           ├── timeline-cue.repo.ts
│           ├── cell.repo.ts
│           └── index.ts
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── types/
│   │   ├── db.ts            # TypeScript interfaces dla wszystkich encji
│   │   └── ws-protocol.ts   # WebSocket event types
│   ├── components/
│   │   ├── RundownTable/    # Tabela cue'ów (Rundown Studio-style)
│   │   ├── Timeline/        # Oś czasu (CuePilot-style)
│   │   ├── TransportBar/    # Play/Pause/Next/TC display
│   │   ├── ShotlistPanel/   # Panel kamer po prawej
│   │   └── CueApp/          # Widok webowy dla tabletów
│   ├── hooks/
│   │   ├── useRundownSocket.ts  # WS klient — timesnap, delta
│   │   └── usePlayback.ts       # Obliczenia remaining/elapsed
│   └── store/
│       └── playback.store.ts    # Zustand store
├── docs/
│   ├── schema.sql           # KOMPLETNY schemat SQLite (źródło prawdy)
│   ├── types.ts             # KOMPLETNE TypeScript interfaces
│   └── ws-protocol.ts       # KOMPLETNY protokół WebSocket
├── CLAUDE.md                # Ten plik
└── package.json
```

## Dokumentacja projektowa (PRZECZYTAJ NAJPIERW)

Przed pisaniem kodu zawsze sprawdź pliki w `docs/` — to jest źródło prawdy dla całego projektu:

- `docs/schema.sql` — pełny schemat SQLite z 19 tabelami, relacjami FK i triggerami
- `docs/types.ts` — TypeScript interfaces dla wszystkich encji (discriminated unions, type guards)
- `docs/ws-protocol.ts` — protokół WebSocket z wszystkimi zdarzeniami S→C i C→S

**Nigdy nie odchodź od tych interfejsów bez wyraźnego polecenia.**

## Model danych — hierarchia

```
Event (folder)
└── Project (CuePilot container)
    ├── ProjectMember (role: owner|admin|editor|viewer)
    └── CameraPreset (kamery nr 1–16, kolory, kanały)

Rundown (lista cue'ów)
├── Column (konfigurowalne kolumny tabeli)
├── TextVariable ($klucz → wartość, inline w komórkach)
├── OutputConfig (wyjścia: list|single|prompter + share_token)
├── CueGroup (grupowanie cue'ów)
└── Cue (jeden wiersz programu)
    ├── Cell (zawartość cue × kolumna — richtext/dropdown)
    └── PrivateNote (notatki prywatne per user)

Act (CuePilot: jeden performance z osią czasu)
└── Track (pas osi czasu: vision|lyrics|osc|midi|gpi|media)
    └── TimelineCue (blok na osi czasu — frame-based)
```

## Kluczowe decyzje architektoniczne

### Dwa systemy czasu — NIGDY nie mieszaj

| Kontekst | Jednostka | Pole |
|---|---|---|
| Rundown (cue list) | milliseconds | `duration_ms`, `kickoff_epoch_ms`, `deadline_epoch_ms` |
| Timeline (act/track) | frames | `tc_in_frames`, `tc_out_frames`, `current_tc_frames` |

Konwersja tylko w UI layer, nigdy w bazie ani w logice biznesowej.

### Cue — discriminated union (start_type)

```typescript
// POPRAWNIE:
if (isHardCue(cue)) {
  // TypeScript wie że cue.hard_start_datetime istnieje
  const startMs = new Date(cue.hard_start_datetime).getTime();
}

// BŁĘDNIE:
const startMs = new Date(cue.hard_start_datetime!).getTime(); // nie używaj !
```

### TimelineCue — discriminated union (type)

```typescript
// POPRAWNIE — użyj type guard:
if (isVisionCue(cue)) {
  const cam = cue.data.camera_number; // TypeScript wie o VisionCueData
}

// BŁĘDNIE:
const cam = (cue.data as any).camera_number; // nigdy any
```

### SQLite — ważne konwencje

- Booleans: `INTEGER CHECK(field IN (0,1))` — konwertuj na `boolean` w repository layer
- JSON pola: `TEXT` — `JSON.parse()` / `JSON.stringify()` w repository layer  
- Timestamps: `TEXT ISO-8601` — `new Date(field)` w warstwie prezentacji
- UUID: `TEXT` — generuj `crypto.randomUUID()` przed INSERT
- Zawsze używaj `PRAGMA foreign_keys = ON` — jest w `connection.ts`

### WebSocket — envelope format

Każda wiadomość musi być opakowana w `WsEnvelope`:
```typescript
{
  event: 'playback:timesnap',
  payload: { /* WsTimesnapPayload */ },
  sent_at: Date.now(),
  seq: session.seq++,
}
```

Klient wykrywa gap przez `seq` i wysyła `cmd:resync` jeśli skoczył.

## Kolejność implementacji (roadmap)

### Faza 1 — Fundament (zacznij tutaj)
1. `package.json` + `tsconfig.json` + `vite.config.ts` + `electron-builder.yml`
2. `electron/db/connection.ts` — better-sqlite3 + PRAGMAy
3. `electron/db/migrate.ts` — runner schema.sql
4. `electron/db/repositories/*.repo.ts` — CRUD dla każdej tabeli
5. `electron/main.ts` — Electron main, otwieranie okna
6. Podstawowy `src/App.tsx` z Hello World

### Faza 2 — Rundown core
7. `electron/ws-server.ts` — WebSocket serwer + handshake
8. `electron/playback-engine.ts` — PlaybackState, timesnap broadcast
9. `src/components/RundownTable/` — tabela cue'ów
10. `src/hooks/useRundownSocket.ts` — klient WS

### Faza 3 — Timeline (CuePilot-style)
11. `src/components/Timeline/` — canvas z trackami
12. `src/components/ShotlistPanel/` — lista ujęć
13. LTC reader (opcjonalnie)

### Faza 4 — Outputs
14. CueApp webview (przeglądarka na tablecie)
15. Prompter output
16. `electron/http-server.ts` — Companion HTTP API

## Konwencje kodu

- **Język:** TypeScript strict, zero `any`
- **Nazewnictwo:** camelCase dla zmiennych/funkcji, PascalCase dla komponentów/interfejsów
- **Komponenty React:** funkcyjne z hooks, bez class components
- **Importy:** absolutne aliasy (`@/components/...`, `@/hooks/...`)
- **Pliki:** jeden komponent / jeden hook per plik
- **Komentarze:** po polsku dla logiki biznesowej, po angielsku dla API/typów
- **Testy:** vitest dla repository layer i playback engine (logika bez DOM)

## Środowisko deweloperskie

```bash
npm run dev          # Vite dev server + Electron w trybie dev
npm run build        # Produkcja: Vite build + electron-builder
npm run test         # vitest
npm run typecheck    # tsc --noEmit
```

Electron hot-reload przez `electron-vite` lub `vite-plugin-electron`.

## Ważne ograniczenia Electrona

- **Main process** (Node.js): dostęp do SQLite, fs, ws serwer, serialport
- **Renderer process** (Chromium): React UI, WebSocket klient, bez dostępu do Node
- **IPC**: `ipcMain` / `ipcRenderer` do komunikacji main↔renderer
- **Preload script**: bezpieczny most między renderer a main przez `contextBridge`
- SQLite TYLKO w main process — nigdy w renderer

## Debugowanie

- Main process: `--inspect` flag w electron, attach Node debugger
- Renderer: DevTools w oknie Electrona (Ctrl+Shift+I)
- WebSocket: wscat lub websocat do testowania serwera
- SQLite: DB Browser for SQLite do inspekcji bazy

## Kontekst biznesowy

Aplikacja dla produkcji live (broadcasting, eventy, esport). Używana przez:
- **Reżyser** — główne okno, steruje showem
- **Operator kamery** — CueApp na tablecie, widzi swoje ujęcia
- **Producent** — edytuje rundown przed i podczas show
- **Prompter** — teleprompter dla prezentera
- **Bitfocus Companion** — StreamDeck do fizycznych przycisków

Niezawodność > funkcje. Aplikacja musi działać offline i lokalnie — bez chmury.
