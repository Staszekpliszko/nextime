import Database from 'better-sqlite3';
import { generateId, toBool, fromBool, parseJson, toJson } from './base';

export type TrackType = 'vision' | 'vision_fx' | 'lyrics' | 'cues' | 'media' | 'osc' | 'gpi' | 'midi';

export interface Track {
  id: string;
  act_id: string;
  type: TrackType;
  name: string;
  sort_order: number;
  enabled: boolean;
  height_px: number;
  settings: Record<string, unknown>;
}

export type CreateTrackInput = {
  act_id: string;
  type: TrackType;
  name: string;
  sort_order?: number;
  enabled?: boolean;
  height_px?: number;
  settings?: Record<string, unknown>;
};

export type UpdateTrackInput = Partial<Omit<CreateTrackInput, 'act_id'>>;

interface TrackRow {
  id: string;
  act_id: string;
  type: string;
  name: string;
  sort_order: number;
  enabled: number;
  height_px: number;
  settings: string;
}

function rowToTrack(row: TrackRow): Track {
  return {
    id: row.id,
    act_id: row.act_id,
    type: row.type as TrackType,
    name: row.name,
    sort_order: row.sort_order,
    enabled: toBool(row.enabled),
    height_px: row.height_px,
    settings: parseJson<Record<string, unknown>>(row.settings, {}),
  };
}

export function createTrackRepo(db: Database.Database) {
  return {
    create(input: CreateTrackInput): Track {
      const id = generateId();
      db.prepare(`
        INSERT INTO tracks (id, act_id, type, name, sort_order, enabled, height_px, settings)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.act_id, input.type, input.name,
        input.sort_order ?? 0, fromBool(input.enabled ?? true),
        input.height_px ?? 48, toJson(input.settings ?? {}),
      );
      return this.findById(id)!;
    },

    findById(id: string): Track | undefined {
      const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as TrackRow | undefined;
      return row ? rowToTrack(row) : undefined;
    },

    findByAct(actId: string): Track[] {
      const rows = db.prepare(
        'SELECT * FROM tracks WHERE act_id = ? ORDER BY sort_order'
      ).all(actId) as TrackRow[];
      return rows.map(rowToTrack);
    },

    update(id: string, input: UpdateTrackInput): Track | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.type !== undefined) { fields.push('type = ?'); values.push(input.type); }
      if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
      if (input.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(input.sort_order); }
      if (input.enabled !== undefined) { fields.push('enabled = ?'); values.push(fromBool(input.enabled)); }
      if (input.height_px !== undefined) { fields.push('height_px = ?'); values.push(input.height_px); }
      if (input.settings !== undefined) { fields.push('settings = ?'); values.push(toJson(input.settings)); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
