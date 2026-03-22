import { ipcMain } from 'electron';
import type { SenderManager } from '../senders';

/**
 * Rejestruje IPC handlery dla vMix HTTP API.
 * Wywoływane z main.ts po inicjalizacji SenderManager.
 */
export function registerVmixIpcHandlers(senderManager: SenderManager): void {
  // Połącz z vMix
  ipcMain.handle('nextime:vmixConnect', async () => {
    try {
      await senderManager.vmix.connect();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Rozłącz z vMix
  ipcMain.handle('nextime:vmixDisconnect', () => {
    senderManager.vmix.disconnect();
  });

  // Pobierz status vMix
  ipcMain.handle('nextime:vmixGetStatus', () => {
    return senderManager.vmix.getStatus();
  });

  // Pobierz listę inputów (z cache)
  ipcMain.handle('nextime:vmixGetInputs', () => {
    return senderManager.vmix.getInputList();
  });

  // Odśwież i pobierz listę inputów (live z vMix)
  ipcMain.handle('nextime:vmixRefreshInputs', async () => {
    return await senderManager.vmix.refreshInputs();
  });

  // CUT na input
  ipcMain.handle('nextime:vmixCut', async (_event, input: number) => {
    try {
      await senderManager.vmix.cut(input);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Fade na input
  ipcMain.handle('nextime:vmixFade', async (_event, input: number, durationMs?: number) => {
    try {
      await senderManager.vmix.fade(input, durationMs);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Ustaw preview
  ipcMain.handle('nextime:vmixSetPreview', async (_event, input: number) => {
    try {
      await senderManager.vmix.setPreview(input);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Play media
  ipcMain.handle('nextime:vmixPlayMedia', async (_event, input: number) => {
    try {
      await senderManager.vmix.playMedia(input);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Pause media
  ipcMain.handle('nextime:vmixPauseMedia', async (_event, input: number) => {
    try {
      await senderManager.vmix.pauseMedia(input);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Ustaw głośność
  ipcMain.handle('nextime:vmixSetVolume', async (_event, input: number, volume: number) => {
    try {
      await senderManager.vmix.setVolume(input, volume);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  console.log('[vMix IPC] Handlery zarejestrowane');
}
