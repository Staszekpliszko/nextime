import Database from 'better-sqlite3';
import { generateId, parseJson, toJson } from './base';

export type OutputLayout = 'list' | 'single' | 'prompter';

export interface OutputSettings {
  logo?: 'on' | 'off' | string;
  background_color?: string;
  header_position?: 'top' | 'bottom';
  time_of_day?: 'on' | 'off';
  over_under?: 'on' | 'off';
  progress_bar?: 'on' | 'off';
  mirror?: 'off' | 'vertical' | 'horizontal' | 'vertical,horizontal';
  prompter_speed?: number;
  prompter_text_size?: number;
  prompter_margin?: number;
  prompter_indicator?: number;
  prompter_uppercase?: boolean;
  prompter_invert?: boolean;
  prompter_auto_scroll?: boolean;
}

export interface OutputConfig {
  id: string;
  rundown_id: string;
  name: string;
  layout: OutputLayout;
  column_id?: string;
  share_token: string;
  settings: OutputSettings;
  created_at: string;
  updated_at: string;
}

export type CreateOutputConfigInput = {
  rundown_id: string;
  name: string;
  layout?: OutputLayout;
  column_id?: string;
  share_token: string;
  settings?: OutputSettings;
};

export type UpdateOutputConfigInput = Partial<Omit<CreateOutputConfigInput, 'rundown_id' | 'share_token'>>;

interface OutputConfigRow {
  id: string;
  rundown_id: string;
  name: string;
  layout: string;
  column_id: string | null;
  share_token: string;
  settings: string;
  created_at: string;
  updated_at: string;
}

function rowToOutputConfig(row: OutputConfigRow): OutputConfig {
  return {
    id: row.id,
    rundown_id: row.rundown_id,
    name: row.name,
    layout: row.layout as OutputLayout,
    column_id: row.column_id ?? undefined,
    share_token: row.share_token,
    settings: parseJson<OutputSettings>(row.settings, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createOutputConfigRepo(db: Database.Database) {
  return {
    create(input: CreateOutputConfigInput): OutputConfig {
      const id = generateId();
      db.prepare(`
        INSERT INTO output_configs (id, rundown_id, name, layout, column_id, share_token, settings)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.rundown_id, input.name,
        input.layout ?? 'list', input.column_id ?? null,
        input.share_token, toJson(input.settings ?? {}),
      );
      return this.findById(id)!;
    },

    findById(id: string): OutputConfig | undefined {
      const row = db.prepare('SELECT * FROM output_configs WHERE id = ?').get(id) as OutputConfigRow | undefined;
      return row ? rowToOutputConfig(row) : undefined;
    },

    findByToken(token: string): OutputConfig | undefined {
      const row = db.prepare('SELECT * FROM output_configs WHERE share_token = ?').get(token) as OutputConfigRow | undefined;
      return row ? rowToOutputConfig(row) : undefined;
    },

    findByRundown(rundownId: string): OutputConfig[] {
      const rows = db.prepare(
        'SELECT * FROM output_configs WHERE rundown_id = ? ORDER BY name'
      ).all(rundownId) as OutputConfigRow[];
      return rows.map(rowToOutputConfig);
    },

    update(id: string, input: UpdateOutputConfigInput): OutputConfig | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
      if (input.layout !== undefined) { fields.push('layout = ?'); values.push(input.layout); }
      if (input.column_id !== undefined) { fields.push('column_id = ?'); values.push(input.column_id); }
      if (input.settings !== undefined) { fields.push('settings = ?'); values.push(toJson(input.settings)); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE output_configs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM output_configs WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
