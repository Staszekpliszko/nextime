import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * Szuka schema.sql — obsługuje zarówno dev (source), jak i prod (bundled).
 * W dev: __dirname = electron/db/, schema = ../../docs/schema.sql
 * Po bundlowaniu: __dirname = dist-electron/, schema = ../docs/schema.sql
 */
function findSchemaPath(): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'docs', 'schema.sql'),  // dev (source)
    path.join(__dirname, '..', 'docs', 'schema.sql'),         // bundled (dist-electron/)
    path.join(process.cwd(), 'docs', 'schema.sql'),           // fallback (cwd)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`schema.sql not found. Searched: ${candidates.join(', ')}`);
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
}

/**
 * Wersja dla testów — przyjmuje SQL jako string zamiast czytać plik.
 */
export function runMigrationsFromString(db: Database.Database, sql: string): void {
  db.exec(sql);
}
