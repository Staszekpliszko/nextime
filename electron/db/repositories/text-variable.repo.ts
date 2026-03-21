import Database from 'better-sqlite3';
import { generateId } from './base';

export interface TextVariable {
  id: string;
  rundown_id: string;
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}

export type CreateTextVariableInput = {
  rundown_id: string;
  key: string;
  value?: string;
  description?: string;
};

export type UpdateTextVariableInput = {
  value?: string;
  description?: string;
};

interface TextVariableRow {
  id: string;
  rundown_id: string;
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

function rowToTextVariable(row: TextVariableRow): TextVariable {
  return {
    id: row.id,
    rundown_id: row.rundown_id,
    key: row.key,
    value: row.value,
    description: row.description ?? undefined,
    updated_at: row.updated_at,
  };
}

export function createTextVariableRepo(db: Database.Database) {
  return {
    create(input: CreateTextVariableInput): TextVariable {
      const id = generateId();
      db.prepare(`
        INSERT INTO text_variables (id, rundown_id, key, value, description)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, input.rundown_id, input.key, input.value ?? '', input.description ?? null);
      return this.findById(id)!;
    },

    findById(id: string): TextVariable | undefined {
      const row = db.prepare('SELECT * FROM text_variables WHERE id = ?').get(id) as TextVariableRow | undefined;
      return row ? rowToTextVariable(row) : undefined;
    },

    findByRundown(rundownId: string): TextVariable[] {
      const rows = db.prepare(
        'SELECT * FROM text_variables WHERE rundown_id = ? ORDER BY key'
      ).all(rundownId) as TextVariableRow[];
      return rows.map(rowToTextVariable);
    },

    findByKey(rundownId: string, key: string): TextVariable | undefined {
      const row = db.prepare(
        'SELECT * FROM text_variables WHERE rundown_id = ? AND key = ?'
      ).get(rundownId, key) as TextVariableRow | undefined;
      return row ? rowToTextVariable(row) : undefined;
    },

    /** Mapa klucz→wartość do szybkiego lookup */
    getVariableMap(rundownId: string): Record<string, string> {
      const vars = this.findByRundown(rundownId);
      const map: Record<string, string> = {};
      for (const v of vars) {
        map[v.key] = v.value;
      }
      return map;
    },

    upsert(rundownId: string, key: string, value: string, description?: string): TextVariable {
      const existing = this.findByKey(rundownId, key);
      if (existing) {
        this.update(existing.id, { value, description });
        return this.findById(existing.id)!;
      }
      return this.create({ rundown_id: rundownId, key, value, description });
    },

    update(id: string, input: UpdateTextVariableInput): TextVariable | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.value !== undefined) { fields.push('value = ?'); values.push(input.value); }
      if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE text_variables SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM text_variables WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
