import { ipcMain } from 'electron';
import type { SettingsManager, SettingsSection, AllSettings } from '../settings-manager';
import type { SenderManager } from '../senders';

/**
 * Rejestruje IPC handlery dla ustawień (Faza 18).
 * Wydzielone z main.ts żeby nie zwiększać rozmiaru istniejącego pliku.
 */
export function registerSettingsIpcHandlers(
  settingsManager: SettingsManager,
  senderManager: SenderManager,
): void {
  /** Pobiera wszystkie ustawienia */
  ipcMain.handle('nextime:getSettings', () => {
    return settingsManager.getAll();
  });

  /** Pobiera ustawienia jednej sekcji (np. 'osc', 'midi', 'atem') */
  ipcMain.handle('nextime:getSettingsSection', (_event, section: string) => {
    const validSections: SettingsSection[] = ['osc', 'midi', 'atem', 'ltc', 'gpi', 'ptz'];
    if (!validSections.includes(section as SettingsSection)) {
      throw new Error(`Nieznana sekcja ustawień: ${section}`);
    }
    return settingsManager.getSection(section as SettingsSection);
  });

  /** Aktualizuje ustawienia sekcji i propaguje do sendera */
  ipcMain.handle('nextime:updateSettings', (_event, section: string, values: Record<string, unknown>) => {
    const validSections: SettingsSection[] = ['osc', 'midi', 'atem', 'ltc', 'gpi', 'ptz'];
    if (!validSections.includes(section as SettingsSection)) {
      throw new Error(`Nieznana sekcja ustawień: ${section}`);
    }

    // Aktualizacja w cache + DB
    settingsManager.updateSection(section as SettingsSection, values as Partial<AllSettings[SettingsSection]>);

    // Propagacja do odpowiedniego sendera
    settingsManager.applySectionToSender(section as SettingsSection, senderManager);
  });
}
