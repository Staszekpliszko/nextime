import Database from 'better-sqlite3';
import { generateId, toBool, fromBool, parseJson, toJson } from './base';

export type ColumnType = 'richtext' | 'dropdown' | 'script';

export interface Column {
  id: string;
  rundown_id: string;
  name: string;
  type: ColumnType;
  sort_order: number;
  width_px: number;
  dropdown_options?: string[];
  is_script: boolean;
}

export type CreateColumnInput = {
  rundown_id: string;
  name: string;
  type?: ColumnType;
  sort_order?: number;
  width_px?: number;
  dropdown_options?: string[];
  is_script?: boolean;
};

export type UpdateColumnInput = Partial<Omit<CreateColumnInput, 'rundown_id'>>;

interface ColumnRow {
  id: string;
  rundown_id: string;
  name: string;
  type: string;
  sort_order: number;
  width_px: number;
  dropdown_options: string | null;
  is_script: number;
}

function rowToColumn(row: ColumnRow): Column {
  return {
    id: row.id,
    rundown_id: row.rundown_id,
    name: row.name,
    type: row.type as ColumnType,
    sort_order: row.sort_order,
    width_px: row.width_px,
    dropdown_options: parseJson<string[] | undefined>(row.dropdown_options, undefined),
    is_script: toBool(row.is_script),
  };
}

// ── ColumnVisibility ─────────────────────────────────────────

export interface ColumnVisibility {
  id: string;
  column_id: string;
  user_id: string;
  hidden: boolean;
}

interface ColumnVisibilityRow {
  id: string;
  column_id: string;
  user_id: string;
  hidden: number;
}

function rowToVisibility(row: ColumnVisibilityRow): ColumnVisibility {
  return {
    id: row.id,
    column_id: row.column_id,
    user_id: row.user_id,
    hidden: toBool(row.hidden),
  };
}

// ── Repository ───────────────────────────────────────────────

export function createColumnRepo(db: Database.Database) {
  return {
    create(input: CreateColumnInput): Column {
      const id = generateId();
      db.prepare(`
        INSERT INTO columns (id, rundown_id, name, type, sort_order, width_px, dropdown_options, is_script)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.rundown_id, input.name,
        input.type ?? 'richtext', input.sort_order ?? 0,
        input.width_px ?? 200,
        input.dropdown_options ? toJson(input.dropdown_options) : null,
        fromBool(input.is_script ?? false),
      );
      return this.findById(id)!;
    },

    findById(id: string): Column | undefined {
      const row = db.prepare('SELECT * FROM columns WHERE id = ?').get(id) as ColumnRow | undefined;
      return row ? rowToColumn(row) : undefined;
    },

    findByRundown(rundownId: string): Column[] {
      const rows = db.prepare(
        'SELECT * FROM columns WHERE rundown_id = ? ORDER BY sort_order'
      ).all(rundownId) as ColumnRow[];
      return rows.map(rowToColumn);
    },

    update(id: string, input: UpdateColumnInput): Column | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
      if (input.type !== undefined) { fields.push('type = ?'); values.push(input.type); }
      if (input.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(input.sort_order); }
      if (input.width_px !== undefined) { fields.push('width_px = ?'); values.push(input.width_px); }
      if (input.dropdown_options !== undefined) { fields.push('dropdown_options = ?'); values.push(toJson(input.dropdown_options)); }
      if (input.is_script !== undefined) { fields.push('is_script = ?'); values.push(fromBool(input.is_script)); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE columns SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM columns WHERE id = ?').run(id);
      return result.changes > 0;
    },

    /** Zmienia kolejność kolumn — batch update sort_order w transakcji */
    reorder(rundownId: string, columnIds: string[]): void {
      const updateStmt = db.prepare('UPDATE columns SET sort_order = ? WHERE id = ? AND rundown_id = ?');
      const reorderTx = db.transaction((ids: string[]) => {
        ids.forEach((id, index) => {
          updateStmt.run(index, id, rundownId);
        });
      });
      reorderTx(columnIds);
    },

    // ── Visibility ──
    setVisibility(columnId: string, userId: string, hidden: boolean): ColumnVisibility {
      const id = generateId();
      db.prepare(`
        INSERT INTO column_visibility (id, column_id, user_id, hidden)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(column_id, user_id) DO UPDATE SET hidden = excluded.hidden
      `).run(id, columnId, userId, fromBool(hidden));

      const row = db.prepare(
        'SELECT * FROM column_visibility WHERE column_id = ? AND user_id = ?'
      ).get(columnId, userId) as ColumnVisibilityRow;
      return rowToVisibility(row);
    },

    getVisibility(columnId: string, userId: string): ColumnVisibility | undefined {
      const row = db.prepare(
        'SELECT * FROM column_visibility WHERE column_id = ? AND user_id = ?'
      ).get(columnId, userId) as ColumnVisibilityRow | undefined;
      return row ? rowToVisibility(row) : undefined;
    },

    getVisibilitiesByUser(rundownId: string, userId: string): ColumnVisibility[] {
      const rows = db.prepare(`
        SELECT cv.* FROM column_visibility cv
        JOIN columns c ON c.id = cv.column_id
        WHERE c.rundown_id = ? AND cv.user_id = ?
      `).all(rundownId, userId) as ColumnVisibilityRow[];
      return rows.map(rowToVisibility);
    },
  };
}
