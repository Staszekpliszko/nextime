import Database from 'better-sqlite3';
import { generateId, parseJson, toJson } from './base';

export interface MediaFile {
  id: string;
  act_id: string;
  file_name: string;
  file_path: string;
  media_type: 'audio' | 'video';
  duration_frames: number;
  waveform_data?: number[];
  created_at: string;
}

export type CreateMediaFileInput = {
  act_id: string;
  file_name: string;
  file_path: string;
  media_type: 'audio' | 'video';
  duration_frames?: number;
  waveform_data?: number[];
};

interface MediaFileRow {
  id: string;
  act_id: string;
  file_name: string;
  file_path: string;
  media_type: string;
  duration_frames: number;
  waveform_data: string | null;
  created_at: string;
}

function rowToMediaFile(row: MediaFileRow): MediaFile {
  return {
    id: row.id,
    act_id: row.act_id,
    file_name: row.file_name,
    file_path: row.file_path,
    media_type: row.media_type as 'audio' | 'video',
    duration_frames: row.duration_frames,
    waveform_data: parseJson<number[] | undefined>(row.waveform_data, undefined),
    created_at: row.created_at,
  };
}

export function createMediaFileRepo(db: Database.Database) {
  return {
    create(input: CreateMediaFileInput): MediaFile {
      const id = generateId();
      db.prepare(`
        INSERT INTO media_files (id, act_id, file_name, file_path, media_type, duration_frames, waveform_data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.act_id, input.file_name, input.file_path,
        input.media_type, input.duration_frames ?? 0,
        input.waveform_data ? toJson(input.waveform_data) : null,
      );
      return this.findById(id)!;
    },

    findById(id: string): MediaFile | undefined {
      const row = db.prepare('SELECT * FROM media_files WHERE id = ?').get(id) as MediaFileRow | undefined;
      return row ? rowToMediaFile(row) : undefined;
    },

    findByAct(actId: string): MediaFile[] {
      const rows = db.prepare('SELECT * FROM media_files WHERE act_id = ?').all(actId) as MediaFileRow[];
      return rows.map(rowToMediaFile);
    },

    /** Aktualizuje duration i waveform pliku media (po ffprobe) */
    updateDurationAndWaveform(id: string, durationFrames: number, waveformData?: number[]): MediaFile | undefined {
      const result = db.prepare(`
        UPDATE media_files SET duration_frames = ?, waveform_data = ? WHERE id = ?
      `).run(
        durationFrames,
        waveformData ? toJson(waveformData) : null,
        id,
      );
      if (result.changes === 0) return undefined;
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM media_files WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
