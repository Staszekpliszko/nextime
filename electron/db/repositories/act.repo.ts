import Database from 'better-sqlite3';
import { generateId } from './base';

export type ActStatus = 'draft' | 'rehearsal' | 'approved' | 'live';
export type FPS = 24 | 25 | 29 | 30 | 50 | 60;

export interface Act {
  id: string;
  rundown_id: string;
  cue_id?: string;
  name: string;
  artist?: string;
  sort_order: number;
  duration_frames: number;
  tc_offset_frames: number;
  fps: FPS;
  status: ActStatus;
  color: string;
  created_at: string;
  updated_at: string;
}

export type CreateActInput = {
  rundown_id: string;
  name: string;
  cue_id?: string;
  artist?: string;
  sort_order?: number;
  duration_frames?: number;
  tc_offset_frames?: number;
  fps?: FPS;
  status?: ActStatus;
  color?: string;
};

export type UpdateActInput = Partial<Omit<CreateActInput, 'rundown_id'>>;

interface ActRow {
  id: string;
  rundown_id: string;
  cue_id: string | null;
  name: string;
  artist: string | null;
  sort_order: number;
  duration_frames: number;
  tc_offset_frames: number;
  fps: number;
  status: string;
  color: string;
  created_at: string;
  updated_at: string;
}

function rowToAct(row: ActRow): Act {
  return {
    id: row.id,
    rundown_id: row.rundown_id,
    cue_id: row.cue_id ?? undefined,
    name: row.name,
    artist: row.artist ?? undefined,
    sort_order: row.sort_order,
    duration_frames: row.duration_frames,
    tc_offset_frames: row.tc_offset_frames,
    fps: row.fps as FPS,
    status: row.status as ActStatus,
    color: row.color,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── ActNote ──────────────────────────────────────────────────

export interface ActNote {
  id: string;
  act_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface ActNoteRow {
  id: string;
  act_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

function rowToActNote(row: ActNoteRow): ActNote {
  return { id: row.id, act_id: row.act_id, user_id: row.user_id, content: row.content, created_at: row.created_at };
}

// ── Repository ───────────────────────────────────────────────

export function createActRepo(db: Database.Database) {
  return {
    create(input: CreateActInput): Act {
      const id = generateId();
      db.prepare(`
        INSERT INTO acts (id, rundown_id, cue_id, name, artist, sort_order, duration_frames, tc_offset_frames, fps, status, color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.rundown_id, input.cue_id ?? null,
        input.name, input.artist ?? null,
        input.sort_order ?? 0, input.duration_frames ?? 0,
        input.tc_offset_frames ?? 0, input.fps ?? 25,
        input.status ?? 'draft', input.color ?? '#1E3A5F',
      );
      return this.findById(id)!;
    },

    findById(id: string): Act | undefined {
      const row = db.prepare('SELECT * FROM acts WHERE id = ?').get(id) as ActRow | undefined;
      return row ? rowToAct(row) : undefined;
    },

    findByRundown(rundownId: string): Act[] {
      const rows = db.prepare(
        'SELECT * FROM acts WHERE rundown_id = ? ORDER BY sort_order'
      ).all(rundownId) as ActRow[];
      return rows.map(rowToAct);
    },

    update(id: string, input: UpdateActInput): Act | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
      if (input.cue_id !== undefined) { fields.push('cue_id = ?'); values.push(input.cue_id); }
      if (input.artist !== undefined) { fields.push('artist = ?'); values.push(input.artist); }
      if (input.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(input.sort_order); }
      if (input.duration_frames !== undefined) { fields.push('duration_frames = ?'); values.push(input.duration_frames); }
      if (input.tc_offset_frames !== undefined) { fields.push('tc_offset_frames = ?'); values.push(input.tc_offset_frames); }
      if (input.fps !== undefined) { fields.push('fps = ?'); values.push(input.fps); }
      if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }
      if (input.color !== undefined) { fields.push('color = ?'); values.push(input.color); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE acts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM acts WHERE id = ?').run(id);
      return result.changes > 0;
    },

    // ── Act Notes ──
    addNote(actId: string, userId: string, content: string): ActNote {
      const id = generateId();
      db.prepare('INSERT INTO act_notes (id, act_id, user_id, content) VALUES (?, ?, ?, ?)').run(id, actId, userId, content);
      const row = db.prepare('SELECT * FROM act_notes WHERE id = ?').get(id) as ActNoteRow;
      return rowToActNote(row);
    },

    findNotesByAct(actId: string): ActNote[] {
      const rows = db.prepare('SELECT * FROM act_notes WHERE act_id = ? ORDER BY created_at').all(actId) as ActNoteRow[];
      return rows.map(rowToActNote);
    },

    deleteNote(id: string): boolean {
      const result = db.prepare('DELETE FROM act_notes WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
