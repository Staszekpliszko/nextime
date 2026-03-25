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
| 41 | LTC Audio Reader (prawdziwy) | 8 | ~25 | — (Web Audio API) | 2-3 |
| **RAZEM** | **16 faz** | | **~242** | **5 pakietów** | **17-20** |

**Po ukończeniu:** ~952 testów (710 + 242)

---

## FAZA 39 — Timeline Bugfixes & UX Improvements [UKOŃCZONA]
**Zależności:** brak

**Bugfixy:**
- 39-A: Fix play() w stepMode — auto-wyłącza stepMode zamiast blokować (BUG KRYTYCZNY)
- 39-B: StreamDeck prev/next w trybie timeline — stepToNextCue/stepToPrevCue + cmd:step_prev WS

**UX Improvements:**
- 39-C: Skróty klawiszowe +/- dla zoom timeline
- 39-D: Snap/magnet cue'ów do krawędzi sąsiadów (snap-utils.ts, threshold=5 klatek)
- 39-E: Auto-fit zoom + przycisk "Dopasuj" [⊞] + zoomToFit()
- 39-F: Domyślna duration 5s dla nowego vision cue
- 39-G: Logi diagnostyczne feedExternalTc()

**Testy:** 15 nowych | **Sesje:** 1

---

## FAZA 40 — Media Full-Duration on Timeline + Playhead TC Input + Left-Trim [UKOŃCZONA]
**Zależności:** Faza 39

**Kontekst:** Media cue'y na timeline nie rozciągają się na pełną długość pliku — brakuje auto-duration.
Playhead (pionowa linia czasu) nie ma możliwości ręcznego wpisania pozycji TC.
Resize działa tylko z prawej strony — brakuje trim z lewej (skracanie początku klipu).

**Zadania:**

### 40-A: Auto-duration media cue z vMix (WYSOKI)
- VmixInput.duration (ms) już jest w vmix-xml-parser.ts
- W TimelineCueDialog.tsx: gdy użytkownik wybiera input vMix w vision cue:
  - Pobierz duration z vmixInputs[].duration
  - Przelicz ms → frames: durationFrames = Math.round(durationMs / 1000 * fps)
  - Ustaw tcOutStr = tcIn + durationFrames
- Analogicznie dla media cue (jeśli plik z vMix ma duration)

### 40-B: Auto-duration media cue z ffprobe (WYSOKI)
- TimelineCueDialog.tsx: Faza 36 częściowo to robi (autoSetTcOutFromDuration)
  ale nie odpala się zawsze — upewnić się że:
  - Przy wyborze pliku z biblioteki → auto tc_out
  - Przy wyborze pliku z dysku (browse) → auto tc_out
  - Przy tworzeniu media cue przez double-click na track → auto tc_out po probe
- Upewnić się że tc_out trafia do bazy i store

### 40-C: Left-trim (resize z lewej strony) — ŚREDNI
- TimelineCueBlock.tsx: dodać uchwyt resize na lewej krawędzi (pierwsze 6px)
  - Drag lewej krawędzi → zmienia tc_in_frames
  - Dla media cue: offset_frames += (newTcIn - oldTcIn) — żeby audio/video startowało od właściwego momentu
  - Minimalna szerokość: tc_out - tc_in >= 1
- Callback onResizeLeft w TimelineTrack → Timeline → IPC update
- Snap z lewej strony (snap-utils)

### 40-D: Playhead — ręczne wpisywanie TC (ŚREDNI)
- W Timeline.tsx toolbar: klik na wyświetlacz TC → zamienia się na input (inline edit)
- Wpisanie timecode (HH:MM:SS:FF) + Enter → sendCommand('cmd:scrub', { frames })
- Escape → anuluj edycję
- Walidacja formatu timecode

### 40-E: Testy
- Test auto-duration z vMix (mock vmixInputs z duration)
- Test left-trim (zmiana tc_in + offset_frames)
- Test snap z lewej strony
- Test inline TC input (unit)

**Testy:** ~15 | **Sesje:** 1-2

---

## FAZA 41 — LTC Audio Reader (prawdziwy dekoder timecodu z karty dźwiękowej)
**Braki:** #8 (LTC audio reader)
**Zależności:** Faza 22 (LtcReader placeholder + MTC parser już istnieją)
**Deps npm:** brak nowych (Web Audio API wbudowane w Chromium/Electron)

### Kontekst i cel

CuePilot Pro ma moduł **Timecode** w sekcji System, który synchronizuje wszystkie departamenty produkcji live:
- Oświetlenie (lighting console: GrandMA, Hog, ETC)
- Content/media serwery (disguise, Resolume, CasparCG)
- Kamery i vision mixer

**LTC (Linear Timecode)** to analogowy sygnał audio zakodowany wg standardu SMPTE 12M,
przesyłany kablem XLR/TRS do wejścia karty dźwiękowej komputera.
Jest to **standard branżowy** w produkcjach live — generatory LTC są w każdym reżyserce.

**Stan obecny w NEXTIME:**
- `electron/senders/ltc-reader.ts` — klasa `LtcReader` z 4 trybami: `internal`, `ltc`, `mtc`, `manual`
- Tryb **MTC** (MIDI Timecode) — **w pełni działa** (Quarter Frame + Full Frame, @julusian/midi)
- Tryb **LTC audio** — **placeholder** (linia 241: `console.log('...placeholder...')`)
- Tryb **internal** i **manual** — działają
- Settings panel (`SettingsPanel.tsx` linia 524-602) — dropdown źródła, lista portów MTC
- PlaybackEngine — `feedExternalTc(frames)` + `setLtcSource()` — gotowe
- Testy: `tests/unit/ltc-reader.test.ts`, `tests/unit/mtc-parser.test.ts`, `tests/unit/engine-ltc.test.ts`

**Cel Fazy 41:** Zamienić placeholder LTC audio na prawdziwy dekoder sygnału biphasowego
z wejścia karty dźwiękowej, używając Web Audio API w renderer process Electrona.

### Architektura LTC audio dekodera

```
Karta dźwiękowa (XLR/TRS)
    ↓
Web Audio API (AudioContext w renderer process)
    ↓ getUserMedia() → MediaStream → AudioWorkletNode
    ↓
LtcAudioDecoder (AudioWorkletProcessor)
    ↓ dekodowanie biphasowego sygnału SMPTE 12M
    ↓ port.postMessage({ hours, minutes, seconds, frames, fps })
    ↓
LtcAudioBridge (renderer) — odbiera MessagePort
    ↓ window.nextime.feedLtcAudio(frames) → IPC
    ↓
LtcReader (main process) — feedTc(frames)
    ↓ emit('tc-received', frames)
    ↓
PlaybackEngine — feedExternalTc(frames)
    → timeline podąża za zewnętrznym TC
```

### Jak działa sygnał LTC (SMPTE 12M)

LTC to sygnał audio z Manchester biphase encoding:
- Bit "0" = jedno przejście przez zero w okresie bitu
- Bit "1" = dwa przejścia przez zero w okresie bitu
- Każda klatka TC = 80 bitów:
  - Bity 0-3: frames units (BCD)
  - Bity 4-7: frames tens (BCD, 2 bity) + drop-frame flag + color frame flag
  - Bity 8-11: seconds units
  - Bity 12-15: seconds tens (BCD, 3 bity) + parity bit
  - Bity 16-19: minutes units
  - Bity 20-23: minutes tens (BCD, 3 bity) + binary group flag
  - Bity 24-27: hours units
  - Bity 28-31: hours tens (BCD, 2 bity) + binary group flag + reserved
  - Bity 32-63: user bits (8×4 bity — opcjonalne dane użytkownika)
  - Bity 64-79: sync word (0011 1111 1111 1101) — rozpoznanie końca klatki
- Częstotliwość zależy od fps: 2400 Hz (30fps) do 2000 Hz (24fps)
- Sygnał może biec do przodu lub do tyłu (reverse playback!)

### Zadania (w kolejności priorytetów)

#### 41-A: AudioWorklet — dekoder biphasowy (KRYTYCZNY)
**Nowy plik:** `src/audio/ltc-decoder.worklet.ts`

AudioWorkletProcessor który:
1. Odbiera próbki audio z `process()` (Float32Array, 128 samples per call)
2. Wykrywa przejścia przez zero (zero-crossings) w sygnale
3. Mierzy odstępy między przejściami → rozróżnia bit "0" (długi) od bit "1" (krótki)
4. Składa bity w 80-bitowe klatki LTC
5. Szuka sync word (0011 1111 1111 1101) na końcu klatki → potwierdza alignment
6. Dekoduje BCD → HH:MM:SS:FF + fps (24/25/29.97/30)
7. Wysyła zdekodowany TC przez `port.postMessage()`

**Szczegóły algorytmu:**
- Adaptacyjny próg zero-crossing (nie hardcoded, bo poziom sygnału się zmienia)
- Hysteresis żeby uniknąć fałszywych zero-crossings na szumie
- Bit clock recovery: mierz średni okres bitu, aktualizuj running average
- Obsługa reverse playback: sync word czytany od tyłu = (1011 1111 1111 1100)
- Obsługa drop-frame flag (bit 10) — oznacza 29.97fps drop-frame
- Error detection: jeśli sync word nie pasuje, odrzuć klatkę i szukaj dalej
- Sample rate awareness: `sampleRate` z `AudioWorkletGlobalScope` (zazwyczaj 44100 lub 48000)

**Parametry do tuningu:**
- `HYSTERESIS_THRESHOLD` = 0.02 (minimalna amplituda do detekcji zero-crossing)
- `BIT_PERIOD_TOLERANCE` = 0.3 (30% tolerancja na odchylenie od oczekiwanego okresu bitu)
- `MIN_VALID_FRAMES` = 3 (ile kolejnych poprawnych klatek zanim uznamy sync za stabilny)

#### 41-B: LtcAudioBridge — most renderer ↔ main process (WYSOKI)
**Nowy plik:** `src/audio/ltc-audio-bridge.ts`

Klasa w renderer process:
1. `start(deviceId?: string)` — uruchamia AudioContext + getUserMedia() + AudioWorkletNode
2. `stop()` — zatrzymuje strumień i AudioContext
3. `listAudioInputs()` → lista urządzeń audio (navigator.mediaDevices.enumerateDevices)
4. `onTimecode(callback)` — rejestruje callback na zdekodowany TC
5. Komunikacja z main process: `window.nextime.feedLtcAudio(frames)` → IPC → `LtcReader.feedTc(frames)`

**Szczegóły:**
- AudioContext z `latencyHint: 'interactive'` (minimalne opóźnienie)
- `getUserMedia({ audio: { deviceId, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`
  — WAŻNE: wyłącz preprocessing audio! LTC to sygnał, nie głos.
- Constraint `sampleRate: 48000` (preferuj 48kHz dla lepszej rozdzielczości)
- AudioWorkletNode podłączony do source (nie do destination — nie chcemy słyszeć LTC w głośnikach)
- Debounce: nie wysyłaj feedTc częściej niż co 1 klatkę TC (unikaj duplikatów)

#### 41-C: IPC — nowe handlery w main process (WYSOKI)
**Modyfikacje:**
- `electron/main.ts` — nowe IPC handlery:
  - `nextime:feedLtcAudio` — przyjmuje frames z renderer, przekazuje do LtcReader.feedTc()
  - `nextime:listAudioInputs` — proxy do renderer (enumDevices musi być w renderer)
  - `nextime:startLtcAudio` — informuje renderer żeby uruchomił AudioWorklet
  - `nextime:stopLtcAudio` — informuje renderer żeby zatrzymał AudioWorklet
- `electron/preload.ts` — nowe metody:
  - `feedLtcAudio(frames: number): void`
  - `onStartLtcAudio(callback: (deviceId?: string) => void): void`
  - `onStopLtcAudio(callback: () => void): void`
- `src/types/electron.d.ts` — typy dla nowych metod

#### 41-D: LtcReader — podpięcie trybu 'ltc' (WYSOKI)
**Modyfikacja:** `electron/senders/ltc-reader.ts`
- Zamienić placeholder w `connect()` (linia 241-245):
  - Zamiast `console.log('placeholder')` → wyślij IPC do renderer żeby uruchomił AudioWorklet
  - `this._connected = true` dopiero po potwierdzeniu z renderera
- Nowa metoda `connectLtcAudio(deviceId?: string)` — analogiczna do `connectMtc(portIndex)`
- Nowa metoda `disconnectLtcAudio()` — analogiczna do `disconnectMtc()`
- `feedTc()` jest już gotowe — AudioBridge będzie je wywoływał przez IPC

#### 41-E: Settings Panel — rozszerzenie zakładki LTC (ŚREDNI)
**Modyfikacja:** `src/components/SettingsPanel/SettingsPanel.tsx`
- Gdy `source === 'ltc'` — pokaż dodatkową sekcję (analogicznie do MTC):
  - **Dropdown "Wejście audio"** — lista kart dźwiękowych z `navigator.mediaDevices.enumerateDevices()`
    (filtruj `kind === 'audioinput'`)
  - **Przycisk "Połącz" / "Rozłącz"** — uruchamia/zatrzymuje AudioWorklet
  - **Status sygnału:**
    - Wskaźnik poziomu audio (peak meter) — wizualne potwierdzenie że sygnał dociera
    - Aktualny TC w formacie HH:MM:SS:FF (zielony font-mono, odświeżany co 500ms)
    - FPS wykryty z sygnału LTC (24/25/29.97/30)
    - Jakość sygnału: "Stabilny" / "Słaby" / "Brak" (na podstawie error rate)
  - **Tekst pomocniczy:**
    - "Podłącz sygnał LTC do wejścia karty dźwiękowej (XLR→TRS/USB)"
    - "Wyłącz preprocessing audio (echo cancellation, noise suppression)"
    - "Optymalny poziom sygnału: -20 dBFS do -6 dBFS"
  - Odśwież status co 500ms (tak jak MTC)
  - Wskaźnik sygnału (peak meter) — canvas 100×20px, rysuj poziom RMS/peak
  - Ikona kabla XLR / sygnału audio obok nazwy źródła

#### 41-F: Komponent AudioLevelMeter (NISKI)
**Nowy plik:** `src/components/SettingsPanel/AudioLevelMeter.tsx`
- Canvas wyświetlający poziom audio z wejścia karty (do debugowania LTC)
- AnalyserNode z AudioContext → getByteFrequencyData → rysuj bar
- Kolory: zielony (-inf do -12dB), żółty (-12 do -6dB), czerwony (>-6dB)
- Rozmiar: 200×24px, odświeżanie 30fps (requestAnimationFrame)

#### 41-G: Obsługa edge cases (NISKI)
- **Brak sygnału LTC** — po 2s bez nowego TC: emit 'tc-lost', UI: status "Brak sygnału"
- **Słaby sygnał** — error rate > 10%: UI: status "Słaby sygnał"
- **Zmiana fps w trakcie** — wykryj zmianę fps i zaloguj warning (nie zmieniaj fps projektu automatycznie)
- **Reverse playback** — wykryj sync word od tyłu, obroć bity, dekoduj normalnie
- **Uprawnienia mikrofonu** — obsłuż odmowę: "Aplikacja wymaga dostępu do karty dźwiękowej"
- **Wybudzenie z trybu uśpienia** — AudioContext.state === 'suspended' → resume()
- **Zmiana urządzenia audio w trakcie** — nasłuchuj `navigator.mediaDevices.ondevicechange`

#### 41-H: Testy
**Nowe pliki testów:**
- `tests/unit/ltc-decoder.test.ts`:
  - Generuj syntetyczny sygnał LTC (Manchester encoding) w Float32Array
  - Testuj dekodowanie: 25fps, 30fps, 29.97 drop-frame, 24fps
  - Testuj sync word detection (forward + reverse)
  - Testuj BCD decoding → HH:MM:SS:FF
  - Testuj error rejection (uszkodzony sync word → odrzucenie klatki)
  - Testuj adaptacyjny bit clock recovery
  - Testuj hysteresis (szum poniżej progu → brak fałszywych zero-crossings)
- `tests/unit/ltc-audio-bridge.test.ts`:
  - Mock AudioContext + getUserMedia
  - Testuj start/stop lifecycle
  - Testuj feedLtcAudio IPC call
  - Testuj debounce (nie wysyłaj duplikatów)
- Rozszerz `tests/unit/ltc-reader.test.ts`:
  - Testuj connectLtcAudio() / disconnectLtcAudio()
  - Testuj feedTc() w trybie 'ltc'
  - Testuj 'tc-lost' po timeout 2s

### Porównanie z CuePilot Pro po Fazie 41

| Funkcja | CuePilot | NEXTIME (po Fazie 41) |
|---|---|---|
| LTC audio z karty dźwiękowej | ✅ (hardware AJA) | ✅ (Web Audio API — dowolna karta) |
| MTC (MIDI Timecode) | ✅ | ✅ (już działa od Fazy 22) |
| Internal clock | ✅ | ✅ |
| Manual TC | ✅ | ✅ |
| Wybór urządzenia audio | ✅ | ✅ (dropdown z enumerateDevices) |
| Status / peak meter | ✅ | ✅ (AudioLevelMeter) |
| Reverse playback detection | ? | ✅ |
| Drop-frame 29.97 | ✅ | ✅ |
| Hardware wymagany | AJA (drogi) | Dowolna karta USB/wbudowana (tańsze!) |

**Przewaga NEXTIME:** Nie wymaga drogiego hardware AJA — dowolna karta dźwiękowa USB
z wejściem liniowym (np. Focusrite Scarlett, Behringer UMC, wbudowane wejście mic z adapterem XLR→TRS).

**Testy:** ~25 nowych | **Sesje:** 2-3

---

## Weryfikacja (po każdej fazie)
1. `npx tsc --noEmit` — zero błędów
2. `npm rebuild better-sqlite3` — przywróć Node.js bindings
3. `npx vitest run` — wszystkie testy przechodzą (istniejące + nowe)
4. `npm run dev` — test wizualny wg instrukcji
5. Git commit + push
