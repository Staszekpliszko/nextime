import Database from 'better-sqlite3';
import { generateId } from './base';

export type RundownStatus = 'draft' | 'approved' | 'live' | 'done';
export type FPS = 24 | 25 | 29 | 30 | 50 | 60;

export interface Rundown {
  id: string;
  project_id: string;
  event_id?: string;
  name: string;
  show_date?: string;
  show_time?: string;
  status: RundownStatus;
  sort_order: number;
  venue?: string;
  default_fps?: FPS;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type CreateRundownInput = {
  project_id: string;
  name: string;
  event_id?: string;
  show_date?: string;
  show_time?: string;
  status?: RundownStatus;
  sort_order?: number;
  venue?: string;
  default_fps?: FPS;
  notes?: string;
};

export type UpdateRundownInput = Partial<Omit<CreateRundownInput, 'project_id'>>;

interface RundownRow {
  id: string;
  project_id: string;
  event_id: string | null;
  name: string;
  show_date: string | null;
  show_time: string | null;
  status: string;
  sort_order: number;
  venue: string | null;
  default_fps: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRundown(row: RundownRow): Rundown {
  return {
    id: row.id,
    project_id: row.project_id,
    event_id: row.event_id ?? undefined,
    name: row.name,
    show_date: row.show_date ?? undefined,
    show_time: row.show_time ?? undefined,
    status: row.status as RundownStatus,
    sort_order: row.sort_order,
    venue: row.venue ?? undefined,
    default_fps: row.default_fps != null ? (row.default_fps as FPS) : undefined,
    notes: row.notes ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createRundownRepo(db: Database.Database) {
  return {
    create(input: CreateRundownInput): Rundown {
      const id = generateId();
      db.prepare(`
        INSERT INTO rundowns (id, project_id, event_id, name, show_date, show_time, status, sort_order, venue, default_fps, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.project_id, input.event_id ?? null,
        input.name, input.show_date ?? null, input.show_time ?? null,
        input.status ?? 'draft', input.sort_order ?? 0,
        input.venue ?? null, input.default_fps ?? null, input.notes ?? null,
      );
      return this.findById(id)!;
    },

    findById(id: string): Rundown | undefined {
      const row = db.prepare('SELECT * FROM rundowns WHERE id = ?').get(id) as RundownRow | undefined;
      return row ? rowToRundown(row) : undefined;
    },

    findByProject(projectId: string): Rundown[] {
      const rows = db.prepare(
        'SELECT * FROM rundowns WHERE project_id = ? ORDER BY sort_order'
      ).all(projectId) as RundownRow[];
      return rows.map(rowToRundown);
    },

    findAll(): Rundown[] {
      const rows = db.prepare('SELECT * FROM rundowns ORDER BY sort_order').all() as RundownRow[];
      return rows.map(rowToRundown);
    },

    update(id: string, input: UpdateRundownInput): Rundown | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
      if (input.event_id !== undefined) { fields.push('event_id = ?'); values.push(input.event_id); }
      if (input.show_date !== undefined) { fields.push('show_date = ?'); values.push(input.show_date); }
      if (input.show_time !== undefined) { fields.push('show_time = ?'); values.push(input.show_time); }
      if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }
      if (input.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(input.sort_order); }
      if (input.venue !== undefined) { fields.push('venue = ?'); values.push(input.venue); }
      if (input.default_fps !== undefined) { fields.push('default_fps = ?'); values.push(input.default_fps); }
      if (input.notes !== undefined) { fields.push('notes = ?'); values.push(input.notes); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE rundowns SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM rundowns WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
