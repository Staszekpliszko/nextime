import Database from 'better-sqlite3';
import { generateId, parseJson, toJson } from './base';

export type TimelineCueType = 'vision' | 'vision_fx' | 'lyric' | 'marker' | 'media' | 'osc' | 'gpi' | 'midi';

export interface TimelineCue {
  id: string;
  track_id: string;
  act_id: string;
  type: TimelineCueType;
  tc_in_frames: number;
  tc_out_frames?: number;
  z_order: number;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type CreateTimelineCueInput = {
  track_id: string;
  act_id: string;
  type: TimelineCueType;
  tc_in_frames: number;
  tc_out_frames?: number;
  z_order?: number;
  data?: Record<string, unknown>;
};

export type UpdateTimelineCueInput = Partial<Omit<CreateTimelineCueInput, 'track_id' | 'act_id'>>;

interface TimelineCueRow {
  id: string;
  track_id: string;
  act_id: string;
  type: string;
  tc_in_frames: number;
  tc_out_frames: number | null;
  z_order: number;
  data: string;
  created_at: string;
  updated_at: string;
}

function rowToTimelineCue(row: TimelineCueRow): TimelineCue {
  return {
    id: row.id,
    track_id: row.track_id,
    act_id: row.act_id,
    type: row.type as TimelineCueType,
    tc_in_frames: row.tc_in_frames,
    tc_out_frames: row.tc_out_frames ?? undefined,
    z_order: row.z_order,
    data: parseJson<Record<string, unknown>>(row.data, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createTimelineCueRepo(db: Database.Database) {
  return {
    create(input: CreateTimelineCueInput): TimelineCue {
      const id = generateId();
      db.prepare(`
        INSERT INTO timeline_cues (id, track_id, act_id, type, tc_in_frames, tc_out_frames, z_order, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.track_id, input.act_id, input.type,
        input.tc_in_frames, input.tc_out_frames ?? null,
        input.z_order ?? 0, toJson(input.data ?? {}),
      );
      return this.findById(id)!;
    },

    findById(id: string): TimelineCue | undefined {
      const row = db.prepare('SELECT * FROM timeline_cues WHERE id = ?').get(id) as TimelineCueRow | undefined;
      return row ? rowToTimelineCue(row) : undefined;
    },

    findByTrack(trackId: string): TimelineCue[] {
      const rows = db.prepare(
        'SELECT * FROM timeline_cues WHERE track_id = ? ORDER BY tc_in_frames'
      ).all(trackId) as TimelineCueRow[];
      return rows.map(rowToTimelineCue);
    },

    findByAct(actId: string): TimelineCue[] {
      const rows = db.prepare(
        'SELECT * FROM timeline_cues WHERE act_id = ? ORDER BY tc_in_frames'
      ).all(actId) as TimelineCueRow[];
      return rows.map(rowToTimelineCue);
    },

    findByActAndType(actId: string, type: TimelineCueType): TimelineCue[] {
      const rows = db.prepare(
        'SELECT * FROM timeline_cues WHERE act_id = ? AND type = ? ORDER BY tc_in_frames'
      ).all(actId, type) as TimelineCueRow[];
      return rows.map(rowToTimelineCue);
    },

    /** Zwraca aktywny cue dla danej pozycji TC */
    findActiveAtFrame(actId: string, type: TimelineCueType, frame: number): TimelineCue | undefined {
      const row = db.prepare(`
        SELECT * FROM timeline_cues
        WHERE act_id = ? AND type = ?
          AND tc_in_frames <= ?
          AND (tc_out_frames IS NULL AND tc_in_frames = ? OR tc_out_frames > ?)
        ORDER BY z_order DESC
        LIMIT 1
      `).get(actId, type, frame, frame, frame) as TimelineCueRow | undefined;
      return row ? rowToTimelineCue(row) : undefined;
    },

    update(id: string, input: UpdateTimelineCueInput): TimelineCue | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.type !== undefined) { fields.push('type = ?'); values.push(input.type); }
      if (input.tc_in_frames !== undefined) { fields.push('tc_in_frames = ?'); values.push(input.tc_in_frames); }
      if (input.tc_out_frames !== undefined) { fields.push('tc_out_frames = ?'); values.push(input.tc_out_frames); }
      if (input.z_order !== undefined) { fields.push('z_order = ?'); values.push(input.z_order); }
      if (input.data !== undefined) { fields.push('data = ?'); values.push(toJson(input.data)); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE timeline_cues SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM timeline_cues WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
