import { useState, useEffect } from 'react';
import { usePlayback, formatTime } from '@/hooks/usePlayback';
import { usePlaybackStore } from '@/store/playback.store';
import { framesToTimecode } from '@/utils/timecode';
import { ConnectedClients } from '@/components/ConnectedClients/ConnectedClients';

interface TransportBarProps {
  sendCommand: (event: string, payload?: Record<string, unknown>) => void;
  connected: boolean;
}

export function TransportBar({ sendCommand, connected }: TransportBarProps) {
  const timing = usePlayback();
  const currentCue = usePlaybackStore(s => s.currentCue);
  const nextCue = usePlaybackStore(s => s.nextCue);
  const viewMode = usePlaybackStore(s => s.viewMode);
  const stepMode = usePlaybackStore(s => s.stepMode);
  const holdMode = usePlaybackStore(s => s.holdMode);
  const speed = usePlaybackStore(s => s.speed);
  const currentTcFrames = usePlaybackStore(s => s.currentTcFrames);
  const fps = usePlaybackStore(s => s.fps);
  const activeLyricText = usePlaybackStore(s => s.activeLyricText);
  const activeMarker = usePlaybackStore(s => s.activeMarker);
  const ltcSource = usePlaybackStore(s => s.ltcSource);
  const reconnecting = usePlaybackStore(s => s.reconnecting);
  const atemConnected = usePlaybackStore(s => s.atemConnected);
  const atemProgramInput = usePlaybackStore(s => s.atemProgramInput);

  const handlePlay = () => sendCommand('cmd:play');
  const handlePause = () => sendCommand('cmd:pause');
  const handleNext = () => sendCommand('cmd:next');
  const handlePrev = () => sendCommand('cmd:prev');

  // Kolor countdown: zielony (normalny), żółty (warning <10s), czerwony (overrun)
  const countdownColor = timing.isOverrun
    ? 'text-red-400'
    : timing.isWarning
      ? 'text-yellow-300'
      : 'text-emerald-400';

  // Kolor over/under
  const overUnderColor = timing.overUnderMs >= 0 ? 'text-red-400' : 'text-emerald-400';

  const isTimeline = viewMode === 'timeline';

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-slate-800 border-b border-slate-700 shrink-0">
      {/* Connection indicator + connected clients */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            connected ? 'bg-emerald-400' : reconnecting ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
          }`}
          title={connected ? 'Połączono' : reconnecting ? 'Ponowne łączenie...' : 'Rozłączono'}
        />
        {reconnecting && !connected && (
          <span className="text-[10px] text-amber-400 font-medium">Łączenie...</span>
        )}
        <ConnectedClients />
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={handlePrev}
          className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors"
          title="Poprzedni cue"
        >
          Poprz.
        </button>

        {timing.isPlaying ? (
          <button
            onClick={handlePause}
            className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold transition-colors"
            title="Pauza"
          >
            Pauza
          </button>
        ) : (
          <button
            onClick={handlePlay}
            className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors"
            title="Odtwarzaj"
          >
            Start
          </button>
        )}

        <button
          onClick={handleNext}
          className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors"
          title="Następny cue"
        >
          Nast.
        </button>
      </div>

      {/* Faza 6: Wskaźniki STEP / HOLD / Speed */}
      {isTimeline && (
        <div className="flex items-center gap-1.5">
          {stepMode && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-600 text-white uppercase">
              STEP
            </span>
          )}
          {holdMode && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white uppercase">
              HOLD
            </span>
          )}
          {speed !== 1.0 && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white">
              {speed}x
            </span>
          )}
        </div>
      )}

      {/* Faza 10: LTC source wskaźnik + przycisk przełączania */}
      {isTimeline && (
        <button
          onClick={() => {
            const sources: Array<'internal' | 'ltc' | 'mtc' | 'manual'> = ['internal', 'ltc', 'mtc', 'manual'];
            const current = ltcSource;
            const idx = sources.indexOf(current);
            const next = sources[(idx + 1) % sources.length]!;
            sendCommand('cmd:set_ltc_source', { source: next });
          }}
          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
            ltcSource === 'internal'
              ? 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              : ltcSource === 'manual'
                ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/30'
                : 'bg-purple-600/20 text-purple-400 border border-purple-600/30'
          }`}
          title={`Źródło TC: ${ltcSource.toUpperCase()} — kliknij aby zmienić`}
        >
          TC:{ltcSource === 'internal' ? 'INT' : ltcSource.toUpperCase()}
        </button>
      )}

      {/* Faza 8: ATEM status */}
      {isTimeline && (
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${atemConnected ? 'bg-green-400' : 'bg-slate-600'}`}
            title={atemConnected ? 'ATEM Połączony' : 'ATEM Rozłączony'}
          />
          <span className={`text-[10px] font-bold uppercase ${atemConnected ? 'text-green-400' : 'text-slate-500'}`}>
            ATEM
          </span>
          {atemConnected && atemProgramInput !== null && (
            <span className="text-[10px] text-slate-300 font-mono">
              PGM:{atemProgramInput}
            </span>
          )}
        </div>
      )}

      {/* Marker notification — powiadomienie wizualne */}
      {isTimeline && activeMarker && (
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded animate-pulse"
          style={{ backgroundColor: activeMarker.color + '33', borderLeft: `3px solid ${activeMarker.color}` }}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeMarker.color }} />
          <span className="text-xs font-bold text-white truncate max-w-[120px]">
            {activeMarker.label}
          </span>
        </div>
      )}

      {/* Current cue info + lyric display */}
      <div className="flex-1 min-w-0 px-4">
        <div className="text-sm font-semibold text-slate-200 truncate">
          {currentCue?.title ?? '—'}
        </div>
        <div className="text-xs text-slate-400 truncate">
          {currentCue?.subtitle ?? ''}
        </div>
        {/* Lyric display — aktywny tekst lyrics w trybie timeline */}
        {isTimeline && activeLyricText && (
          <div className="mt-0.5 text-xs text-cyan-300 font-medium truncate" title={activeLyricText}>
            {activeLyricText}
          </div>
        )}
      </div>

      {/* Timecode / Countdown display */}
      {isTimeline ? (
        /* Timeline mode — timecode HH:MM:SS:FF */
        <div className="text-right">
          <div className="text-3xl font-mono font-bold tabular-nums text-purple-400">
            {framesToTimecode(Math.floor(currentTcFrames), fps)}
          </div>
          <div className="text-xs text-slate-500">
            Kod czasu
          </div>
        </div>
      ) : (
        /* Rundown mode — countdown display */
        <>
          <div className="text-right">
            <div className={`text-3xl font-mono font-bold tabular-nums ${countdownColor}`}>
              {timing.isOverrun ? '-' : ''}{timing.remainingFormatted}
            </div>
            <div className="text-xs text-slate-500">
              Do końca
            </div>
          </div>

          {/* Over/Under */}
          <div className="text-right min-w-[80px]">
            <div className={`text-lg font-mono font-semibold tabular-nums ${overUnderColor}`}>
              {timing.overUnderFormatted}
            </div>
            <div className="text-xs text-slate-500">
              Przyśp./Opóź.
            </div>
          </div>

          {/* Duration aktualnego cue */}
          <div className="text-right min-w-[70px]">
            <div className="text-base font-mono text-slate-300 tabular-nums">
              {currentCue ? formatTime(currentCue.duration_ms) : '00:00'}
            </div>
            <div className="text-xs text-slate-500">
              Czas trwania
            </div>
          </div>
        </>
      )}

      {/* Next cue */}
      <div className="text-right min-w-[120px] border-l border-slate-700 pl-4">
        <div className="text-sm text-slate-400 truncate">
          {nextCue?.title ?? '—'}
        </div>
        <div className="text-xs text-slate-500">
          {nextCue ? formatTime(nextCue.duration_ms) : ''}
        </div>
      </div>

      {/* Server time */}
      <div className="text-right min-w-[60px]">
        <div className="text-sm font-mono text-slate-400 tabular-nums">
          <ServerClock />
        </div>
        <div className="text-xs text-slate-500">
          Zegar
        </div>
      </div>
    </div>
  );
}

/** Zegar serwera — aktualizowany co sekundę z korekcją drift */
function ServerClock() {
  const clockDrift = usePlaybackStore(s => s.clockDrift);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const correctedNow = Date.now() + clockDrift;
  const date = new Date(correctedNow);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  return <>{hh}:{mm}:{ss}</>;
}
