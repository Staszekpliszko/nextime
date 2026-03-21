import path from 'path';
import fs from 'fs';
import { app } from 'electron';

/**
 * Wykrywa czy aplikacja działa w trybie produkcyjnym (spakowana asar).
 * W testach (brak app) zawsze zwraca false.
 */
export function isProduction(): boolean {
  try {
    return app.isPackaged;
  } catch {
    return false;
  }
}

/**
 * Resolve ścieżki do schema.sql — obsługuje dev i production build.
 *
 * Dev:  docs/schema.sql (relatywnie do źródeł)
 * Prod: process.resourcesPath/docs/schema.sql (extraResources z electron-builder)
 */
export function resolveSchemaPath(): string {
  const candidates: string[] = [];

  // Production: extraResources trafia do process.resourcesPath
  if (isProduction() && typeof process.resourcesPath === 'string') {
    candidates.push(path.join(process.resourcesPath, 'docs', 'schema.sql'));
  }

  // Dev — __dirname = dist-electron/ (po kompilacji vite)
  candidates.push(
    path.join(__dirname, '..', 'docs', 'schema.sql'),
  );

  // Dev — source (electron/), __dirname = electron/
  candidates.push(
    path.join(__dirname, '..', '..', 'docs', 'schema.sql'),
  );

  // Fallback — cwd
  candidates.push(
    path.join(process.cwd(), 'docs', 'schema.sql'),
  );

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(`[NextTime] schema.sql nie znaleziony. Sprawdzone ścieżki:\n${candidates.join('\n')}`);
}

/**
 * Resolve ścieżki do preload.js — obsługuje dev i production build.
 *
 * Dev:  dist-electron/preload.js (__dirname/preload.js)
 * Prod: app.getAppPath()/dist-electron/preload.js (wewnątrz asar)
 */
export function resolvePreloadPath(): string {
  // W obu trybach preload jest w tym samym katalogu co main.js
  // __dirname wskazuje na dist-electron/ zarówno w dev jak i w prod
  const sameDirPath = path.join(__dirname, 'preload.js');

  if (fs.existsSync(sameDirPath)) {
    return sameDirPath;
  }

  // Fallback dla production: jawna ścieżka przez app.getAppPath()
  if (isProduction()) {
    const prodPath = path.join(app.getAppPath(), 'dist-electron', 'preload.js');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
  }

  // Ostateczny fallback — ścieżka __dirname (nawet jeśli plik jeszcze nie istnieje w dev)
  return sameDirPath;
}
