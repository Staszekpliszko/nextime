import { useEffect, useRef, useCallback } from 'react';
import type { MediaCommand, MediaFeedback } from '../../../electron/media/media-ipc';

// ── Typy props ─────────────────────────────────────────────────

export interface MediaPlayerState {
  isPlaying: boolean;
  fileName: string;
  currentTimeSec: number;
  durationSec: number;
  volume: number;
}

interface MediaPlayerProps {
  /** Callback z aktualnym stanem media — wywoływany co ~250ms */
  onStateChange: (state: MediaPlayerState) => void;
  /** Callback przy zakończeniu odtwarzania */
  onEnded?: () => void;
  /** Callback żądania seek z UI */
  onSeekRequest?: (timeSec: number) => void;
  /** Callback żądania stop z UI */
  onStopRequest?: () => void;
}

/**
 * Ukryty komponent media player.
 *
 * Nasłuchuje na komendy IPC z main process (play/stop/pause/volume/seek)
 * i odtwarza pliki audio/video przez HTML5 <audio>/<video> element.
 * Co ~250ms odsyła feedback do main process.
 */
export function MediaPlayer({ onStateChange, onEnded, onSeekRequest, onStopRequest }: MediaPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentFileNameRef = useRef('');
  const mediaTypeRef = useRef<'audio' | 'video'>('audio');

  // Wyślij feedback do main process
  const sendFeedback = useCallback((ended = false) => {
    const el = mediaTypeRef.current === 'video' ? videoRef.current : audioRef.current;
    if (!el) return;

    const feedback: MediaFeedback = {
      fileName: currentFileNameRef.current,
      currentTimeSec: el.currentTime || 0,
      durationSec: el.duration || 0,
      isPlaying: !el.paused && !el.ended,
      ended,
      volume: Math.round(el.volume * 100),
    };

    // Odsyłamy do main process
    if (window.nextime?.sendMediaFeedback) {
      window.nextime.sendMediaFeedback(feedback);
    }

    // Aktualizuj stan w React (do MediaStatusBar)
    onStateChange({
      isPlaying: feedback.isPlaying,
      fileName: feedback.fileName,
      currentTimeSec: feedback.currentTimeSec,
      durationSec: isNaN(feedback.durationSec) ? 0 : feedback.durationSec,
      volume: feedback.volume,
    });
  }, [onStateChange]);

  // Rozpocznij feedback timer
  const startFeedbackLoop = useCallback(() => {
    if (feedbackTimerRef.current) clearInterval(feedbackTimerRef.current);
    feedbackTimerRef.current = setInterval(() => sendFeedback(), 250);
  }, [sendFeedback]);

  // Zatrzymaj feedback timer
  const stopFeedbackLoop = useCallback(() => {
    if (feedbackTimerRef.current) {
      clearInterval(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, []);

  // Pobierz aktywny element media
  const getMediaElement = useCallback((): HTMLAudioElement | HTMLVideoElement | null => {
    return mediaTypeRef.current === 'video' ? videoRef.current : audioRef.current;
  }, []);

  // Wykryj typ media na podstawie rozszerzenia
  const detectType = useCallback((filePath: string): 'audio' | 'video' => {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];
    return audioExts.includes(ext) ? 'audio' : 'video';
  }, []);

  // Obsługa komend z main process
  const handleCommand = useCallback((cmd: MediaCommand) => {
    switch (cmd.type) {
      case 'play': {
        const type = detectType(cmd.filePath);
        mediaTypeRef.current = type;

        // Zatrzymaj oba elementy
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; }

        const el = type === 'video' ? videoRef.current : audioRef.current;
        if (!el) break;

        // Konwertuj ścieżkę do file:// URL
        const fileUrl = cmd.filePath.startsWith('file://')
          ? cmd.filePath
          : `file:///${cmd.filePath.replace(/\\/g, '/')}`;

        currentFileNameRef.current = cmd.filePath.split(/[\\/]/).pop() ?? cmd.filePath;
        el.src = fileUrl;
        el.volume = Math.max(0, Math.min(1, cmd.volume / 100));
        el.loop = cmd.loop;
        el.currentTime = 0;

        el.play().catch(err => {
          console.error('[MediaPlayer] Błąd odtwarzania:', err);
        });

        startFeedbackLoop();
        break;
      }

      case 'stop': {
        const el = getMediaElement();
        if (el) {
          el.pause();
          el.src = '';
          el.currentTime = 0;
        }
        currentFileNameRef.current = '';
        stopFeedbackLoop();
        sendFeedback(true);
        onStateChange({ isPlaying: false, fileName: '', currentTimeSec: 0, durationSec: 0, volume: 100 });
        break;
      }

      case 'pause': {
        const el = getMediaElement();
        if (el) el.pause();
        sendFeedback();
        break;
      }

      case 'resume': {
        const el = getMediaElement();
        if (el && el.src) {
          el.play().catch(err => {
            console.error('[MediaPlayer] Błąd wznowienia:', err);
          });
        }
        break;
      }

      case 'volume': {
        const el = getMediaElement();
        if (el) el.volume = Math.max(0, Math.min(1, cmd.volume / 100));
        break;
      }

      case 'seek': {
        const el = getMediaElement();
        if (el && isFinite(cmd.timeSec)) {
          el.currentTime = Math.max(0, cmd.timeSec);
        }
        break;
      }
    }
  }, [detectType, getMediaElement, onStateChange, sendFeedback, startFeedbackLoop, stopFeedbackLoop]);

  // Rejestruj listener IPC + cleanup
  useEffect(() => {
    if (window.nextime?.onMediaCommand) {
      window.nextime.onMediaCommand(handleCommand);
    }

    return () => {
      stopFeedbackLoop();
      if (window.nextime?.removeMediaCommandListener) {
        window.nextime.removeMediaCommandListener();
      }
    };
  }, [handleCommand, stopFeedbackLoop]);

  // Obsługa zdarzenia ended
  const handleEnded = useCallback(() => {
    stopFeedbackLoop();
    sendFeedback(true);
    onStateChange({ isPlaying: false, fileName: currentFileNameRef.current, currentTimeSec: 0, durationSec: 0, volume: 100 });
    onEnded?.();
  }, [sendFeedback, stopFeedbackLoop, onStateChange, onEnded]);

  // Ukryte elementy <audio> i <video> — nie renderują UI
  return (
    <>
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        style={{ display: 'none' }}
        data-testid="media-player-audio"
      />
      <video
        ref={videoRef}
        onEnded={handleEnded}
        style={{ display: 'none' }}
        data-testid="media-player-video"
      />
    </>
  );
}
