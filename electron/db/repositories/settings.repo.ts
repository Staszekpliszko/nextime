import type Database from 'better-sqlite3';

// ── Typy ────────────────────────────────────────────────

export interface AppSetting {
  key: string;
  value: string;
  updated_at: string;
}

// ── Repository ──────────────────────────────────────────

export function createSettingsRepo(db: Database.Database) {
  // Przygotowane statementy — lepsza wydajność przy wielokrotnym użyciu
  const stmtGet = db.prepare<[string]>('SELECT key, value, updated_at FROM app_settings WHERE key = ?');
  const stmtGetAll = db.prepare('SELECT key, value, updated_at FROM app_settings ORDER BY key');
  const stmtUpsert = db.prepare<[string, string]>(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  const stmtDelete = db.prepare<[string]>('DELETE FROM app_settings WHERE key = ?');
  const stmtGetByPrefix = db.prepare<[string]>(
    `SELECT key, value, updated_at FROM app_settings WHERE key LIKE ? || '%' ORDER BY key`,
  );

  return {
    /** Pobiera wartość ustawienia po kluczu */
    get(key: string): string | undefined {
      const row = stmtGet.get(key) as AppSetting | undefined;
      return row?.value;
    },

    /** Pobiera pełny rekord ustawienia po kluczu */
    getRow(key: string): AppSetting | undefined {
      return stmtGet.get(key) as AppSetting | undefined;
    },

    /** Ustawia wartość (upsert — tworzy lub aktualizuje) */
    set(key: string, value: string): void {
      stmtUpsert.run(key, value);
    },

    /** Pobiera wszystkie ustawienia jako mapę key→value */
    getAll(): Record<string, string> {
      const rows = stmtGetAll.all() as AppSetting[];
      const result: Record<string, string> = {};
      for (const row of rows) {
        result[row.key] = row.value;
      }
      return result;
    },

    /** Pobiera ustawienia z danym prefiksem (np. 'osc.' → osc.host, osc.port, ...) */
    getByPrefix(prefix: string): Record<string, string> {
      const rows = stmtGetByPrefix.all(prefix) as AppSetting[];
      const result: Record<string, string> = {};
      for (const row of rows) {
        // Obcinamy prefix z klucza: 'osc.host' → 'host'
        const shortKey = row.key.startsWith(prefix) ? row.key.slice(prefix.length) : row.key;
        result[shortKey] = row.value;
      }
      return result;
    },

    /** Ustawia wiele wartości naraz (w transakcji) */
    setMany(entries: Record<string, string>): void {
      const transaction = db.transaction(() => {
        for (const [key, value] of Object.entries(entries)) {
          stmtUpsert.run(key, value);
        }
      });
      transaction();
    },

    /** Usuwa ustawienie po kluczu */
    delete(key: string): boolean {
      const result = stmtDelete.run(key);
      return result.changes > 0;
    },
  };
}

/** Typ repozytorium settings */
export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
