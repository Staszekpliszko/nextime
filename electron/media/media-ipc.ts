import { EventEmitter } from 'events';
import type { BrowserWindow, IpcMain } from 'electron';

// ── Typy komend media (main → renderer) ────────────────────────

/** Komenda play — odtwórz plik media */
export interface MediaPlayCommand {
  type: 'play';
  filePath: string;
  volume: number; // 0–100
  loop: boolean;
  cueId: string;
}

/** Komenda stop */
export interface MediaStopCommand {
  type: 'stop';
}

/** Komenda pause */
export interface MediaPauseCommand {
  type: 'pause';
}

/** Komenda resume */
export interface MediaResumeCommand {
  type: 'resume';
}

/** Komenda volume — zmiana głośności (0–100) */
export interface MediaVolumeCommand {
  type: 'volume';
  volume: number;
}

/** Komenda seek — skok do pozycji (w sekundach) */
export interface MediaSeekCommand {
  type: 'seek';
  timeSec: number;
}

export type MediaCommand =
  | MediaPlayCommand
  | MediaStopCommand
  | MediaPauseCommand
  | MediaResumeCommand
  | MediaVolumeCommand
  | MediaSeekCommand;

// ── Feedback z renderera (renderer → main) ─────────────────────

/** Stan odtwarzania raportowany z renderera */
export interface MediaFeedback {
  /** Nazwa odtwarzanego pliku */
  fileName: string;
  /** Aktualny czas w sekundach */
  currentTimeSec: number;
  /** Całkowity czas trwania w sekundach */
  durationSec: number;
  /** Czy aktualnie odtwarza */
  isPlaying: boolean;
  /** Czy odtwarzanie się zakończyło */
  ended: boolean;
  /** Głośność (0–100) */
  volume: number;
}

// ── MediaIpcBridge ─────────────────────────────────────────────

/**
 * Most IPC między main process a renderer process dla media playback.
 *
 * - Wysyła komendy media do renderera (main → renderer)
 * - Odbiera feedback z renderera (renderer → main)
 * - Emituje eventy 'feedback' gdy renderer raportuje stan
 */
export class MediaIpcBridge extends EventEmitter {
  private mainWindow: BrowserWindow | null = null;

  /** Ustawia okno główne do którego wysyłane są komendy */
  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  /** Wysyła komendę media do renderera */
  sendCommand(cmd: MediaCommand): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn('[MediaIpcBridge] Brak okna — komenda pominięta:', cmd.type);
      return;
    }
    this.mainWindow.webContents.send('media:command', cmd);
  }

  /** Obsługuje feedback z renderera — wywoływane z IPC handlera */
  handleFeedback(feedback: MediaFeedback): void {
    this.emit('feedback', feedback);
  }

  /** Rejestruje IPC handlery w ipcMain */
  registerIpcHandlers(ipcMain: IpcMain): void {
    ipcMain.on('media:feedback', (_event, feedback: MediaFeedback) => {
      this.handleFeedback(feedback);
    });
  }

  /** Cleanup */
  destroy(): void {
    this.mainWindow = null;
    this.removeAllListeners();
  }
}
