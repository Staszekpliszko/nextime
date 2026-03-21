 Co mamy (Fazy 1-5b) vs Co brakuje do CuePilot

  ZROBIONE

  ┌───────────────────────────────────────────────────────────────┬──────────────┐
  │                        Funkcjonalność                         │    Status    │
  ├───────────────────────────────────────────────────────────────┼──────────────┤
  │ SQLite + 19 tabel + 15 repozytoriów                           │ DONE         │
  ├───────────────────────────────────────────────────────────────┼──────────────┤
  │ Rundown table (lista cue'ów, drag & drop, edycja)             │ DONE         │
  ├───────────────────────────────────────────────────────────────┼──────────────┤
  │ PlaybackEngine (timesnap, play/pause/next, over/under)        │ DONE         │
  ├───────────────────────────────────────────────────────────────┼──────────────┤
  │ WebSocket server + klient (timesnap broadcast, gap detection) │ DONE         │
  ├───────────────────────────────────────────────────────────────┼──────────────┤
  │ TransportBar (play/pause/next/timecode)                       │ DONE         │
  ├───────────────────────────────────────────────────────────────┼──────────────┤
  │ Timeline UI (tracki, ruler, playhead, zoom, auto-scroll)      │ DONE         │
  ├───────────────────────────────────────────────────────────────┼──────────────┤
  │ Timeline CRUD (tworzenie/edycja/usuwanie cue, track, act)     │ DONE (5b)    │
  ├───────────────────────────────────────────────────────────────┼──────────────┤
  │ ShotlistPanel (lista ujęć + dodawanie)                        │ DONE         │
  ├───────────────────────────────────────────────────────────────┼──────────────┤
  │ ActSelector (CRUD aktów)                                      │ DONE         │
  ├───────────────────────────────────────────────────────────────┼──────────────┤
  │ Timecode utils (SMPTE, drop-frame, LTC format)                │ DONE         │
  ├───────────────────────────────────────────────────────────────┼──────────────┤
  │ HTTP API (Companion-compatible endpoints)                     │ DONE (basic) │
  └───────────────────────────────────────────────────────────────┴──────────────┘

  BRAKUJE — kluczowe funkcje CuePilot

  ┌─────┬───────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬───────────┐
  │  #  │        Funkcjonalność         │                                                                      Opis                                                                       │ Priorytet │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F1  │ Vision Switcher Control       │ Wykonywanie cięć kamer na mikserze wizji (ATEM, Grass Valley, Ross, Sony). CuePilot automatycznie przełącza kamery wg timeline.                 │ KRYTYCZNY │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F2  │ CueApp (tablet operator)      │ Mobilna aplikacja web dla operatorów kamer — każdy widzi swój shotlist, countdown do następnego ujęcia, numer kamery, opis ujęcia.              │ KRYTYCZNY │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F3  │ Playback Timeline (LIVE mode) │ Odtwarzanie timeline frame-by-frame w trybie LIVE z wykonywaniem cue'ów w odpowiednim momencie. Teraz mamy scrub, brakuje prawdziwego playback. │ KRYTYCZNY │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F4  │ LTC Timecode Sync             │ Odczyt Linear Timecode z wejścia audio/serialport. Synchronizacja timeline z zewnętrznym LTC (oświetlenie, media serwery, pirotechnika).        │ WYSOKI    │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F5  │ OSC Sender                    │ Wysyłanie komend OSC do zewnętrznych urządzeń (media serwery, oświetlenie, efekty). Track + cue type gotowe, brak implementacji.                │ WYSOKI    │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F6  │ MIDI Sender                   │ Wysyłanie MIDI Note On/Off, Program Change, Control Change na kanałach 1-16.                                                                    │ WYSOKI    │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F7  │ GPI Sender                    │ Wysyłanie pulsów GPI (General Purpose Interface) do urządzeń broadcast.                                                                         │ ŚREDNI    │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F8  │ PTZ Camera Presets            │ Sterowanie kamerami PTZ — recall presetów (pozycja, zoom, focus) zsynchronizowany z timeline.                                                   │ ŚREDNI    │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F9  │ Prompter / Lyrics Output      │ Teleprompter na drugim monitorze — duży tekst, auto-scroll zsynchronizowany z timeline, konfigurowalny font/kolor.                              │ WYSOKI    │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F10 │ Media Playback                │ Odtwarzanie audio/wideo na timeline (reference choreography, dress rehearsal footage, podkład muzyczny).                                        │ ŚREDNI    │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F11 │ CueApp Countdown              │ Wizualny i dźwiękowy countdown dla operatora kamery do następnego ujęcia (3... 2... 1... ON AIR).                                               │ WYSOKI    │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F12 │ Multi-user collaboration      │ Wielu użytkowników edytuje ten sam projekt jednocześnie. Role (owner/admin/editor/viewer). Conflict resolution.                                 │ ŚREDNI    │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F13 │ Control Track (Automation)    │ Specjalny track z cue'ami automatyzacji (auto-load next act, auto-play, macros).                                                                │ ŚREDNI    │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F14 │ Split Screens & Effects       │ Recall złożonych efektów wizji (split screen, keying, transitions) przez macro cue.                                                             │ NISKI     │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F15 │ Vision FX Track               │ Track dla efektów wizji (DVE, keying, transitions) oddzielny od głównego vision.                                                                │ NISKI     │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F16 │ Companion/StreamDeck          │ Pełna integracja Bitfocus Companion — StreamDeck przyciski do fizycznego sterowania.                                                            │ ŚREDNI    │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F17 │ Output Config UI              │ Konfiguracja wyjść (list/single/prompter), share token dla gości, preview.                                                                      │ ŚREDNI    │
  ├─────┼───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ F18 │ Keyboard Shortcuts            │ Pełny zestaw skrótów klawiszowych (spacja=play, N=next, klawisze strzałek, itp.)                                                                │ WYSOKI    │
  └─────┴───────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴───────────┘

  ---
Optymalna kolejność techniczna:

  Faza 6 — Live Playback + Keyboard Shortcuts

  Blokuje wszystko inne. Bez tick loop na frame-level nic nie może triggerować cue'ów. Shortcuts dorzucamy bo bez nich testowanie playback jest męczarnią.

  Faza 7 — Cue Executor + OSC / MIDI / GPI

  Budujemy abstrakcję CueExecutor — "w momencie gdy playhead trafia na cue typu X, wykonaj akcję Y". Implementujemy na trzech prostych protokołach:
  - OSC = UDP socket
  - MIDI = node-midi
  - GPI = serialport

  Te trzy są proste i dają nam sprawdzony pattern, który potem reużyjemy w Vision Switcherze.

  Faza 8 — Vision Switcher (ATEM)

  ATEM ma złożony binarny protokół po UDP. Korzysta z CueExecutor z Fazy 7. Robimy go PO prostych senderach, bo:
  - pattern jest już przetestowany
  - ATEM protocol jest najtrudniejszy ze wszystkich integracji
  - można testować z https://github.com/nrkno/sofie-atem-connection (npm package od NRK)

  Faza 9 — CueApp + Prompter + Output Config

  Wspólny pattern "output view subskrybujący playback state":
  - CueApp = nowy web route, WS subscription, shotlist per operator
  - Prompter = second Electron BrowserWindow, lyrics auto-scroll
  - Output Config UI = zarządzanie wyjściami

  Niezależne od protocol senders — korzystają tylko z Live Playback state.

  Faza 10 — LTC + PTZ + Media Playback

  Dodatkowe integracje hardware/media:
  - LTC reader = external clock source dla PlaybackEngine
  - PTZ = VISCA over IP/serial, recall presetów
  - Media playback = audio/video w Electron

  Faza 11 — Multi-user + Polish

  - Collaborative editing, role-based access
  - Companion/StreamDeck
  - Split screens, templates
  - Control Track automation1

