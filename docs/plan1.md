# NEXTIME — Plan dalszej implementacji (Fazy 15-22)

## Kontekst

Projekt NEXTIME to profesjonalna aplikacja desktopowa do zarządzania produkcjami live (Electron + React + SQLite), wzorowana na CuePilot (timeline frame-based) i Rundown Studio (ms-based cue list). Fazy 1-14 ukończone (529 testów, ~43000 linii kodu). Aplikacja ma kompletny UI i backend, ale **sendery hardware są placeholderami** (logują ale nie wysyłają), brakuje undo/redo, import/export, multi-window, electron-builder i E2E testów.

---

## AKTUALNY STAN — co działa, co nie

### DZIAŁA (po Fazie 14):
- Pełny CRUD 19 tabel SQLite + 15 repozytoriów
- PlaybackEngine z dwoma trybami (rundown_ms + timeline_frames)
- WebSocket server (handshake, timesnap 5Hz, delta sync)
- RundownTable z DnD wierszy i kolumn, inline edit, context menu, status, grupy, richtext
- Timeline canvas z trackami, ruler, playhead, zoom, cue blocks, step/hold mode
- CueApp (list/single/prompter) z WS + HTTP
- ATEM sender z atem-connection (gdy dostępne)
- OSC sender z prawdziwym UDP socket (brak UI konfiguracji)
- 18 keyboard shortcuts (5 placeholder)
- Toast, ErrorBoundary, ShortcutHelp, Private Notes, Column Visibility

### PLACEHOLDER (loguje ale nie wysyła):
- **MIDI sender** — buduje bajty ale brak node-midi
- **GPI sender** — brak serialport
- **LTC reader** — symulowane połączenie
- **PTZ sender** — brak VISCA over IP
- **Media sender** — brak odtwarzania audio/video
- **F2, F4, F5, F6, F10** — preventDefault bez akcji
- **F7 (PTZ recall)** — nie zaimplementowany

### CAŁKOWITY BRAK:
- Undo/Redo
- Import/Export rundownu
- Multi-window (prompter/output na osobnym monitorze)
- Electron-builder config (nie da się zbudować instalatora)
- E2E testy (Playwright)
- Panel ustawień (konfiguracja senderów z UI)
- Seed demo data (pusty rundown po instalacji)

---

## FAZA 15 — Seed Demo Data + Import/Export Rundownu

**Cel:** Użytkownik po instalacji widzi gotowy rundown z przykładowymi cue'ami. Może eksportować/importować rundowny jako JSON.

### 15A — Seed demo data

**Pliki:**
- `electron/main.ts` — rozszerzenie auto-seed w initServices()
- **NOWY:** `electron/db/seed-demo.ts` — funkcja seedDemoData():
  - Rundown "Gala AS Media 2026" z 12 cue'ami
  - 3 kolumny: "Skrypt" (richtext), "Audio" (dropdown), "Grafika" (richtext)
  - 2 grupy cue'ów: "Blok 1", "Blok 2"
  - 4 zmienne: $presenter, $date, $venue, $sponsor
  - 1 Act "Koncert" z 5 trackami i 15-20 timeline cue'ów
  - 3 camera presety
- **NOWY:** `tests/unit/seed-demo.test.ts` — ~10 testów

### 15B — Export/Import rundownu (JSON)

**Pliki:**
- **NOWY:** `electron/export-import.ts` — exportRundownToJson() + importRundownFromJson()
- `electron/main.ts` — IPC: nextime:exportRundown, nextime:importRundown (dialog Save/Open)
- `electron/preload.ts` — bridge
- `src/types/electron.d.ts` — nowe metody API
- **NOWY:** `src/components/RundownSidebar/ImportExportButtons.tsx`
- `src/components/RundownSidebar/RundownSidebar.tsx` — podpięcie przycisków
- **NOWY:** `tests/unit/export-import.test.ts` — ~15 testów

**Szacowane testy:** ~25

---

## FAZA 16 — Undo/Redo System

**Cel:** Ctrl+Z / Ctrl+Shift+Z — cofanie/ponawianie edycji cue'ów, kolumn, komórek.

**Architektura:** Command pattern — każda mutacja IPC rejestruje undo entry na stosie (limit 50).

**Pliki:**
- **NOWY:** `electron/undo-manager.ts` — klasa UndoManager (push, undo, redo, canUndo, canRedo)
- `electron/main.ts` — IPC: nextime:undo, nextime:redo + modyfikacja istniejących CRUD handlerów (rejestracja undo po każdym create/update/delete)
- `electron/preload.ts` — bridge
- `src/types/electron.d.ts` — nowe metody
- `src/hooks/useKeyboardShortcuts.ts` — Ctrl+Z = undo, Ctrl+Shift+Z = redo
- `src/store/playback.store.ts` — pola canUndo, canRedo
- `src/components/ShortcutHelp/ShortcutHelp.tsx` — nowe skróty
- **NOWY:** `tests/unit/undo-manager.test.ts` — ~20 testów

**Szacowane testy:** ~20

---

## FAZA 17 — OSC Sender (weryfikacja) + MIDI Sender (node-midi)

**Cel:** Prawdziwe wysyłanie OSC przez UDP i MIDI przez node-midi.

### 17A — OSC Sender
- `electron/senders/osc-sender.ts` — dodać testSend(), error handling
- `electron/main.ts` — IPC: nextime:oscTestSend
- **NOWY:** `tests/unit/osc-sender-udp.test.ts` — testy z mockowanym dgram

### 17B — MIDI Sender
- Dependency: `midi` (npm, native moduł)
- `electron/senders/midi-sender.ts` — prawdziwa implementacja: openPort, handleTrigger, listPorts, closePort
- `electron/main.ts` — IPC: nextime:midiListPorts, nextime:midiOpenPort, nextime:midiTestSend
- `electron/preload.ts` — bridge
- **NOWY:** `tests/unit/midi-sender-real.test.ts`

**Szacowane testy:** ~15

---

## FAZA 18 — Settings Panel + Hardware Configuration UI

**Cel:** Panel ustawień z zakładkami do konfiguracji OSC/MIDI/ATEM/LTC/GPI/PTZ.

**Pliki:**
- **NOWY:** `electron/db/repositories/settings.repo.ts` — key-value store
- `docs/schema.sql` — tabela app_settings
- `electron/db/migrate.ts` — migracja
- **NOWY:** `electron/settings-manager.ts` — centralne zarządzanie, propagacja do senderów
- `electron/main.ts` — IPC: nextime:getSettings, nextime:updateSettings + per-sender configure
- **NOWY:** `src/components/SettingsPanel/SettingsPanel.tsx` — zakładki: Ogólne, OSC, MIDI, ATEM, LTC, GPI, PTZ
- `src/App.tsx` — przycisk "Ustawienia" w toolbar
- **NOWY:** `tests/unit/settings-repo.test.ts` — ~8 testów
- **NOWY:** `tests/unit/settings-manager.test.ts` — ~8 testów

**Szacowane testy:** ~16

---

## FAZA 19 — Multi-Window (Prompter + Output)

**Cel:** Otwieranie promptera/CueApp jako osobne okna Electron (na drugi monitor).

**Pliki:**
- `electron/main.ts` — Map<string, BrowserWindow> dla dodatkowych okien, IPC: nextime:openOutputWindow, nextime:openPrompterWindow, nextime:closeOutputWindow
- `electron/preload.ts` — bridge
- `src/components/OutputPanel/OutputPanel.tsx` — przycisk "Otwórz w nowym oknie"
- **NOWY:** `tests/unit/multi-window.test.ts` — ~8 testów

**Szacowane testy:** ~8

---

## FAZA 20 — Electron-Builder Config + Production Build

**Cel:** Zbudowanie instalatora .exe / .dmg.

**Pliki:**
- **NOWY:** `electron-builder.yml` — appId, productName, win/mac targets, files, asarUnpack (better-sqlite3)
- **NOWY:** `assets/icon.ico`, `assets/icon.png` — ikona aplikacji
- `package.json` — skrypty: pack, dist, dist:win, dist:mac
- `electron/main.ts` — poprawka ścieżki schema.sql w production
- `electron/db/migrate.ts` — obsługa ASAR

**Szacowane testy:** ~3 (smoke tests)

---

## FAZA 21 — E2E Testy (Playwright)

**Cel:** Automatyczne testy end-to-end całej aplikacji.

**Pliki:**
- **NOWY:** `playwright.config.ts`
- **NOWY:** `tests/e2e/helpers/electron-app.ts` — helper uruchamiający Electron
- **NOWY:** `tests/e2e/rundown-crud.spec.ts` — 6 scenariuszy CRUD
- **NOWY:** `tests/e2e/timeline-basic.spec.ts` — 5 scenariuszy timeline
- **NOWY:** `tests/e2e/output-views.spec.ts` — 3 scenariusze output

**Szacowane testy:** ~15-20 E2E

---

## FAZA 22 — GPI Sender + LTC Reader + PTZ VISCA

**Cel:** Prawdziwe integracje hardware (niszowe — nie każda produkcja ich używa).

### 22A — GPI (serialport)
### 22B — LTC (audio input lub MTC przez MIDI)
### 22C — PTZ (VISCA over IP — custom implementacja)

**Szacowane testy:** ~15

---

## SUGEROWANA KOLEJNOŚĆ

```
Faza 20 (electron-builder)  ← warunek konieczny do testów produkcyjnych
Faza 15 (seed + export)     ← daje użytkownikom coś do pracy
Faza 16 (undo/redo)         ← safety net dla edycji
Faza 17 (OSC + MIDI)        ← odblokowanie integracji hardware
Faza 18 (settings panel)    ← UI do konfiguracji hardware
Faza 19 (multi-window)      ← prompter na osobnym monitorze
Faza 21 (E2E testy)         ← regresja coverage
Faza 22 (GPI + LTC + PTZ)   ← niszowe integracje
```

## PODSUMOWANIE LICZBOWE

| Faza | Testy | Nowe pliki | Priorytet |
|------|-------|------------|-----------|
| 15 | ~25 | 4 | WYSOKI |
| 16 | ~20 | 2 | WYSOKI |
| 17 | ~15 | 2 | WYSOKI |
| 18 | ~16 | 4 | WYSOKI |
| 19 | ~8 | 1 | ŚREDNI |
| 20 | ~3 | 3 | KRYTYCZNY |
| 21 | ~18 | 4 | ŚREDNI |
| 22 | ~15 | 0 (modyfikacje) | NISKI |
| **SUMA** | **~120** | **~20** | |

Po Fazie 22: **~650 testów**, pełna integracja hardware, production build, E2E coverage.

## Weryfikacja

Po każdej fazie:
1. `npx tsc --noEmit` — zero błędów
2. `npx vitest run` — wszystkie testy przechodzą
3. `npm run dev` — aplikacja startuje i działa
4. Po Fazie 20: `npm run dist` — buduje instalator
5. Po Fazie 21: `npx playwright test` — E2E przechodzą
