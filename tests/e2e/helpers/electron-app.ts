import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * Helper do uruchamiania Electron w testach E2E.
 *
 * Używa tymczasowego katalogu jako userData,
 * żeby każdy test miał czystą bazę danych.
 */

export interface AppContext {
  electronApp: ElectronApplication;
  window: Page;
  /** Ścieżka do tymczasowego userData — sprzątana w closeApp() */
  userDataDir: string;
}

/**
 * Root projektu — Playwright zawsze uruchamia się z katalogu projektu.
 */
const PROJECT_ROOT = process.cwd();

/**
 * Uruchamia aplikację Electron z czystą bazą danych.
 * Tworzy tymczasowy katalog userData, żeby testy nie kolidowały ze sobą.
 */
export async function launchApp(): Promise<AppContext> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextime-e2e-'));

  const mainJsPath = path.join(PROJECT_ROOT, 'dist-electron', 'main.js');
  if (!fs.existsSync(mainJsPath)) {
    throw new Error(
      `[E2E] Brak dist-electron/main.js — uruchom "npx vite build" przed testami E2E.\n` +
      `Oczekiwana ścieżka: ${mainJsPath}`
    );
  }

  const electronApp = await electron.launch({
    args: [mainJsPath],
    env: {
      ...process.env,
      // Nadpisz userData żeby każdy test miał czystą bazę
      NEXTIME_USER_DATA_DIR: userDataDir,
      // Wyłącz DevTools w trybie E2E
      NEXTIME_E2E: '1',
    },
  });

  // Przechwytuj logi main process (do debugowania)
  electronApp.process().stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[Electron stdout] ${msg}`);
  });
  electronApp.process().stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[Electron stderr] ${msg}`);
  });

  // Czekaj na pierwsze okno (główne BrowserWindow)
  const window = await electronApp.firstWindow();

  // Przechwytuj logi renderer (do debugowania)
  window.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`[Renderer] ${msg.text()}`);
    }
  });

  // Czekaj aż ekran ładowania zniknie — szukamy końca "Ładowanie NextTime..."
  await window.waitForSelector('text=Ładowanie NextTime', { state: 'hidden', timeout: 30_000 }).catch(() => {
    // Jeśli ekran ładowania już nie jest widoczny — OK
  });

  // Dodatkowe czekanie na pełne załadowanie UI
  await window.waitForLoadState('domcontentloaded');

  return { electronApp, window, userDataDir };
}

/**
 * Zamyka aplikację Electron i sprząta tymczasowy katalog userData.
 */
export async function closeApp(ctx: AppContext): Promise<void> {
  try {
    await ctx.electronApp.close();
  } catch {
    // App mogła się już zamknąć
  }

  // Sprzątanie tymczasowego userData
  try {
    fs.rmSync(ctx.userDataDir, { recursive: true, force: true });
  } catch {
    // Ignoruj błędy sprzątania — Windows może blokować pliki
  }
}
