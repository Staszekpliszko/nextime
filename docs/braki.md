# NEXTIME — Brakujące funkcje vs CuePilot Pro

Porównanie z CuePilot Pro (stan: marzec 2026). Priorytetyzacja wg wpływu na użyteczność.

---

## Krytyczne — brakujące core features

| # | Funkcja | CuePilot | NEXTIME | Opis braku |
|---|---------|----------|---------|------------|
| 1 | Prawdziwy media playback | ✅ Audio+Video na timeline | ❌ Placeholder (loguje do konsoli) | MediaSender nie odtwarza dźwięku ani obrazu. Potrzebny HTML5 `<audio>`/`<video>` lub ffmpeg. Infrastruktura (DB, IPC, UI) gotowa. |
| 2 | Export PDF / Print | ✅ Export rundownu do PDF | ❌ Brak | Brak generowania PDF z rundownu/timeline. Potrzebna biblioteka (jsPDF, Puppeteer, electron-pdf). |
| 3 | Cloud sync | ✅ Projekty synchronizowane w chmurze | ❌ Offline-only | NEXTIME działa tylko lokalnie. Brak backendu chmurowego, brak kont użytkowników. |

---

## Ważne — hardware i integracje

| # | Funkcja | CuePilot | NEXTIME | Opis braku |
|---|---------|----------|---------|------------|
| 4 | OSC custom schemas (JSON) | ✅ Schematy dla disguise, CasparCG, itd. | ❌ Brak | CuePilot pozwala definiować schematy OSC jako pliki JSON z predefiniowanymi komendami per urządzenie. NEXTIME wysyła surowe OSC. |
| 5 | ATEM via RS-422 / GVG protocol | ✅ Serial do switcherów GVG | ❌ Tylko ATEM over IP | Starsze switczery używają RS-422 serial z GVG protocol. NEXTIME obsługuje tylko ATEM IP (atem-connection). |
| 6 | Vision switcher macros/keying | ✅ Makra, key on/off, split screen, efekty | ❌ Tylko PGM/PRV cut/mix | CuePilot ma Vision FX Track z macro recall, keying, complex split screens. NEXTIME obsługuje tylko podstawowe przełączanie PGM/PRV. |
| 7 | Panasonic PTZ HTTP protocol | ✅ Panasonic AW-HE/AW-UE via HTTP | ❌ Brak | CuePilot obsługuje Panasonic HTTP (CGI) obok VISCA. NEXTIME ma VISCA IP/Serial, ONVIF, NDI HTTP — ale nie Panasonic-specific. |
| 8 | LTC audio reader (prawdziwy) | ✅ Hardware AJA, odczyt z karty dźwiękowej | ⚠️ MTC działa, LTC audio nie | MTC (MIDI Timecode) jest w pełni zaimplementowany — otwiera port MIDI Input, parsuje Quarter Frame messages, dekoduje TC (24/25/29.97/30fps). Natomiast LTC audio (odczyt analogowego sygnału timecode z wejścia karty dźwiękowej) to nadal placeholder — wymaga dekodowania biphasowego sygnału audio, potrzebna biblioteka `ltc-reader` npm lub Web Audio API z custom decoderem. Tryb internal i manual działają poprawnie. |

---

## Fajne do dodania — rozszerzenia

| # | Funkcja | CuePilot | NEXTIME | Opis braku |
|---|---------|----------|---------|------------|
| 9 | Wbudowany rejestrator video | ✅ HD SDI In, nagrywanie prób | ❌ Brak | CuePilot nagrywa próby z SDI i dodaje do timeline. Wymaga hardware (AJA/Blackmagic capture). |
| 10 | CueApp natywna (iOS/Android) | ✅ App Store + Google Play | ⚠️ Działa, ale tylko przez przeglądarkę | NEXTIME CueApp jest w pełni funkcjonalna — wyświetla cue'y, live countdown, status, auto-scroll — ale działa jako strona HTTP serwowana przez Express w Electron main process. Operator otwiera URL w przeglądarce na tablecie (Chrome/Safari). Brak natywnej aplikacji w App Store / Google Play. Funkcjonalnie działa tak samo, ale brakuje: push notifications, offline cache, ikony na home screen (można obejść przez PWA/Add to Home Screen). |
| 11 | Media streaming do CueApp | ✅ 720p H.264 w chmurze | ❌ Brak | CuePilot konwertuje video do 720p i streamuje przez cloud do CueApp na tabletach. |
| 12 | Poziomy dostępu (auth) | ✅ View Only / Edit / Admin / Owner | ❌ Brak auth | NEXTIME nie ma systemu logowania ani ról. Każdy podłączony user ma pełny dostęp. |
| 13 | Notes list (zespołowy chat) | ✅ Lista notatek do komunikacji | ⚠️ Są notatki, ale prywatne — nie zespołowe | NEXTIME ma Private Notes — każdy user może dodać notatkę do cue, ale jest ona widoczna tylko dla niego (per cue, per user, zapisywana w tabeli `private_notes` z `user_id`). CuePilot ma Notes List jako wspólny kanał komunikacji zespołu — wszyscy widzą te same notatki, mogą komentować i oznaczać jako rozwiązane. Do implementacji potrzebna nowa tabela `team_notes` z autorem, timestampem i statusem. |
| 14 | Waveform preview | ? | ❌ Pole w DB, brak renderowania | Pole `waveform_data` istnieje w bazie, ale UI nie rysuje waveformu audio. |
| 15 | Auto-detect media duration | ? | ❌ Hardcoded 0 | Brak ffprobe do automatycznego odczytu długości pliku audio/video. |
| 16 | StreamDeck / Companion — dedykowany moduł | ⚠️ Przez OSC/MIDI/GPI (brak dedykowanego modułu) | ⚠️ Podstawowe 4 komendy HTTP (play/pause/next/prev) | CuePilot też nie ma dedykowanego modułu Companion — używa OSC/MIDI/GPI. Ale NEXTIME powinien mieć WIĘCEJ niż CuePilot — własny moduł `companion-module-nextime`. Szczegóły poniżej w sekcji "StreamDeck / Companion — plan". |

---

## Co NEXTIME ma, a CuePilot NIE (lub nie wyraźnie)

| Funkcja | NEXTIME | CuePilot |
|---------|---------|----------|
| Dynamiczne kolumny CRUD z resize | ✅ | ? |
| Richtext editor (TipTap) w komórkach | ✅ | ? |
| Text Variables ($klucz→wartość) z substitution | ✅ | ? |
| Undo/Redo (50 kroków, command pattern) | ✅ | ? |
| PTZ ONVIF Profile S | ✅ | ? |
| PTZ NDI HTTP (PTZOptics CGI) | ✅ | ? |
| VISCA over Serial (RS-422) | ✅ | ? |
| Open-source / self-hosted | ✅ | ❌ (SaaS) |
| Brak subskrypcji / darmowe | ✅ | ❌ (płatne plany) |
| Companion HTTP API | ✅ | ? |
| Electron desktop (Win+Mac) | ✅ | ✅ (Mac+Win) |

---

## Sugerowana kolejność implementacji braków

```
Priorytet 1 (krytyczne):
  → #1  Prawdziwy media playback (audio/video)
  → #2  Export PDF

Priorytet 2 (ważne dla profesjonalistów):
  → #6  Vision switcher macros/keying (ATEM SuperSource, DSK, macros)
  → #4  OSC custom schemas
  → #8  LTC audio reader
  → #7  Panasonic PTZ HTTP

Priorytet 3 (nice to have):
  → #16 StreamDeck/Companion rozszerzone (goto cue, state feedback, moduł)
  → #12 Poziomy dostępu (auth)
  → #13 Notes list (team chat)
  → #14 Waveform preview
  → #15 Auto-detect media duration
  → #3  Cloud sync (duży scope)
  → #10 CueApp natywna
```

---

## StreamDeck / Companion — plan implementacji

CuePilot nie ma dedykowanego modułu Companion — używa OSC/MIDI/GPI do sterowania ze StreamDecka.
NEXTIME powinien mieć WIĘCEJ — własny moduł Companion z pełnym zestawem akcji i feedbacków.

### Krok 1: Rozszerzenie HTTP API (w Electron)

Nowe endpointy do dodania w `electron/http-server.ts`:

| Endpoint | Metoda | Opis |
|----------|--------|------|
| `/api/rundown/:id/goto/:cueId` | GET | Skok do konkretnego cue |
| `/api/rundown/:id/state` | GET | Pełny stan: current cue, is_playing, remaining, elapsed, over/under |
| `/api/rundown/:id/cues` | GET | Lista cue'ów z tytułami i statusami (do dynamic buttons) |
| `/api/rundown/:id/speed/:value` | GET | Zmiana szybkości playback |
| `/api/act/:id/step_next` | GET | Step do następnego vision cue (timeline) |
| `/api/act/:id/take_shot` | GET | Force next vision cue |
| `/api/act/:id/hold_toggle` | GET | Toggle hold mode |
| `/api/act/:id/step_toggle` | GET | Toggle step mode |
| `/api/atem/cut/:input` | GET | ATEM CUT na input |
| `/api/atem/preview/:input` | GET | ATEM PREVIEW |
| `/api/ptz/:camera/preset/:nr` | GET | PTZ recall preset |

### Krok 2: Dedykowany moduł Companion (`companion-module-nextime`)

Osobne repozytorium npm, rejestrowane w bitfocus/companion-bundled-modules.

**Actions (przyciski → komendy):**

| Akcja | Opis |
|-------|------|
| Play | Uruchom playback |
| Pause | Pauzuj |
| Next Cue | Następny cue |
| Previous Cue | Poprzedni cue |
| Goto Cue | Skok do wybranego cue (dropdown z listą) |
| Step Next (Timeline) | Step do następnego vision cue |
| Take Shot | Force next vision cue |
| Hold Toggle | Włącz/wyłącz hold mode |
| Step Toggle | Włącz/wyłącz step mode |
| ATEM CUT | CUT na wybranym inpucie ATEM |
| ATEM Preview | PREVIEW na wybranym inpucie |
| PTZ Recall Preset | Recall preset na kamerze |
| Set Speed | Zmień szybkość playback |

**Feedbacks (wizualny stan przycisków):**

| Feedback | Opis |
|----------|------|
| Is Playing | Zielony gdy playback aktywny, szary gdy pauza |
| Current Cue | Podświetlenie aktywnego cue |
| Cue Status | Kolor wg statusu (ready/standby/done/skipped) |
| Hold Active | Żółty gdy hold mode włączony |
| Step Active | Żółty gdy step mode włączony |
| ATEM Connected | Zielony/czerwony dot |
| Over/Under | Czerwony gdy cue przekroczył czas |

**Variables (dynamiczne wartości na przyciskach):**

| Zmienna | Opis |
|---------|------|
| `$(nextime:current_cue_title)` | Tytuł aktualnego cue |
| `$(nextime:current_cue_number)` | Numer aktualnego cue |
| `$(nextime:remaining)` | Remaining MM:SS |
| `$(nextime:elapsed)` | Elapsed MM:SS |
| `$(nextime:over_under)` | Over/Under ±MM:SS |
| `$(nextime:timecode)` | Aktualny TC HH:MM:SS:FF |
| `$(nextime:is_playing)` | true/false |
| `$(nextime:next_cue_title)` | Tytuł następnego cue |
| `$(nextime:atem_pgm)` | ATEM Program input nr |
| `$(nextime:atem_prv)` | ATEM Preview input nr |
| `$(nextime:cue_count)` | Liczba cue'ów w rundownie |

**Presets (gotowe zestawy przycisków):**

| Preset | Przyciski |
|--------|-----------|
| Transport | Play, Pause, Next, Prev (z feedbackiem is_playing) |
| Timeline | Step Next, Take Shot, Hold, Step Mode |
| ATEM Shotbox | CAM 1-8 (CUT + feedback PGM highlight) |
| Timer Display | Remaining countdown, Over/Under, Clock |
| Cue Info | Current cue title + number, Next cue |

---

## OBS Studio + vMix — integracja vision switcher (NEXTIME przewaga nad CuePilot!)

CuePilot **NIE MA** natywnej integracji z OBS ani vMix — celuje w duży broadcast (ATEM/Ross/GVG po RS-422).
NEXTIME powinien mieć integrację z OBS i vMix jako **software vision switchery** — to ogromna przewaga!

### Zasada działania
Identyczna jak ATEM — NEXTIME **wysyła komendy sterujące**, nie przepuszcza video.
Vision cue na timeline → NEXTIME mówi OBS/vMix "przełącz na scenę/input X".
Video idzie przez OBS/vMix bezpośrednio, NEXTIME go nie dotyka.

### OBS Studio — przez WebSocket API (wbudowany od OBS 28, port 4455)

| Komenda OBS WebSocket | Odpowiednik NEXTIME | Opis |
|----------------------|---------------------|------|
| `SetCurrentProgramScene` | Vision cue → PGM | Przełączenie sceny na program |
| `SetCurrentPreviewScene` | Vision cue → PRV | Ustawienie preview |
| `GetSceneList` | Lista scen → dropdown w UI | Pobranie dostępnych scen |
| `GetCurrentProgramScene` | Feedback → status | Odczyt aktywnej sceny |
| `TriggerMediaInputAction` | Media cue | Play/stop/restart media w OBS |
| `SetInputVolume` | Volume control | Sterowanie głośnością |
| `TriggerStudioModeTransition` | CUT/MIX | Wykonanie przejścia |
| `SetCurrentSceneTransition` | Transition type | Zmiana typu przejścia |

Odbiór eventów: `CurrentProgramSceneChanged`, `CurrentPreviewSceneChanged` → feedback do UI.

Biblioteka: `obs-websocket-js` (npm) lub surowy WebSocket (wbudowany w Node.js).

### vMix — przez HTTP API (port 8088)

| Komenda vMix HTTP | Odpowiednik NEXTIME | Opis |
|-------------------|---------------------|------|
| `GET /api/?Function=Cut&Input=N` | Vision cue → CUT | Natychmiastowe przełączenie |
| `GET /api/?Function=Merge&Input=N` | Vision cue → MIX | Przejście smooth |
| `GET /api/?Function=Preview&Input=N` | Preview | Ustawienie preview |
| `GET /api/?Function=Play&Input=N` | Media cue | Play media |
| `GET /api/?Function=Pause&Input=N` | Media cue | Pause media |
| `GET /api/?Function=SetVolume&Input=N&Value=V` | Volume | Sterowanie głośnością |
| `GET /api/?Function=ScriptStart&Value=name` | Makro | Uruchomienie skryptu |
| `GET /api/` (XML response) | Feedback | Polling stanu co 200ms |

Biblioteka: wbudowany `http` Node.js (brak dodatkowych zależności).

### Plan implementacji

| # | Element | Priorytet |
|---|---------|-----------|
| 17 | OBS WebSocket driver (electron/senders/obs-driver.ts) | WYSOKI |
| 18 | vMix HTTP driver (electron/senders/vmix-driver.ts) | WYSOKI |
| 19 | Vision cue → OBS/vMix routing (oprócz ATEM) | WYSOKI |
| 20 | SettingsPanel — zakładka OBS (IP, port, sceny) | ŚREDNI |
| 21 | SettingsPanel — zakładka vMix (IP, port, inputy) | ŚREDNI |
| 22 | Feedback z OBS/vMix → UI (active scene indicator) | ŚREDNI |
| 23 | Media cue → OBS/vMix media play/stop | NISKI |

### Flow produkcji: vMix + NEXTIME (przykład)

```
W vMix (inputy):
  Input 1 = Kamera 1 (wide shot, SDI/NDI)
  Input 2 = Kamera 2 (close-up)
  Input 3 = Kamera 3 (crane)
  Input 4 = Film reklamowy.mp4
  Input 5 = Jingle otwarcia.mp4
  Input 6 = Grafika fullscreen (PowerPoint/NDI)

W NEXTIME (timeline vision cues):
  00:00:00  [Vision] Input 5 — Jingle otwarcia         (CUT)
  00:00:15  [Vision] Input 1 — Kamera wide             (Fade 1000ms)
  00:00:45  [Vision] Input 2 — Close-up prezenter       (CUT)
  00:01:10  [Vision] Input 4 — Film reklamowy           (Fade 500ms)
  00:01:40  [Vision] Input 1 — Kamera wide powrót       (Wipe 800ms)
  00:02:00  [Vision] Input 6 — Grafika sponsor          (CUT)
  00:02:10  [Vision] Input 1 — Powrót na wide          (Stinger1)

NEXTIME idzie po timeline i w odpowiednim momencie wysyła do vMix:
  → GET /api/?Function=Cut&Input=5              → jingle leci na program
  → GET /api/?Function=Fade&Input=1&Duration=1000  → dissolve na kamerę 1
  → GET /api/?Function=Cut&Input=2              → CUT na close-up
  → itd.

Tak samo z OBS — NEXTIME ustawia transition type, potem przełącza scenę.
```

### Media (reklamy, filmy) — dwa podejścia

**Podejście 1: Media jako input w vMix/scena w OBS (zalecane)**
- Film reklamowy jest wczytany w vMix jako Input / w OBS jako scena
- NEXTIME wysyła `Play&Input=4` → vMix startuje odtwarzanie
- Potem `Cut&Input=4` → reklama leci na program
- Po zakończeniu → NEXTIME przełącza z powrotem na kamerę
- Najlepsza synchronizacja — vMix/OBS kontroluje playback

**Podejście 2: Media z timeline NEXTIME (prostsze produkcje)**
- NEXTIME odtwarza audio/video lokalnie (gdy zrobimy prawdziwy playback)
- Output przez NDI/virtual camera do vMix jako input
- Mniej precyzyjne — podejście 1 lepsze dla profesjonalnych produkcji

### Typy przejść (transition) — wybór w vision cue

W vision cue na timeline NEXTIME dodajemy pola:
- `transition_type` — typ przejścia
- `transition_duration_ms` — czas trwania w ms

**Dostępne przejścia vMix (przez API):**

| Typ | Opis |
|-----|------|
| Cut | Natychmiastowe cięcie (0ms) |
| Fade | Dissolve / przenikanie |
| Merge | Merge z animacją elementów |
| Zoom | Zoom transition |
| Wipe | Przesunięcie kurtyny |
| Slide | Slajd |
| Fly | Przelot 3D |
| CrossZoom | Cross-zoom blur |
| CubeZoom | Cube rotation |
| FadeToBlack | Wygaszenie do czerni |
| Stinger1/2 | Stinger (animacja z plikiem video) |

**Dostępne przejścia OBS (przez WebSocket):**

| Typ | Opis |
|-----|------|
| Cut | Natychmiastowe |
| Fade | Dissolve |
| Stinger | Animacja z plikiem |
| Fade_to_Color | Fade do wybranego koloru |
| Luma_Wipe | Wipe z maską luminancji |
| Slide | Przesunięcie |
| Swipe | Swipe |
| + Custom | Dowolna zainstalowana transition (pluginy OBS) |

**Dostępne przejścia ATEM (już zaimplementowane w NEXTIME):**

| Typ | Opis |
|-----|------|
| Cut | Natychmiastowe |
| Mix | Dissolve z duration |

### Dlaczego to jest przewaga nad CuePilot

- CuePilot wymaga **dedykowanego hardware** (ATEM, Ross, GVG) za tysiące dolarów
- OBS jest **darmowy** — setki tysięcy userów
- vMix jest **tańszy** niż hardware switcher
- NEXTIME z OBS/vMix = profesjonalny rundown manager dla **software-based produkcji**
- Nikt nie oferuje tego poziomu integracji rundown + OBS/vMix z timeline i vision cues

---

*Źródła: cuepilot.com/en/software.html, cuepilot.com/en/pricing.html, cuepilot.com/en/hardware.html, cuepilot.com/en/s6.html, bitfocus.io/companion, obsproject/obs-websocket (GitHub), forums.vmix.com*
