import { EventEmitter } from 'events';

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

// ── MediaSender ─────────────────────────────────────────

const DEFAULT_CONFIG: MediaSenderConfig = {
  enabled: true,
};

/**
 * Obsługuje triggery media w odpowiedzi na 'media-trigger'.
 *
 * UWAGA: To jest placeholder — pełna implementacja playback audio/video
 * wymaga integracji z ffmpeg, Electron <video>, lub zewnętrznym playerem.
 * Na razie loguje informacje do konsoli i wywołuje callback.
 */
export class MediaSender {
  private config: MediaSenderConfig;
  private _playing = false;
  private _currentFile: string | null = null;
  private _volume = 100;
  /** Callback do przechwytywania triggerów (do testów i przyszłej integracji) */
  onTrigger: ((trigger: { filePath: string; volume: number; loop: boolean; cueId: string }) => void) | null = null;
  /** Callback wywoływany przy stop (do testów) */
  onStop: (() => void) | null = null;

  constructor(config: Partial<MediaSenderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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

  /** Obsługuje trigger z engine */
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

    const trigger = { filePath, volume, loop, cueId: cue.id };

    // Wyślij przez callback (jeśli ustawiony) lub loguj
    if (this.onTrigger) {
      this.onTrigger(trigger);
    }

    console.log(
      `[MediaSender] PLAY: "${filePath}" vol:${volume}% loop:${loop ? 'ON' : 'OFF'} (cue: ${cue.id})`,
    );
  }

  /** Zatrzymuje bieżący playback */
  stop(): void {
    this._playing = false;
    this._currentFile = null;
    if (this.onStop) this.onStop();
    console.log('[MediaSender] STOP');
  }

  /** Zmienia głośność bieżącego playback (0-100) */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(100, volume));
    console.log(`[MediaSender] Volume: ${this._volume}%`);
  }

  /** Zwraca aktualny status playback */
  getStatus(): { playing: boolean; currentFile: string | null; volume: number } {
    return {
      playing: this._playing,
      currentFile: this._currentFile,
      volume: this._volume,
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
  }
}
