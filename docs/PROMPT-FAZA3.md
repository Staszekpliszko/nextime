# Prompt na Fazę 3 (skopiuj i wklej w nowej sesji)

Przeczytaj CLAUDE.md oraz docs/ (schema.sql, types.ts, ws-protocol.ts, TODO.md).

Kontynuujemy projekt NEXTIME — broadcast rundown manager. Fazy 1 i 2 są ukończone:

**Faza 1 (fundament):**
- 15 repozytoriów SQLite w electron/db/repositories/ (wszystkie 19 tabel schema.sql)
- TypeScript strict, zero błędów, discriminated unions, boolean 0/1 konwersja

**Faza 2 (WS + Playback):**
- `electron/playback-engine.ts` — PlaybackEngine (state machine + EventEmitter)
  - Clock DI, loadRundown, play/pause/next/prev/goto, buildTimesnap, over/under, auto_start
- `electron/ws-server.ts` — RundownWsServer (port 3141)
  - Handshake (client:hello → server:welcome), sesje z seq, broadcast timesnap co 100ms
  - Komendy: play, pause, next, prev, goto, resync + server:ack
  - Ping/pong, server:time co 30s
- `electron/http-server.ts` — Companion HTTP API (4 GET endpointy)
- 153 testów (111 Faza 1 + 42 Faza 2), wszystkie przechodzą

Teraz FAZA 3 — Electron Main Process + React UI + WebSocket klient:

1. `electron/main.ts` — Electron main process:
   - BrowserWindow z Vite dev URL (dev) lub file:// (prod)
   - Inicjalizacja: openDatabase → runMigrations → createRepos → PlaybackEngine → WsServer.start(3141) → HttpServer.listen(3142)
   - IPC handlers dla renderer: getRundowns, loadRundown, getState
   - Preload script z contextBridge

2. `electron/preload.ts` — bezpieczny most main↔renderer:
   - Expose API: nextime.getRundowns(), nextime.loadRundown(id), nextime.getState()
   - Expose WS info: nextime.getWsPort() → renderer wie gdzie się połączyć

3. `src/main.tsx` + `src/App.tsx` — React entry point:
   - Tailwind CSS setup (tailwind.config.js, postcss.config.js, globals.css)
   - App.tsx jako root z RundownTable + TransportBar

4. `src/store/playback.store.ts` — Zustand store:
   - Stan: playback (TimesnapPayload), currentCue, nextCue, clockDrift, connected
   - Akcje: setPlayback, setCurrentCue, setClockDrift, setConnected

5. `src/hooks/useRundownSocket.ts` — WebSocket klient:
   - Połączenie z ws://localhost:3141
   - Handshake: client:hello → server:welcome
   - Dispatch eventów do Zustand store
   - Auto-reconnect z exponential backoff
   - Gap detection (seq) → cmd:resync
   - Clock drift obliczenie z server:time

6. `src/hooks/usePlayback.ts` — obliczenia timing:
   - getRemainingMs() — z korekcją clock drift
   - getElapsedMs()
   - getOverUnderFormatted() — "+01:30" lub "-00:45"
   - useAnimationFrame() do 60fps update

7. `src/components/TransportBar/` — pasek sterowania:
   - Play/Pause/Next/Prev przyciski
   - Countdown display (remaining time)
   - Current cue title + subtitle
   - Over/under indicator (czerwony/zielony)
   - Server time (HH:MM:SS)

8. `src/components/RundownTable/` — tabela cue'ów:
   - Lista cue'ów z kolumnami: #, Title, Subtitle, Duration, Start Type
   - Podświetlenie aktualnego cue
   - Scroll-to-active (auto-scroll do aktywnego cue)
   - Kliknięcie na cue → goto (wysyła cmd:goto przez WS)

Wymagania testowe Fazy 3:
- Unit testy: Zustand store (setPlayback, setCurrentCue, setClockDrift)
- Unit testy: usePlayback hook (getRemainingMs, getElapsedMs z mock clock drift)
- E2E: Playwright — otwarcie okna Electron, widoczność RundownTable i TransportBar

Konwencje:
- TypeScript strict, zero any
- Testy po polsku (opisy), kod po angielsku
- React: funkcyjne komponenty z hooks, Tailwind CSS
- Importy: @/ aliasy (src/), @electron/ aliasy (electron/)

Najpierw pokaż plan jako TODO. Po zatwierdzeniu implementuj punkt po punkcie, uruchamiaj testy po każdym module. Pisz po polsku, później tak jak po poprzednich fazach zapisz w TODO co zrobiłeś i napisz testy oraz prompt do kolejnej fazy!
