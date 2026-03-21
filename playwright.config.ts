import { defineConfig } from '@playwright/test';

/**
 * Playwright config — E2E testy Electron.
 *
 * Nie używamy webServer — aplikacja jest desktopowa.
 * Electron jest uruchamiany bezpośrednio przez helpera w tests/e2e/helpers/electron-app.ts.
 *
 * Przed uruchomieniem testów E2E:
 *   npx vite build      (buduje dist/ i dist-electron/)
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 1,
  workers: 1, // Electron — jeden instancja na raz (jedno okno = jeden test)
  use: {
    trace: 'on-first-retry',
  },
  expect: {
    timeout: 10_000,
  },
});
