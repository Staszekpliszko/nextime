import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaybackStore } from '@/store/playback.store';

// ── Formatowanie czasu ───────────────────────────────────────

/** Formatuje ms → "MM:SS" lub "HH:MM:SS" (jeśli >= 1h) */
export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

/** Formatuje over/under → "+01:30" (za) lub "-00:45" (przed) */
export function formatOverUnder(ms: number): string {
  const sign = ms >= 0 ? '+' : '-';
  return `${sign}${formatTime(ms)}`;
}

// ── Obliczenia timing ────────────────────────────────────────

/** Oblicza remaining ms z korekcją clock drift */
export function calcRemainingMs(
  deadlineMs: number,
  lastStopMs: number,
  isPlaying: boolean,
  clockDrift: number,
): number {
  if (!isPlaying) {
    // Pauza — remaining = deadline - last_stop
    return deadlineMs - lastStopMs;
  }
  // Playing — remaining = deadline - now (skorygowane o drift)
  const correctedNow = Date.now() + clockDrift;
  return deadlineMs - correctedNow;
}

/** Oblicza elapsed ms z korekcją clock drift */
export function calcElapsedMs(
  kickoffMs: number,
  lastStopMs: number,
  isPlaying: boolean,
  clockDrift: number,
): number {
  if (!isPlaying) {
    return lastStopMs - kickoffMs;
  }
  const correctedNow = Date.now() + clockDrift;
  return correctedNow - kickoffMs;
}

// ── Hook: useAnimationFrame ──────────────────────────────────

/** Wywołuje callback co klatkę animacji (~60fps) — do smooth countdown */
export function useAnimationFrame(callback: () => void, active: boolean) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!active) return;

    let rafId: number;
    const loop = () => {
      callbackRef.current();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafId);
  }, [active]);
}

// ── Hook: usePlayback ────────────────────────────────────────

export interface PlaybackTiming {
  remainingMs: number;
  elapsedMs: number;
  overUnderMs: number;
  remainingFormatted: string;
  elapsedFormatted: string;
  overUnderFormatted: string;
  isPlaying: boolean;
  /** true gdy remaining < 0 (cue przekroczył czas) */
  isOverrun: boolean;
  /** true gdy remaining < 10s (ostatnie sekundy) */
  isWarning: boolean;
}

const DEFAULT_TIMING: PlaybackTiming = {
  remainingMs: 0,
  elapsedMs: 0,
  overUnderMs: 0,
  remainingFormatted: '00:00',
  elapsedFormatted: '00:00',
  overUnderFormatted: '+00:00',
  isPlaying: false,
  isOverrun: false,
  isWarning: false,
};

export function usePlayback(): PlaybackTiming {
  const playback = usePlaybackStore(s => s.playback);
  const clockDrift = usePlaybackStore(s => s.clockDrift);
  const [timing, setTiming] = useState<PlaybackTiming>(DEFAULT_TIMING);

  const update = useCallback(() => {
    if (!playback) {
      setTiming(DEFAULT_TIMING);
      return;
    }

    // Timeline mode — nie liczymy remaining/elapsed w ms
    if (playback.tc_mode !== 'rundown_ms') {
      setTiming({
        ...DEFAULT_TIMING,
        isPlaying: playback.tc.is_playing,
      });
      return;
    }

    const { tc } = playback;
    const remaining = calcRemainingMs(tc.deadline_ms, tc.last_stop_ms, tc.is_playing, clockDrift);
    const elapsed = calcElapsedMs(tc.kickoff_ms, tc.last_stop_ms, tc.is_playing, clockDrift);
    const durationMs = tc.deadline_ms - tc.kickoff_ms;
    const overUnder = elapsed - durationMs;

    setTiming({
      remainingMs: remaining,
      elapsedMs: elapsed,
      overUnderMs: overUnder,
      remainingFormatted: formatTime(remaining),
      elapsedFormatted: formatTime(elapsed),
      overUnderFormatted: formatOverUnder(overUnder),
      isPlaying: tc.is_playing,
      isOverrun: remaining < 0,
      isWarning: remaining > 0 && remaining < 10_000,
    });
  }, [playback, clockDrift]);

  // Aktualizuj timing co klatkę gdy playing, raz przy pauzie
  const isPlaying = playback?.tc.is_playing ?? false;
  useAnimationFrame(update, isPlaying);

  // Aktualizuj przy zmianie stanu (pauza, nowy timesnap)
  useEffect(() => {
    update();
  }, [update]);

  return timing;
}

// ── Hook: useTimelinePlayhead (Faza 6) ──────────────────────

/** Interpolacja playhead po stronie klienta — płynny ruch między timesnapami */
export function useTimelinePlayhead(): number {
  const currentTcFrames = usePlaybackStore(s => s.currentTcFrames);
  const fps = usePlaybackStore(s => s.fps);
  const speed = usePlaybackStore(s => s.speed);
  const isPlaying = usePlaybackStore(s => s.playback)?.tc.is_playing ?? false;
  const lastAt = usePlaybackStore(s => s.lastTimesnapAt);
  const lastFrames = usePlaybackStore(s => s.lastTimesnapFrames);
  const [interpolated, setInterpolated] = useState(currentTcFrames);

  const update = useCallback(() => {
    if (!isPlaying || !lastAt) { setInterpolated(currentTcFrames); return; }
    const elapsed = (Date.now() - lastAt) / 1000;
    const realFps = fps === 29 ? 29.97 : fps === 59 ? 59.94 : fps;
    setInterpolated(lastFrames + elapsed * realFps * speed);
  }, [isPlaying, currentTcFrames, fps, speed, lastAt, lastFrames]);

  useAnimationFrame(update, isPlaying);
  useEffect(() => { if (!isPlaying) setInterpolated(currentTcFrames); }, [currentTcFrames, isPlaying]);

  return interpolated;
}
