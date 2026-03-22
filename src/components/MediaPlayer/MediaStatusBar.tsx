import { useCallback, useRef } from 'react';
import type { MediaPlayerState } from './MediaPlayer';

interface MediaStatusBarProps {
  /** Stan media z MediaPlayer */
  state: MediaPlayerState;
  /** Żądanie seek do pozycji (sekundy) */
  onSeek: (timeSec: number) => void;
  /** Żądanie stop */
  onStop: () => void;
}

/** Formatuje sekundy do MM:SS */
function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Pasek statusu media — wyświetlany w dolnej części UI gdy media jest odtwarzane.
 *
 * Pokazuje: nazwę pliku, progress bar (kliknięcie = seek), czas elapsed/remaining, przycisk stop.
 * Wszystkie teksty po polsku.
 */
export function MediaStatusBar({ state, onSeek, onStop }: MediaStatusBarProps) {
  const progressRef = useRef<HTMLDivElement>(null);

  // Hooki MUSZĄ być przed early return — zasada Reacta
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    if (!bar || state.durationSec <= 0) return;

    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = ratio * state.durationSec;
    onSeek(targetSec);
  }, [state.durationSec, onSeek]);

  // Nie pokazuj paska gdy nic nie jest odtwarzane
  if (!state.fileName && !state.isPlaying) return null;

  const progress = state.durationSec > 0
    ? Math.min(1, state.currentTimeSec / state.durationSec)
    : 0;

  const remaining = state.durationSec > 0
    ? state.durationSec - state.currentTimeSec
    : 0;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 bg-slate-800 border-t border-slate-700"
      data-testid="media-status-bar"
    >
      {/* Ikona media */}
      <span className="text-emerald-400 text-sm shrink-0" title="Odtwarzanie media">
        ♪
      </span>

      {/* Nazwa pliku */}
      <span className="text-xs text-slate-300 truncate max-w-[200px]" title={state.fileName}>
        {state.fileName || '—'}
      </span>

      {/* Elapsed time */}
      <span className="text-xs text-slate-400 font-mono shrink-0">
        {formatTime(state.currentTimeSec)}
      </span>

      {/* Progress bar */}
      <div
        ref={progressRef}
        className="flex-1 h-2 bg-slate-700 rounded-full cursor-pointer relative overflow-hidden"
        onClick={handleProgressClick}
        title="Kliknij aby przejść do pozycji"
        data-testid="media-progress-bar"
      >
        <div
          className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full transition-[width] duration-200"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Remaining time */}
      <span className="text-xs text-slate-400 font-mono shrink-0">
        -{formatTime(remaining)}
      </span>

      {/* Przycisk stop */}
      <button
        onClick={onStop}
        className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-slate-700 rounded transition-colors shrink-0"
        title="Zatrzymaj odtwarzanie"
        data-testid="media-stop-button"
      >
        ■ Stop
      </button>
    </div>
  );
}
