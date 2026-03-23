import { ipcMain } from 'electron';
import type { StreamDeckManager, StreamDeckDeviceStatus, StreamDeckListEntry } from '../streamdeck/streamdeck-manager';
import type { StreamDeckFeedback } from '../streamdeck/streamdeck-feedback';
import type { StreamDeckPagesConfig } from '../streamdeck/streamdeck-pages';
import type { StreamDeckButtonConfig } from '../streamdeck/streamdeck-actions';
import { getDefaultPages, createEmptyPage } from '../streamdeck/streamdeck-pages';
import type { SettingsManager } from '../settings-manager';
import type { PlaybackEngine } from '../playback-engine';
import type { SenderManager } from '../senders';

// ── Typy odpowiedzi IPC ────────────────────────────────

export interface StreamDeckIpcStatus extends StreamDeckDeviceStatus {
  pagesConfig: StreamDeckPagesConfig;
}

// ── Referencje do stanu ─────────────────────────────────

let _manager: StreamDeckManager;
let _feedback: StreamDeckFeedback;
let _pagesConfig: StreamDeckPagesConfig;
let _settingsManager: SettingsManager;
let _engine: PlaybackEngine;
let _senderManager: SenderManager;

// ── Pomocnicze ──────────────────────────────────────────

/** Zapisuje konfigurację stron do settings */
function savePagesConfig(): void {
  _settingsManager.updateSection('streamdeck', {
    pagesJson: JSON.stringify(_pagesConfig),
  });
}

/** Wczytuje konfigurację stron z settings — waliduje keyCount i wersję */
function loadPagesConfig(keyCount: number): StreamDeckPagesConfig {
  const settings = _settingsManager.getSection('streamdeck');
  if (settings.pagesJson) {
    try {
      const parsed = JSON.parse(settings.pagesJson) as StreamDeckPagesConfig;
      if (parsed.pages && parsed.pages.length > 0) {
        const firstPageBtnCount = parsed.pages[0]?.buttons?.length ?? 0;
        // Walidacja 1: keyCount musi się zgadzać
        if (firstPageBtnCount !== keyCount) {
          console.log(`[StreamDeck IPC] Zmiana modelu (${firstPageBtnCount} → ${keyCount} przycisków) — generuję nowe domyślne strony`);
          return getDefaultPages(keyCount);
        }
        // Walidacja 2: przyciski muszą mieć poprawną strukturę (action field)
        const firstBtn = parsed.pages[0]?.buttons?.[0];
        if (firstBtn && typeof firstBtn.action !== 'string') {
          console.log('[StreamDeck IPC] Uszkodzona struktura stron — generuję nowe domyślne');
          return getDefaultPages(keyCount);
        }
        return parsed;
      }
    } catch {
      // Ignoruj — wygeneruj domyślne
    }
  }
  return getDefaultPages(keyCount);
}

// ── Rejestracja handlerów ───────────────────────────────

export function registerStreamDeckIpcHandlers(
  manager: StreamDeckManager,
  feedback: StreamDeckFeedback,
  pagesConfig: StreamDeckPagesConfig,
  settingsManager: SettingsManager,
  engine: PlaybackEngine,
  senderManager: SenderManager,
): void {
  _manager = manager;
  _feedback = feedback;
  _pagesConfig = pagesConfig;
  _settingsManager = settingsManager;
  _engine = engine;
  _senderManager = senderManager;

  // ── Status ──────────────────────────────────────────

  ipcMain.handle('nextime:streamdeckGetStatus', (): StreamDeckIpcStatus => {
    return {
      ..._manager.getStatus(),
      pagesConfig: _pagesConfig,
    };
  });

  // ── Lista urządzeń ──────────────────────────────────

  ipcMain.handle('nextime:streamdeckListDevices', async (): Promise<StreamDeckListEntry[]> => {
    return _manager.listDevices();
  });

  // ── Otwórz urządzenie ───────────────────────────────

  ipcMain.handle('nextime:streamdeckOpen', async (_event, devicePath?: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const success = await _manager.open(devicePath);
      if (success) {
        const status = _manager.getStatus();
        // Wczytaj zapisane strony z DB (generuj domyślne tylko dla nowego modelu/keyCount)
        _pagesConfig = loadPagesConfig(status.keyCount);
        savePagesConfig(); // zapisz do DB (nowe domyślne lub istniejące)

        // KLUCZOWE: podpnij feedback do engine i senderów
        _feedback.detach(); // na wypadek ponownego połączenia
        _feedback.attach(_engine, _senderManager, _manager, _pagesConfig);

        // Ustaw jasność
        const sdSettings = _settingsManager.getSection('streamdeck');
        await _manager.setBrightness(sdSettings.brightness);

        // Zapisz enabled = true
        _settingsManager.updateSection('streamdeck', { enabled: true });

        // Synchronizuj referencję w main.ts
        _manager.emit('pages-reset', _pagesConfig);

        console.log(`[StreamDeck IPC] Otwarty i feedback podpięty (${status.keyCount} przycisków, ${_pagesConfig.pages.length} stron)`);
      }
      return { ok: success };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Nieznany błąd' };
    }
  });

  // ── Zamknij urządzenie ──────────────────────────────

  ipcMain.handle('nextime:streamdeckClose', async (): Promise<void> => {
    _feedback.detach();
    await _manager.close();
    _settingsManager.updateSection('streamdeck', { enabled: false });
  });

  // ── Pobierz strony ─────────────────────────────────

  ipcMain.handle('nextime:streamdeckGetPages', (): StreamDeckPagesConfig => {
    return _pagesConfig;
  });

  // ── Ustaw akcję przycisku ──────────────────────────

  ipcMain.handle('nextime:streamdeckSetButtonAction', async (
    _event,
    pageIndex: number,
    keyIndex: number,
    buttonConfig: StreamDeckButtonConfig,
  ): Promise<{ ok: boolean }> => {
    const page = _pagesConfig.pages[pageIndex];
    if (!page || keyIndex < 0 || keyIndex >= page.buttons.length) {
      return { ok: false };
    }

    page.buttons[keyIndex] = buttonConfig;
    savePagesConfig();
    _feedback.updatePagesConfig(_pagesConfig);
    return { ok: true };
  });

  // ── Ustaw aktywną stronę ───────────────────────────

  ipcMain.handle('nextime:streamdeckSetActivePage', async (_event, pageIndex: number): Promise<{ ok: boolean }> => {
    if (pageIndex < 0 || pageIndex >= _pagesConfig.pages.length) {
      return { ok: false };
    }

    _pagesConfig.activePage = pageIndex;
    savePagesConfig();
    _feedback.updatePagesConfig(_pagesConfig);
    return { ok: true };
  });

  // ── Dodaj stronę ───────────────────────────────────

  ipcMain.handle('nextime:streamdeckAddPage', async (_event, name: string): Promise<{ ok: boolean; pageIndex: number }> => {
    const keyCount = _manager.getStatus().keyCount || 15;
    const page = createEmptyPage(name, keyCount);
    _pagesConfig.pages.push(page);
    savePagesConfig();
    return { ok: true, pageIndex: _pagesConfig.pages.length - 1 };
  });

  // ── Usuń stronę ────────────────────────────────────

  ipcMain.handle('nextime:streamdeckRemovePage', async (_event, pageIndex: number): Promise<{ ok: boolean }> => {
    if (pageIndex < 0 || pageIndex >= _pagesConfig.pages.length || _pagesConfig.pages.length <= 1) {
      return { ok: false };
    }

    _pagesConfig.pages.splice(pageIndex, 1);
    if (_pagesConfig.activePage >= _pagesConfig.pages.length) {
      _pagesConfig.activePage = _pagesConfig.pages.length - 1;
    }
    savePagesConfig();
    _feedback.updatePagesConfig(_pagesConfig);
    return { ok: true };
  });

  // ── Zmień nazwę strony ─────────────────────────────

  ipcMain.handle('nextime:streamdeckRenamePage', async (_event, pageIndex: number, name: string): Promise<{ ok: boolean }> => {
    const page = _pagesConfig.pages[pageIndex];
    if (!page) return { ok: false };

    page.name = name;
    savePagesConfig();
    return { ok: true };
  });

  // ── Jasność ────────────────────────────────────────

  ipcMain.handle('nextime:streamdeckSetBrightness', async (_event, percent: number): Promise<void> => {
    await _manager.setBrightness(percent);
    _settingsManager.updateSection('streamdeck', { brightness: percent });
  });

  // ── Reset do domyślnych ────────────────────────────

  ipcMain.handle('nextime:streamdeckResetDefaults', async (): Promise<{ ok: boolean }> => {
    const keyCount = _manager.getStatus().keyCount || 15;
    console.log(`[StreamDeck IPC] Reset do domyślnych — ${keyCount} przycisków`);
    _pagesConfig = getDefaultPages(keyCount);
    savePagesConfig();
    _feedback.updatePagesConfig(_pagesConfig);
    // Emituj event żeby main.ts zsynchronizował swoją referencję
    _manager.emit('pages-reset', _pagesConfig);
    console.log(`[StreamDeck IPC] Reset OK — ${_pagesConfig.pages.length} stron`);
    return { ok: true };
  });
}

/**
 * Aktualizuje referencję do pagesConfig (np. po zmianie strony z fizycznego przycisku).
 */
export function updatePagesConfigRef(config: StreamDeckPagesConfig): void {
  _pagesConfig = config;
}

/**
 * Zwraca aktualną konfigurację stron (po edycji/reset z IPC).
 */
export function getCurrentPagesConfig(): StreamDeckPagesConfig | null {
  return _pagesConfig ?? null;
}
