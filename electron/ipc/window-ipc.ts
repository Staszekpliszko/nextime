import { ipcMain } from 'electron';
import type { WindowManager } from '../window-manager';

/**
 * Rejestruje IPC handlery dla zarządzania oknami (Faza 19).
 * Wyodrębnione do osobnego pliku — analogicznie do settings-ipc.ts.
 */
export function registerWindowIpcHandlers(
  windowManager: WindowManager,
  getHttpPort: () => number,
): void {
  // Pobierz listę monitorów
  ipcMain.handle('nextime:getDisplays', () => {
    return windowManager.getAvailableDisplays();
  });

  // Otwórz okno promptera (fullscreen, alwaysOnTop)
  ipcMain.handle('nextime:openPrompterWindow', (
    _event,
    shareToken: string,
    displayId?: number,
  ) => {
    const httpPort = getHttpPort();
    const windowId = windowManager.createPrompterWindow(httpPort, shareToken, displayId);
    return { ok: true, windowId };
  });

  // Otwórz okno output (CueApp/Single view)
  ipcMain.handle('nextime:openOutputWindow', (
    _event,
    shareToken: string,
    outputName: string,
  ) => {
    const httpPort = getHttpPort();
    const windowId = windowManager.createOutputWindow(httpPort, shareToken, outputName);
    return { ok: true, windowId };
  });

  // Zamknij okno po ID
  ipcMain.handle('nextime:closeWindow', (_event, windowId: string) => {
    const closed = windowManager.closeWindow(windowId);
    return { ok: closed };
  });

  // Pobierz listę otwartych dodatkowych okien
  ipcMain.handle('nextime:getOpenWindows', () => {
    return windowManager.getOpenWindows();
  });
}
