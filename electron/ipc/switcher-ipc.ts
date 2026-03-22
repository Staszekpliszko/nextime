import { ipcMain } from 'electron';
import type { SenderManager } from '../senders';
import type { SettingsManager } from '../settings-manager';

// ── Zunifikowany status switchera ─────────────────────────

/** Zunifikowany input/scena — wspólny format dla ATEM/OBS/vMix */
export interface SwitcherInput {
  /** Identyfikator: numer inputu (ATEM/vMix) lub nazwa sceny (OBS) */
  id: string;
  /** Etykieta do wyświetlenia w UI */
  label: string;
  /** Numer inputu (ATEM/vMix) lub index (OBS) — do porównywania z camera_number */
  number: number;
}

/** Zunifikowany status aktywnego switchera wizji */
export interface UnifiedSwitcherStatus {
  /** Typ aktywnego switchera */
  switcherType: 'atem' | 'obs' | 'vmix' | 'none';
  /** Czy switcher jest połączony */
  connected: boolean;
  /** Identyfikator aktywnego wejścia na Program (PGM) */
  programInput: string | null;
  /** Identyfikator aktywnego wejścia na Preview (PRV) */
  previewInput: string | null;
  /** Numer PGM (do porównywania z camera_number) */
  programNumber: number | null;
  /** Numer PRV (do porównywania z camera_number) */
  previewNumber: number | null;
  /** Lista dostępnych inputów/scen */
  inputs: SwitcherInput[];
  /** Nazwa modelu/wersji (opcjonalna) */
  modelName: string | null;
}

/**
 * Rejestruje IPC handlery dla zunifikowanego switcher API.
 * Pozwala rendererowi odpytywać stan aktywnego switchera bez wiedzy,
 * który konkretnie jest podłączony.
 */
export function registerSwitcherIpcHandlers(
  senderManager: SenderManager,
  settingsManager: SettingsManager,
): void {
  // Pobierz zunifikowany status aktywnego switchera
  ipcMain.handle('nextime:switcherGetStatus', (): UnifiedSwitcherStatus => {
    const targetSwitcher = settingsManager.getSection('vision')?.targetSwitcher ?? 'none';

    switch (targetSwitcher) {
      case 'atem': {
        const status = senderManager.atem.getStatus();
        return {
          switcherType: 'atem',
          connected: status.connected,
          programInput: status.programInput !== null ? String(status.programInput) : null,
          previewInput: status.previewInput !== null ? String(status.previewInput) : null,
          programNumber: status.programInput,
          previewNumber: status.previewInput,
          inputs: Array.from({ length: 8 }, (_, i) => ({
            id: String(i + 1),
            label: `Input ${i + 1}`,
            number: i + 1,
          })),
          modelName: status.modelName,
        };
      }

      case 'obs': {
        const status = senderManager.obs.getStatus();
        const scenes = status.scenes;
        return {
          switcherType: 'obs',
          connected: status.connected,
          programInput: status.currentScene,
          previewInput: status.previewScene,
          programNumber: status.currentScene ? scenes.indexOf(status.currentScene) + 1 : null,
          previewNumber: status.previewScene ? scenes.indexOf(status.previewScene) + 1 : null,
          inputs: scenes.map((name, i) => ({
            id: name,
            label: name,
            number: i + 1,
          })),
          modelName: status.studioMode ? 'OBS (Studio Mode)' : 'OBS Studio',
        };
      }

      case 'vmix': {
        const status = senderManager.vmix.getStatus();
        return {
          switcherType: 'vmix',
          connected: status.connected,
          programInput: status.activeInput !== null ? String(status.activeInput) : null,
          previewInput: status.previewInput !== null ? String(status.previewInput) : null,
          programNumber: status.activeInput,
          previewNumber: status.previewInput,
          inputs: status.inputs.map(inp => ({
            id: String(inp.number),
            label: inp.title || `Input ${inp.number}`,
            number: inp.number,
          })),
          modelName: status.version ? `vMix ${status.version}` : 'vMix',
        };
      }

      default:
        return {
          switcherType: 'none',
          connected: false,
          programInput: null,
          previewInput: null,
          programNumber: null,
          previewNumber: null,
          inputs: [],
          modelName: null,
        };
    }
  });

  // Ustaw Preview na aktywnym switcherze
  ipcMain.handle('nextime:switcherSetPreview', async (_event, inputId: string): Promise<{ ok: boolean; error?: string }> => {
    const targetSwitcher = settingsManager.getSection('vision')?.targetSwitcher ?? 'none';

    try {
      switch (targetSwitcher) {
        case 'atem': {
          const input = parseInt(inputId, 10);
          if (isNaN(input)) return { ok: false, error: 'Nieprawidłowy numer inputu' };
          senderManager.atem.setPreview(input);
          return { ok: true };
        }
        case 'obs': {
          await senderManager.obs.setPreviewScene(inputId);
          return { ok: true };
        }
        case 'vmix': {
          const input = parseInt(inputId, 10);
          if (isNaN(input)) return { ok: false, error: 'Nieprawidłowy numer inputu' };
          await senderManager.vmix.setPreview(input);
          return { ok: true };
        }
        default:
          return { ok: false, error: 'Brak aktywnego switchera' };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // CUT na aktywnym switcherze (przełącz input na Program)
  ipcMain.handle('nextime:switcherCut', async (_event, inputId: string): Promise<{ ok: boolean; error?: string }> => {
    const targetSwitcher = settingsManager.getSection('vision')?.targetSwitcher ?? 'none';

    try {
      switch (targetSwitcher) {
        case 'atem': {
          const input = parseInt(inputId, 10);
          if (isNaN(input)) return { ok: false, error: 'Nieprawidłowy numer inputu' };
          senderManager.atem.performCut(input);
          return { ok: true };
        }
        case 'obs': {
          await senderManager.obs.setScene(inputId);
          return { ok: true };
        }
        case 'vmix': {
          const input = parseInt(inputId, 10);
          if (isNaN(input)) return { ok: false, error: 'Nieprawidłowy numer inputu' };
          await senderManager.vmix.cut(input);
          return { ok: true };
        }
        default:
          return { ok: false, error: 'Brak aktywnego switchera' };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  console.log('[Switcher IPC] Handlery zarejestrowane');
}
