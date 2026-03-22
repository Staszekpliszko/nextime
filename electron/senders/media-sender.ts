import { EventEmitter } from 'events';
import type { MediaIpcBridge, MediaFeedback } from '../media/media-ipc';

// ── Typy ────────────────────────────────────────────────

export interface MediaSenderConfig {
  /** Czy sender jest aktywny */
  enabled: boolean;
}

interface MediaTriggerCue {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface MediaCueData {
  file_path?: string;
  media_file_id?: string;
  volume?: number;
  loop?: boolean;
  offset_frames?: number;
}

/** Rozszerzony status z informacjami z renderera */
export interface MediaPlaybackStatus {
  playing: boolean;
  currentFile: string | null;
  volume: number;
  /** Aktualny czas odtwarzania w sekundach (z renderera) */
  currentTimeSec: number;
  /** Całkowity czas trwania w sekundach (z renderera) */
  durationSec: number;
  /** Nazwa pliku (krótka, bez ścieżki) */
  fileName: string;
}

// ── MediaSender ─────────────────────────────────────────

const DEFAULT_CONFIG: MediaSenderConfig = {
  enabled: true,
};

/**
 * Obsługuje triggery media w odpowiedzi na 'media-trigger'.
 *
 * Wysyła komendy IPC do renderera (przez MediaIpcBridge),
 * gdzie ukryty <audio>/<video> element odtwarza pliki.
 * Odbiera feedback z renderera i aktualizuje wewnętrzny stan.
 */
export class MediaSender {
  private config: MediaSenderConfig;
  private _playing = false;
  private _currentFile: string | null = null;
  private _volume = 100;
  private _currentTimeSec = 0;
  private _durationSec = 0;
  private _fileName = '';
  private ipcBridge: MediaIpcBridge | null = null;

  /** Callback do przechwytywania triggerów (do testów i przyszłej integracji) */
  onTrigger: ((trigger: { filePath: string; volume: number; loop: boolean; cueId: string }) => void) | null = null;
  /** Callback wywoływany przy stop (do testów) */
  onStop: (() => void) | null = null;

  constructor(config: Partial<MediaSenderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Podłącza MediaIpcBridge — umożliwia wysyłanie komend do renderera */
  setIpcBridge(bridge: MediaIpcBridge): void {
    this.ipcBridge = bridge;

    // Nasłuchuj feedback z renderera
    bridge.on('feedback', (feedback: MediaFeedback) => {
      this.updateFromFeedback(feedback);
    });
  }

  /** Podpina się do engine i nasłuchuje na 'media-trigger' + 'cue-exited' (media stop) */
  attach(engine: EventEmitter): void {
    engine.on('media-trigger', (cue: MediaTriggerCue) => this.handleTrigger(cue));
    // Gdy media cue opuszcza zakres playhead → zatrzymaj playback
    engine.on('cue-exited', (cue: MediaTriggerCue) => {
      if (cue.type === 'media' && this._playing) {
        this.stop();
      }
    });
  }

  /** Obsługuje trigger z engine — wysyła komendę play do renderera */
  handleTrigger(cue: MediaTriggerCue): void {
    if (!this.config.enabled) return;

    const data = cue.data as Partial<MediaCueData>;
    const filePath = data.file_path ?? '';
    const volume = Math.max(0, Math.min(100, data.volume ?? 100));
    const loop = data.loop ?? false;

    // Zaktualizuj stan
    this._playing = true;
    this._currentFile = filePath;
    this._volume = volume;
    this._currentTimeSec = 0;
    this._durationSec = 0;
    this._fileName = filePath.split(/[\\/]/).pop() ?? filePath;

    const trigger = { filePath, volume, loop, cueId: cue.id };

    // Wyślij przez callback (jeśli ustawiony — testy)
    if (this.onTrigger) {
      this.onTrigger(trigger);
    }

    // Wyślij komendę IPC do renderera
    if (this.ipcBridge) {
      this.ipcBridge.sendCommand({
        type: 'play',
        filePath,
        volume,
        loop,
        cueId: cue.id,
      });
    }

    console.log(
      `[MediaSender] PLAY: "${filePath}" vol:${volume}% loop:${loop ? 'ON' : 'OFF'} (cue: ${cue.id})`,
    );
  }

  /** Zatrzymuje bieżący playback */
  stop(): void {
    this._playing = false;
    this._currentFile = null;
    this._currentTimeSec = 0;
    this._durationSec = 0;
    this._fileName = '';

    if (this.onStop) this.onStop();

    // Wyślij komendę stop do renderera
    if (this.ipcBridge) {
      this.ipcBridge.sendCommand({ type: 'stop' });
    }

    console.log('[MediaSender] STOP');
  }

  /** Pauzuje bieżący playback */
  pause(): void {
    if (!this._playing) return;
    this._playing = false;

    if (this.ipcBridge) {
      this.ipcBridge.sendCommand({ type: 'pause' });
    }

    console.log('[MediaSender] PAUSE');
  }

  /** Wznawia playback po pauzie */
  resume(): void {
    if (this._playing) return;
    if (!this._currentFile) return;
    this._playing = true;

    if (this.ipcBridge) {
      this.ipcBridge.sendCommand({ type: 'resume' });
    }

    console.log('[MediaSender] RESUME');
  }

  /** Zmienia głośność bieżącego playback (0-100) */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(100, volume));

    if (this.ipcBridge) {
      this.ipcBridge.sendCommand({ type: 'volume', volume: this._volume });
    }

    console.log(`[MediaSender] Volume: ${this._volume}%`);
  }

  /** Skok do pozycji (w sekundach) */
  seek(timeSec: number): void {
    if (!this._currentFile) return;

    this._currentTimeSec = Math.max(0, timeSec);

    if (this.ipcBridge) {
      this.ipcBridge.sendCommand({ type: 'seek', timeSec: this._currentTimeSec });
    }

    console.log(`[MediaSender] Seek: ${this._currentTimeSec}s`);
  }

  /** Aktualizuje wewnętrzny stan na podstawie feedbacku z renderera */
  updateFromFeedback(feedback: MediaFeedback): void {
    this._playing = feedback.isPlaying;
    this._currentTimeSec = feedback.currentTimeSec;
    this._durationSec = feedback.durationSec;
    this._volume = feedback.volume;
    this._fileName = feedback.fileName;

    // Jeśli media się zakończyło — wyczyść stan
    if (feedback.ended) {
      this._playing = false;
      this._currentFile = null;
      this._currentTimeSec = 0;
      this._fileName = '';
    }
  }

  /** Zwraca aktualny status playback (kompatybilny wstecz + rozszerzony) */
  getStatus(): MediaPlaybackStatus {
    return {
      playing: this._playing,
      currentFile: this._currentFile,
      volume: this._volume,
      currentTimeSec: this._currentTimeSec,
      durationSec: this._durationSec,
      fileName: this._fileName,
    };
  }

  /** Aktualizuje konfigurację w runtime */
  updateConfig(config: Partial<MediaSenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Zwraca aktualną konfigurację */
  getConfig(): MediaSenderConfig {
    return { ...this.config };
  }

  /** Cleanup */
  destroy(): void {
    this.stop();
    this.onTrigger = null;
    this.onStop = null;
    this.ipcBridge = null;
  }
}
