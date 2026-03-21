import Database from 'better-sqlite3';
import { generateId } from './base';

// ── Typy ────────────────────────────────────────────────

export interface CameraPreset {
  id: string;
  project_id: string;
  number: number;
  label: string;
  color: string;
  default_channel: string;
  operator_name?: string;
}

export type CreateCameraPresetInput = {
  project_id: string;
  number: number;
  label?: string;
  color?: string;
  default_channel?: string;
  operator_name?: string;
};

export type UpdateCameraPresetInput = {
  label?: string;
  color?: string;
  default_channel?: string;
  operator_name?: string;
};

interface CameraPresetRow {
  id: string;
  project_id: string;
  number: number;
  label: string;
  color: string;
  default_channel: string;
  operator_name: string | null;
}

function rowToPreset(row: CameraPresetRow): CameraPreset {
  return {
    id: row.id,
    project_id: row.project_id,
    number: row.number,
    label: row.label,
    color: row.color,
    default_channel: row.default_channel,
    operator_name: row.operator_name ?? undefined,
  };
}

// ── Repo ────────────────────────────────────────────────

export function createCameraPresetRepo(db: Database.Database) {
  return {
    create(input: CreateCameraPresetInput): CameraPreset {
      const id = generateId();
      db.prepare(`
        INSERT INTO camera_presets (id, project_id, number, label, color, default_channel, operator_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.project_id, input.number,
        input.label ?? '',
        input.color ?? '#2196F3',
        input.default_channel ?? 'PGM',
        input.operator_name ?? null,
      );
      return this.findById(id)!;
    },

    findById(id: string): CameraPreset | undefined {
      const row = db.prepare('SELECT * FROM camera_presets WHERE id = ?').get(id) as CameraPresetRow | undefined;
      return row ? rowToPreset(row) : undefined;
    },

    findByProject(projectId: string): CameraPreset[] {
      const rows = db.prepare('SELECT * FROM camera_presets WHERE project_id = ? ORDER BY number').all(projectId) as CameraPresetRow[];
      return rows.map(rowToPreset);
    },

    update(id: string, input: UpdateCameraPresetInput): CameraPreset | undefined {
      const existing = this.findById(id);
      if (!existing) return undefined;

      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.label !== undefined) { fields.push('label = ?'); values.push(input.label); }
      if (input.color !== undefined) { fields.push('color = ?'); values.push(input.color); }
      if (input.default_channel !== undefined) { fields.push('default_channel = ?'); values.push(input.default_channel); }
      if (input.operator_name !== undefined) { fields.push('operator_name = ?'); values.push(input.operator_name); }

      if (fields.length === 0) return existing;

      values.push(id);
      db.prepare(`UPDATE camera_presets SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM camera_presets WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
