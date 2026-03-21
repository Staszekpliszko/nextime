import Database from 'better-sqlite3';
import { generateId, toBool, fromBool } from './base';

export interface CueGroup {
  id: string;
  rundown_id: string;
  label: string;
  sort_order: number;
  collapsed: boolean;
  color?: string;
}

export type CreateCueGroupInput = {
  rundown_id: string;
  label: string;
  sort_order?: number;
  collapsed?: boolean;
  color?: string;
};

export type UpdateCueGroupInput = Partial<Omit<CreateCueGroupInput, 'rundown_id'>>;

interface CueGroupRow {
  id: string;
  rundown_id: string;
  label: string;
  sort_order: number;
  collapsed: number;
  color: string | null;
}

function rowToCueGroup(row: CueGroupRow): CueGroup {
  return {
    id: row.id,
    rundown_id: row.rundown_id,
    label: row.label,
    sort_order: row.sort_order,
    collapsed: toBool(row.collapsed),
    color: row.color ?? undefined,
  };
}

export function createCueGroupRepo(db: Database.Database) {
  return {
    create(input: CreateCueGroupInput): CueGroup {
      const id = generateId();
      db.prepare(`
        INSERT INTO cue_groups (id, rundown_id, label, sort_order, collapsed, color)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, input.rundown_id, input.label, input.sort_order ?? 0, fromBool(input.collapsed ?? false), input.color ?? null);
      return this.findById(id)!;
    },

    findById(id: string): CueGroup | undefined {
      const row = db.prepare('SELECT * FROM cue_groups WHERE id = ?').get(id) as CueGroupRow | undefined;
      return row ? rowToCueGroup(row) : undefined;
    },

    findByRundown(rundownId: string): CueGroup[] {
      const rows = db.prepare(
        'SELECT * FROM cue_groups WHERE rundown_id = ? ORDER BY sort_order'
      ).all(rundownId) as CueGroupRow[];
      return rows.map(rowToCueGroup);
    },

    update(id: string, input: UpdateCueGroupInput): CueGroup | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.label !== undefined) { fields.push('label = ?'); values.push(input.label); }
      if (input.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(input.sort_order); }
      if (input.collapsed !== undefined) { fields.push('collapsed = ?'); values.push(fromBool(input.collapsed)); }
      if (input.color !== undefined) { fields.push('color = ?'); values.push(input.color); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE cue_groups SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM cue_groups WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
