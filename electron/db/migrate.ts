import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * Szuka schema.sql — obsługuje dev, bundled (vite) i production (electron-builder).
 *
 * Kolejność priorytetów:
 * 1. Production: process.resourcesPath/docs/schema.sql (extraResources)
 * 2. Bundled (dist-electron/): ../docs/schema.sql
 * 3. Dev (electron/db/): ../../docs/schema.sql
 * 4. Fallback: cwd/docs/schema.sql
 */
function findSchemaPath(): string {
  const candidates: string[] = [];

  // Production: extraResources z electron-builder trafia do resourcesPath
  if (typeof process.resourcesPath === 'string') {
    candidates.push(path.join(process.resourcesPath, 'docs', 'schema.sql'));
  }

  candidates.push(
    path.join(__dirname, '..', '..', 'docs', 'schema.sql'),  // dev (source)
    path.join(__dirname, '..', 'docs', 'schema.sql'),         // bundled (dist-electron/)
    path.join(process.cwd(), 'docs', 'schema.sql'),           // fallback (cwd)
  );
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`[NextTime] schema.sql nie znaleziony. Sprawdzone ścieżki:\n${candidates.join('\n')}`);
}

/**
 * Wykonuje schema.sql na podanej bazie danych.
 * Schema używa IF NOT EXISTS — bezpieczne wielokrotne wywołanie.
 * Po schema: migracje przyrostowe dla istniejących baz.
 */
export function runMigrations(db: Database.Database): void {
  const schemaPath = findSchemaPath();
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Faza 14: dodaj kolumnę status do cues (jeśli nie istnieje)
  runIncrementalMigrations(db);
}

/** Migracje przyrostowe — ALTER TABLE dla istniejących baz */
function runIncrementalMigrations(db: Database.Database): void {
  // Sprawdź czy kolumna status istnieje w tabeli cues
  const columns = db.pragma('table_info(cues)') as Array<{ name: string }>;
  const hasStatus = columns.some(c => c.name === 'status');
  if (!hasStatus) {
    db.exec(`ALTER TABLE cues ADD COLUMN status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','standby','done','skipped'))`);
  }

  // Faza 18: tabela app_settings (key-value store)
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'`).all() as Array<{ name: string }>;
  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
          key         TEXT    PRIMARY KEY,
          value       TEXT    NOT NULL,
          updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TRIGGER IF NOT EXISTS trg_app_settings_updated
          AFTER UPDATE ON app_settings
          BEGIN UPDATE app_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key = NEW.key; END;
    `);
  }
}

/**
 * Wersja dla testów — przyjmuje SQL jako string zamiast czytać plik.
 */
export function runMigrationsFromString(db: Database.Database, sql: string): void {
  db.exec(sql);
}
