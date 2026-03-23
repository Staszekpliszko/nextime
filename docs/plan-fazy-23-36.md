# NEXTIME — Plan implementacji brakujących funkcji (Fazy 23-36)

## Kontekst

Projekt NEXTIME ma ukończone 22 fazy (710 testów). Porównanie z CuePilot Pro (docs/braki.md) wykazało 16 brakujących funkcji + nowe killer features (OBS/vMix). Plan obejmuje 14 nowych faz w logicznej kolejności — najpierw infrastruktura, potem integracje, potem UI/UX.

Pomijamy (duży scope/niszowe): Cloud sync (#3), ATEM RS-422/GVG (#5), LTC audio (#8), rejestrator video (#9), CueApp natywna (#10), media streaming (#11), auth (#12).

---

## FAZA 23 — Media Infrastructure: ffprobe + auto-detect duration + waveform
**Braki:** #15 (auto-detect duration), fundament pod #1 i #14
**Deps npm:** `fluent-ffmpeg`, `@types/fluent-ffmpeg`
**Zależności:** brak

**Nowe pliki:**
- `electron/media/ffprobe-utils.ts` — probeMediaFile() → {durationMs, durationFrames, fps, codec, hasAudio, hasVideo, width, height}, generateWaveform() → number[], findFfprobePath()
- `electron/media/index.ts` — re-eksport

**Modyfikacje:**
- `electron/db/repositories/media-file.repo.ts` — dodać updateDurationAndWaveform(id, durationFrames, waveformData)
- `electron/preload.ts` — probeMediaFile(), selectMediaFile() (dialog)
- `electron/main.ts` — IPC: nextime:probeMediaFile, nextime:selectMediaFile
- `src/types/electron.d.ts` — typy

**Testy:** ~20 | **Sesje:** 1

---

## FAZA 24 — Prawdziwy Media Playback (audio/video)
**Braki:** #1 (KRYTYCZNY!)
**Deps npm:** brak (HTML5 media API w Chromium)
**Zależności:** Faza 23

**Architektura:** Main process → IPC → Renderer (ukryty `<audio>`/`<video>`) → feedback IPC

**Nowe pliki:**
- `src/components/MediaPlayer/MediaPlayer.tsx` — ukryty komponent, nasłuchuje media:play/stop/volume/seek, odsyła feedback
- `src/components/MediaPlayer/MediaStatusBar.tsx` — pasek w TransportBar: nazwa pliku, progress bar, czas, stop
- `electron/media/media-ipc.ts` — IPC handlery, przekazuje do BrowserWindow.webContents.send()

**Modyfikacje:**
- `electron/senders/media-sender.ts` — PRZEBUDOWA: zamiast console.log → IPC do renderera. Dodać setMainWindow(win). Zachować interfejs
- `electron/preload.ts` — onMediaCommand(callback), sendMediaFeedback(feedback)
- `electron/main.ts` — podłączyć media IPC, przekazać mainWindow
- `src/App.tsx` — zamontować `<MediaPlayer />`

**Testy:** ~25 | **Sesje:** 1-2

---

## FAZA 25 — OBS WebSocket Driver (KILLER FEATURE!)
**Braki:** #17
**Deps npm:** `obs-websocket-js`
**Zależności:** brak

**Nowe pliki:**
- `electron/senders/obs-sender.ts` — ObsSender: connect(), setScene(), setPreviewScene(), triggerTransition(), getSceneList(), getCurrentScene(), getStatus()
- Mapping camera_number → scena OBS (sceneMap w config)
- Auto-reconnect, graceful fallback, nasłuchuje vision-cue-changed

**Modyfikacje:**
- `electron/senders/index.ts` — dodać ObsSender do SenderManager
- `electron/settings-manager.ts` — sekcja obs: ObsSettings

**Testy:** ~20 | **Sesje:** 1

---

## FAZA 26 — vMix HTTP Driver (KILLER FEATURE!)
**Braki:** #18
**Deps npm:** brak (natywny http)
**Zależności:** brak

**Nowe pliki:**
- `electron/senders/vmix-sender.ts` — VmixSender: cut/fade/merge/wipe/zoom/stinger + playMedia/pauseMedia/setVolume
- `electron/senders/vmix-xml-parser.ts` — parsowanie XML stanu vMix

**Modyfikacje:**
- `electron/senders/index.ts` — dodać VmixSender
- `electron/settings-manager.ts` — sekcja vmix: VmixSettings

**Testy:** ~18 | **Sesje:** 1

---

## FAZA 27 — Vision Cue Routing + Transition Types
**Braki:** #19
**Zależności:** Faza 25 (OBS), Faza 26 (vMix)

**Nowe pliki:**
- `electron/senders/vision-router.ts` — VisionRouter: targetSwitcher: 'atem'|'obs'|'vmix'|'none', centralny routing, transition_type + transition_duration_ms

**Modyfikacje:**
- atem-sender.ts, obs-sender.ts, vmix-sender.ts — czytają transition_type/duration z cue data
- index.ts — SenderManager tworzy VisionRouter
- settings-manager.ts — pole targetSwitcher
- TimelineCueDialog.tsx — dropdown transition_type + input duration_ms

**Testy:** ~15 | **Sesje:** 1

---

## FAZA 28 — SettingsPanel: zakładki OBS i vMix
**Braki:** #20-21
**Zależności:** Faza 25, 26

**Nowe pliki:**
- ObsSettingsTab.tsx — IP, port, hasło, sceneMap, Połącz/Rozłącz, lista scen live
- VmixSettingsTab.tsx — IP, port, lista inputów live
- SwitcherSelectField.tsx — dropdown: ATEM/OBS/vMix/None

**Testy:** ~10 | **Sesje:** 1

---

## FAZA 29 — OBS/vMix Feedback → UI
**Braki:** #22
**Zależności:** Faza 28

**Nowe pliki:**
- SwitcherPanel.tsx — zastępuje AtemPanel: PGM/PRV tally, lista inputów z kolorami
- useSwitcherStatus.ts — hook polling co 200ms

**Testy:** ~10 | **Sesje:** 1

---

## FAZA 30 — ATEM Macros, DSK, SuperSource
**Braki:** #6
**Zależności:** Faza 27

**Nowe pliki:**
- `electron/senders/atem-fx-handler.ts` — handler vision_fx: macro → macroRun(), key_on → setDSK()

**Modyfikacje:**
- atem-sender.ts — runMacro(), setDownstreamKey(), setUpstreamKey()
- playback-engine.ts — case 'vision_fx' → emit 'vision-fx-trigger'

**Testy:** ~15 | **Sesje:** 1

---

## FAZA 31 — OSC Custom Schemas
**Braki:** #4
**Zależności:** brak

**Nowe pliki:**
- schema-loader.ts — loader JSON schematów
- assets/osc-schemas/ — disguise.json, casparcg.json, qlab.json, ross.json, generic.json
- OscCueEditor.tsx — dropdown urządzenie → komenda → argumenty

**Testy:** ~12 | **Sesje:** 1

---

## FAZA 32 — Panasonic PTZ HTTP Driver
**Braki:** #7
**Zależności:** brak

**Nowe pliki:**
- panasonic-http-driver.ts — recallPreset, panTilt, stop (AW-HE130, AW-UE150, AW-UE100)

**Testy:** ~12 | **Sesje:** 1

---

## FAZA 33 — Export PDF / Print
**Braki:** #2 (KRYTYCZNY!)
**Deps npm:** `jspdf`, `jspdf-autotable`
**Zależności:** brak

**Nowe pliki:**
- rundown-pdf.ts — tabela cue'ów, nagłówek, grupy, numeracja stron
- timeline-pdf.ts — shotlist z TC i kamerami
- ExportPdfDialog.tsx — wybór kolumn, orientacja, rozmiar

**Testy:** ~15 | **Sesje:** 1

---

## FAZA 34 — Companion/StreamDeck Rozszerzone API [UKOŃCZONA]
**Braki:** #16
**Zależności:** Faza 27

**Nowe pliki:**
- companion-extended.ts — 11 endpointów: goto, state, cues, step_next, take_shot, hold_toggle, step_toggle, atem cut/preview, ptz preset, speed

**Testy:** ~22 | **Sesje:** 1

---

## FAZA 34B — Companion Settings Tab + Auto-detect IP
**Braki:** #16 (GUI)
**Zależności:** Faza 34

Zakładka "Companion" w SettingsPanel — GUI dla konfiguracji integracji z Bitfocus Companion.

**Kontekst:** Bitfocus Companion to osobna aplikacja do StreamDecka. Moduł `companion-module-nextime` to osobne repozytorium npm. NEXTIME musi eksponować informacje o połączeniu (IP, porty, endpointy) żeby użytkownik wiedział co wpisać w Companion.

**Nowe pliki:**
- `electron/network-info.ts` — getNetworkAddresses() via `os.networkInterfaces()`, getCompanionInfo()
- `src/components/SettingsPanel/CompanionTab.tsx` — zakładka UI:
  - Sekcja "Połączenie": auto-detect IP (lista interfejsów), port HTTP (3142), port WS (3141), przyciski "Kopiuj"
  - Sekcja "Status": liczba podłączonych klientów WS (polling lub IPC)
  - Sekcja "Dostępne endpointy": tabela 15 endpointów z metodą, URL i opisem po polsku
  - Sekcja "Instrukcja": krok po kroku jak skonfigurować Companion (po polsku)

**Modyfikacje:**
- `electron/main.ts` — IPC handler `nextime:getNetworkInfo`
- `electron/preload.ts` + `src/types/electron.d.ts` — nowa metoda
- `src/components/SettingsPanel/SettingsPanel.tsx` — dodanie zakładki "Companion" do TABS

**Testy:** ~5 | **Sesje:** 1

---

## FAZA 35 — Team Notes (zespołowe notatki)
**Braki:** #13
**Zależności:** brak

**Nowe pliki:**
- team-note.repo.ts — CRUD
- TeamNotesPanel.tsx — panel boczny z filtrem i badge count
- TeamNoteItem.tsx

**Testy:** ~12 | **Sesje:** 1

---

## FAZA 36 — Waveform Preview w Timeline
**Braki:** #14
**Zależności:** Faza 23, 24

**Nowe pliki:**
- WaveformCanvas.tsx — canvas polyline z playhead overlay
- MediaCueBlock.tsx — blok media cue z waveform

**Testy:** ~8 | **Sesje:** 1

---

## FAZA 37 — Natywny StreamDeck (USB HID)
**Deps npm:** `@elgato-stream-deck/node`, `sharp`
**Zależności:** Faza 34 (Companion API — współdzielone akcje)

Bezpośrednia integracja ze StreamDeckiem przez USB HID — auto-detect modelu, konfigurowalne przyciski, feedback w real-time.
Dwie opcje sterowania StreamDeckiem: 1) natywnie (ta faza), 2) przez Companion (Faza 34).

**Nowe pliki:**
- `electron/streamdeck/streamdeck-manager.ts` — auto-detect, listDevices(), open(), close()
  - Modele: Mini(6), MK.2(15), XL(32), Plus(8+4enc+LCD), Studio(16+2enc), Neo(8+2+LCD), Pedal(3)
  - Eventy: down, up, rotate (encodery), lcdShortPress/lcdSwipe (Plus)
- `electron/streamdeck/streamdeck-button-renderer.ts` — generowanie obrazów przycisków (sharp): tekst + ikona + kolor tła
- `electron/streamdeck/streamdeck-pages.ts` — system stron (pages) z konfigurowalnymi przyciskami per model
- `electron/streamdeck/streamdeck-actions.ts` — mapowanie przycisk → akcja NEXTIME

**Domyślne strony przycisków:**
- **SHOW CONTROL:** Play, Pause, Next, Prev, Goto, Step Next, Take Shot, Hold, Step Mode, FTB
- **SHOTBOX:** CAM 1-8 PGM (czerwony=LIVE) + PVW (zielony=preview), CUT, AUTO, DSK, KEY, MACRO
- **INFO/TIMERY:** Current Cue (tekst dynamiczny), Next Cue, Remaining (countdown biały→żółty→czerwony→migający), Elapsed, Over/Under, Timecode, Show Clock, Cue Count
- **AUDIO/MEDIA:** Media Play/Stop, Vol Up/Down, PTZ Preset 1-4
- **NAWIGACJA:** przełączanie między stronami

**Feedback w real-time:**
- Tally: czerwony=PGM (LIVE), zielony=PVW (preview), szary=nieaktywny
- Countdown: biały (>1min) → żółty (<1min) → czerwony (<30s) → migający (<10s) → pełne czerwone tło (overtime)
- Dynamiczny tekst: nazwa cue, timer MM:SS, timecode HH:MM:SS:FF

**UI — zakładka StreamDeck w SettingsPanel:**
- Auto-detect modelu (nazwa, serial, liczba przycisków)
- Wizualna mapa przycisków (grid odpowiadający modelowi)
- Kliknięcie na przycisk → dropdown z listą funkcji do przypisania
- Strony — dodawanie/usuwanie
- Brightness slider
- Przycisk "Resetuj do domyślnych"

**Testy:** ~20 | **Sesje:** 1-2

---

## TABELA PODSUMOWUJĄCA

| Faza | Nazwa | Braki # | Testy | Nowe deps | Sesje |
|------|-------|---------|-------|-----------|-------|
| 23 | Media Infrastructure (ffprobe) | 15 | ~20 | fluent-ffmpeg | 1 |
| 24 | Prawdziwy Media Playback | 1 | ~25 | — | 1-2 |
| 25 | OBS WebSocket Driver | 17 | ~20 | obs-websocket-js | 1 |
| 26 | vMix HTTP Driver | 18 | ~18 | — | 1 |
| 27 | Vision Routing + Transitions | 19 | ~15 | — | 1 |
| 28 | SettingsPanel OBS/vMix | 20-21 | ~10 | — | 1 |
| 29 | OBS/vMix Feedback → UI | 22 | ~10 | — | 1 |
| 30 | ATEM Macros/DSK | 6 | ~15 | — | 1 |
| 31 | OSC Custom Schemas | 4 | ~12 | — | 1 |
| 32 | Panasonic PTZ HTTP | 7 | ~12 | — | 1 |
| 33 | Export PDF / Print | 2 | ~15 | jspdf | 1 |
| 34 | Companion Extended API | 16 | ~22 | — | 1 |
| 34B | Companion Settings Tab | 16 | ~5 | — | 1 |
| 35 | Team Notes | 13 | ~12 | — | 1 |
| 36 | Waveform Preview | 14 | ~8 | — | 1 |
| 37 | Natywny StreamDeck | — | ~20 | @elgato-stream-deck/node, sharp | 1-2 |
| **RAZEM** | **15 faz** | | **~217** | **5 pakietów** | **15-17** |

**Po ukończeniu:** ~927 testów (710 + 217)

## Weryfikacja (po każdej fazie)
1. `npx tsc --noEmit` — zero błędów
2. `npm rebuild better-sqlite3` — przywróć Node.js bindings
3. `npx vitest run` — wszystkie testy przechodzą (istniejące + nowe)
4. `npm run dev` — test wizualny wg instrukcji
5. Git commit + push
