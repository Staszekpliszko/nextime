import { BrowserWindow, screen } from 'electron';
import path from 'path';

// ── Typy ────────────────────────────────────────────────────────

/** Informacja o monitorze */
export interface DisplayInfo {
  id: number;
  label: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

/** Informacja o otwartym oknie */
export interface OpenWindowInfo {
  windowId: string;
  type: 'prompter' | 'output';
  title: string;
  displayId?: number;
}

// ── Window Manager ──────────────────────────────────────────────

/**
 * Centralne zarządzanie oknami Electron (prompter, output).
 * Rejestruje okna w Map<string, BrowserWindow> i pozwala na bezpieczne zamknięcie.
 */
export class WindowManager {
  private windows = new Map<string, { win: BrowserWindow; type: 'prompter' | 'output'; title: string; displayId?: number }>();
  private preloadPath: string;
  private counter = 0;

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath;
  }

  /** Zwraca listę dostępnych monitorów */
  getAvailableDisplays(): DisplayInfo[] {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();

    return displays.map((d, idx) => ({
      id: d.id,
      label: `Monitor ${idx + 1}${d.id === primary.id ? ' (główny)' : ''} — ${d.size.width}×${d.size.height}`,
      width: d.size.width,
      height: d.size.height,
      isPrimary: d.id === primary.id,
    }));
  }

  /**
   * Otwiera okno promptera — fullscreen na wybranym monitorze.
   * Ładuje URL outputu promptera z HTTP serwera.
   */
  createPrompterWindow(httpPort: number, shareToken: string, displayId?: number): string {
    const windowId = `prompter-${++this.counter}`;

    // Znajdź monitor (domyślnie: secondary jeśli dostępny, inaczej primary)
    const displays = screen.getAllDisplays();
    let targetDisplay = displays.find(d => d.id === displayId);
    if (!targetDisplay) {
      // Wybierz secondary monitor jeśli jest, inaczej primary
      const primary = screen.getPrimaryDisplay();
      targetDisplay = displays.find(d => d.id !== primary.id) ?? primary;
    }

    const win = new BrowserWindow({
      x: targetDisplay.bounds.x,
      y: targetDisplay.bounds.y,
      width: targetDisplay.size.width,
      height: targetDisplay.size.height,
      fullscreen: true,
      alwaysOnTop: true,
      title: 'NextTime — Prompter',
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    // Ładuj widok promptera z HTTP serwera
    const url = `http://localhost:${httpPort}/output/${shareToken}`;
    win.loadURL(url);

    // F11 toggle fullscreen w oknie promptera
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.key === 'F11' && input.type === 'keyDown') {
        win.setFullScreen(!win.isFullScreen());
      }
      // Escape zamyka okno
      if (input.key === 'Escape' && input.type === 'keyDown') {
        win.close();
      }
    });

    // Cleanup z mapy po zamknięciu
    win.on('closed', () => {
      this.windows.delete(windowId);
    });

    this.windows.set(windowId, {
      win,
      type: 'prompter',
      title: 'Prompter',
      displayId: targetDisplay.id,
    });

    return windowId;
  }

  /**
   * Otwiera okno output — CueApp/Single view jako lokalne okno Electron.
   * Ładuje URL outputu z HTTP serwera.
   */
  createOutputWindow(httpPort: number, shareToken: string, outputName: string): string {
    const windowId = `output-${++this.counter}`;

    const win = new BrowserWindow({
      width: 1024,
      height: 768,
      title: `NextTime — ${outputName}`,
      backgroundColor: '#0f172a',
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    // Ładuj widok output z HTTP serwera
    const url = `http://localhost:${httpPort}/output/${shareToken}`;
    win.loadURL(url);

    // Escape zamyka okno
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.key === 'Escape' && input.type === 'keyDown') {
        win.close();
      }
    });

    // Cleanup z mapy po zamknięciu
    win.on('closed', () => {
      this.windows.delete(windowId);
    });

    this.windows.set(windowId, {
      win,
      type: 'output',
      title: outputName,
    });

    return windowId;
  }

  /** Zamyka okno po ID */
  closeWindow(windowId: string): boolean {
    const entry = this.windows.get(windowId);
    if (!entry) return false;

    if (!entry.win.isDestroyed()) {
      entry.win.close();
    }
    this.windows.delete(windowId);
    return true;
  }

  /** Zamyka wszystkie dodatkowe okna (cleanup przy zamknięciu głównego) */
  closeAll(): void {
    for (const [id, entry] of this.windows) {
      if (!entry.win.isDestroyed()) {
        entry.win.destroy();
      }
      this.windows.delete(id);
    }
  }

  /** Zwraca listę otwartych dodatkowych okien */
  getOpenWindows(): OpenWindowInfo[] {
    const result: OpenWindowInfo[] = [];
    for (const [windowId, entry] of this.windows) {
      if (!entry.win.isDestroyed()) {
        result.push({
          windowId,
          type: entry.type,
          title: entry.title,
          displayId: entry.displayId,
        });
      }
    }
    return result;
  }

  /** Sprawdza czy są otwarte okna */
  hasOpenWindows(): boolean {
    return this.windows.size > 0;
  }
}
