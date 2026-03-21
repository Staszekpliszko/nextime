import Database from 'better-sqlite3';
import { generateId, toBool, fromBool } from './base';

// ── Discriminated union: Cue = SoftCue | HardCue ─────────────

export type CueStartType = 'soft' | 'hard';
export type CueStatus = 'ready' | 'standby' | 'done' | 'skipped';

interface CueBase {
  id: string;
  rundown_id: string;
  group_id?: string;
  sort_order: number;
  title: string;
  subtitle: string;
  duration_ms: number;
  auto_start: boolean;
  locked: boolean;
  background_color?: string;
  status: CueStatus;
  created_at: string;
  updated_at: string;
}

export interface SoftCue extends CueBase {
  start_type: 'soft';
  hard_start_datetime?: never;
}

export interface HardCue extends CueBase {
  start_type: 'hard';
  hard_start_datetime: string;
}

export type Cue = SoftCue | HardCue;

export function isHardCue(cue: Cue): cue is HardCue {
  return cue.start_type === 'hard';
}

// ── Input types ──────────────────────────────────────────────

export type CreateCueInput = {
  rundown_id: string;
  title?: string;
  subtitle?: string;
  duration_ms?: number;
  start_type?: CueStartType;
  hard_start_datetime?: string;
  auto_start?: boolean;
  locked?: boolean;
  background_color?: string;
  status?: CueStatus;
  group_id?: string;
  sort_order?: number;
};

export type UpdateCueInput = Partial<Omit<CreateCueInput, 'rundown_id'>>;

// ── Row mapping ──────────────────────────────────────────────

interface CueRow {
  id: string;
  rundown_id: string;
  group_id: string | null;
  sort_order: number;
  title: string;
  subtitle: string;
  duration_ms: number;
  start_type: string;
  hard_start_datetime: string | null;
  auto_start: number;
  locked: number;
  background_color: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToCue(row: CueRow): Cue {
  const base: CueBase = {
    id: row.id,
    rundown_id: row.rundown_id,
    group_id: row.group_id ?? undefined,
    sort_order: row.sort_order,
    title: row.title,
    subtitle: row.subtitle,
    duration_ms: row.duration_ms,
    auto_start: toBool(row.auto_start),
    locked: toBool(row.locked),
    background_color: row.background_color ?? undefined,
    status: (row.status as CueStatus) || 'ready',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  if (row.start_type === 'hard' && row.hard_start_datetime) {
    return { ...base, start_type: 'hard', hard_start_datetime: row.hard_start_datetime };
  }
  return { ...base, start_type: 'soft' } as SoftCue;
}

// ── Repository ───────────────────────────────────────────────

export function createCueRepo(db: Database.Database) {
  return {
    create(input: CreateCueInput): Cue {
      const id = generateId();
      db.prepare(`
        INSERT INTO cues (id, rundown_id, group_id, sort_order, title, subtitle, duration_ms, start_type, hard_start_datetime, auto_start, locked, background_color, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.rundown_id, input.group_id ?? null,
        input.sort_order ?? 0, input.title ?? '', input.subtitle ?? '',
        input.duration_ms ?? 0, input.start_type ?? 'soft',
        input.hard_start_datetime ?? null,
        fromBool(input.auto_start ?? false), fromBool(input.locked ?? false),
        input.background_color ?? null,
        input.status ?? 'ready',
      );
      return this.findById(id)!;
    },

    findById(id: string): Cue | undefined {
      const row = db.prepare('SELECT * FROM cues WHERE id = ?').get(id) as CueRow | undefined;
      return row ? rowToCue(row) : undefined;
    },

    findByRundown(rundownId: string): Cue[] {
      const rows = db.prepare(
        'SELECT * FROM cues WHERE rundown_id = ? ORDER BY sort_order'
      ).all(rundownId) as CueRow[];
      return rows.map(rowToCue);
    },

    findByGroup(groupId: string): Cue[] {
      const rows = db.prepare(
        'SELECT * FROM cues WHERE group_id = ? ORDER BY sort_order'
      ).all(groupId) as CueRow[];
      return rows.map(rowToCue);
    },

    update(id: string, input: UpdateCueInput): Cue | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.title !== undefined) { fields.push('title = ?'); values.push(input.title); }
      if (input.subtitle !== undefined) { fields.push('subtitle = ?'); values.push(input.subtitle); }
      if (input.duration_ms !== undefined) { fields.push('duration_ms = ?'); values.push(input.duration_ms); }
      if (input.start_type !== undefined) { fields.push('start_type = ?'); values.push(input.start_type); }
      if (input.hard_start_datetime !== undefined) { fields.push('hard_start_datetime = ?'); values.push(input.hard_start_datetime); }
      if (input.auto_start !== undefined) { fields.push('auto_start = ?'); values.push(fromBool(input.auto_start)); }
      if (input.locked !== undefined) { fields.push('locked = ?'); values.push(fromBool(input.locked)); }
      if (input.background_color !== undefined) { fields.push('background_color = ?'); values.push(input.background_color); }
      if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }
      if (input.group_id !== undefined) { fields.push('group_id = ?'); values.push(input.group_id); }
      if (input.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(input.sort_order); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE cues SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM cues WHERE id = ?').run(id);
      return result.changes > 0;
    },

    /** Przesuwa cue w rundownie — ustawia nowy sort_order */
    reorder(rundownId: string, cueIds: string[]): void {
      const stmt = db.prepare('UPDATE cues SET sort_order = ? WHERE id = ? AND rundown_id = ?');
      const transaction = db.transaction(() => {
        cueIds.forEach((cueId, index) => {
          stmt.run(index, cueId, rundownId);
        });
      });
      transaction();
    },
  };
}
