import Database from 'better-sqlite3';
import { generateId, parseJson, toJson } from './base';

export type CellContentType = 'richtext' | 'dropdown_value' | 'file_ref';

export interface Cell {
  id: string;
  cue_id: string;
  column_id: string;
  content_type: CellContentType;
  richtext?: unknown;
  dropdown_value?: string;
  file_ref?: string;
  updated_at: string;
}

export type CreateCellInput = {
  cue_id: string;
  column_id: string;
  content_type?: CellContentType;
  richtext?: unknown;
  dropdown_value?: string;
  file_ref?: string;
};

export type UpdateCellInput = {
  content_type?: CellContentType;
  richtext?: unknown;
  dropdown_value?: string;
  file_ref?: string;
};

interface CellRow {
  id: string;
  cue_id: string;
  column_id: string;
  content_type: string;
  richtext: string | null;
  dropdown_value: string | null;
  file_ref: string | null;
  updated_at: string;
}

function rowToCell(row: CellRow): Cell {
  return {
    id: row.id,
    cue_id: row.cue_id,
    column_id: row.column_id,
    content_type: row.content_type as CellContentType,
    richtext: row.richtext ? parseJson(row.richtext, undefined) : undefined,
    dropdown_value: row.dropdown_value ?? undefined,
    file_ref: row.file_ref ?? undefined,
    updated_at: row.updated_at,
  };
}

export function createCellRepo(db: Database.Database) {
  return {
    create(input: CreateCellInput): Cell {
      const id = generateId();
      db.prepare(`
        INSERT INTO cells (id, cue_id, column_id, content_type, richtext, dropdown_value, file_ref)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.cue_id, input.column_id,
        input.content_type ?? 'richtext',
        input.richtext ? toJson(input.richtext) : null,
        input.dropdown_value ?? null,
        input.file_ref ?? null,
      );
      return this.findById(id)!;
    },

    findById(id: string): Cell | undefined {
      const row = db.prepare('SELECT * FROM cells WHERE id = ?').get(id) as CellRow | undefined;
      return row ? rowToCell(row) : undefined;
    },

    findByCue(cueId: string): Cell[] {
      const rows = db.prepare('SELECT * FROM cells WHERE cue_id = ?').all(cueId) as CellRow[];
      return rows.map(rowToCell);
    },

    findByCueAndColumn(cueId: string, columnId: string): Cell | undefined {
      const row = db.prepare(
        'SELECT * FROM cells WHERE cue_id = ? AND column_id = ?'
      ).get(cueId, columnId) as CellRow | undefined;
      return row ? rowToCell(row) : undefined;
    },

    /** Upsert — tworzy lub aktualizuje komórkę (cue_id, column_id) */
    upsert(input: CreateCellInput): Cell {
      const existing = this.findByCueAndColumn(input.cue_id, input.column_id);
      if (existing) {
        return this.update(existing.id, {
          content_type: input.content_type,
          richtext: input.richtext,
          dropdown_value: input.dropdown_value,
          file_ref: input.file_ref,
        })!;
      }
      return this.create(input);
    },

    update(id: string, input: UpdateCellInput): Cell | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.content_type !== undefined) { fields.push('content_type = ?'); values.push(input.content_type); }
      if (input.richtext !== undefined) { fields.push('richtext = ?'); values.push(toJson(input.richtext)); }
      if (input.dropdown_value !== undefined) { fields.push('dropdown_value = ?'); values.push(input.dropdown_value); }
      if (input.file_ref !== undefined) { fields.push('file_ref = ?'); values.push(input.file_ref); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE cells SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM cells WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
