import { ipcMain } from 'electron';
import type { SenderManager } from '../senders';

/**
 * Rejestruje IPC handlery dla OBS WebSocket.
 * Wywoływane z main.ts po inicjalizacji SenderManager.
 */
export function registerObsIpcHandlers(senderManager: SenderManager): void {
  // Połącz z OBS
  ipcMain.handle('nextime:obsConnect', async () => {
    try {
      await senderManager.obs.connect();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Rozłącz z OBS
  ipcMain.handle('nextime:obsDisconnect', () => {
    senderManager.obs.disconnect();
  });

  // Pobierz status OBS
  ipcMain.handle('nextime:obsGetStatus', () => {
    return senderManager.obs.getStatus();
  });

  // Pobierz listę scen (z cache)
  ipcMain.handle('nextime:obsGetScenes', () => {
    return senderManager.obs.getSceneList();
  });

  // Odśwież i pobierz listę scen (live z OBS)
  ipcMain.handle('nextime:obsRefreshScenes', async () => {
    return await senderManager.obs.refreshScenes();
  });

  // Przełącz scenę na Program
  ipcMain.handle('nextime:obsSetScene', async (_event, sceneName: string) => {
    try {
      await senderManager.obs.setScene(sceneName);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Przełącz scenę na Preview
  ipcMain.handle('nextime:obsSetPreview', async (_event, sceneName: string) => {
    try {
      await senderManager.obs.setPreviewScene(sceneName);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Wykonaj przejście Studio Mode
  ipcMain.handle('nextime:obsTriggerTransition', async (_event, transitionName?: string, durationMs?: number) => {
    try {
      await senderManager.obs.triggerTransition(transitionName, durationMs);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  console.log('[OBS IPC] Handlery zarejestrowane');
}
