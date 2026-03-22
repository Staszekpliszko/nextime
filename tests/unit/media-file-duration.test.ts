import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createMediaFileRepo } from '../../electron/db/repositories/media-file.repo';
import type Database from 'better-sqlite3';

/** Helper — tworzy akt (brak seedTestAct w helperach) */
function seedTestAct(db: Database.Database, rundownId: string): string {
  const id = `act-test-${Date.now()}`;
  db.prepare(`
    INSERT INTO acts (id, rundown_id, name, sort_order, duration_frames, tc_offset_frames, fps, status, color)
    VALUES (?, ?, 'Test Act', 0, 0, 0, 25, 'draft', '#2196F3')
  `).run(id, rundownId);
  return id;
}

describe('MediaFileRepo — updateDurationAndWaveform (Faza 23)', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createMediaFileRepo>;
  let actId: string;

  beforeEach(() => {
    db = createTestDb();
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    const rundownId = seedTestRundown(db, projectId);
    actId = seedTestAct(db, rundownId);
    repo = createMediaFileRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it('powinno zaktualizować duration i waveform', () => {
    const file = repo.create({
      act_id: actId,
      file_name: 'song.mp3',
      file_path: '/media/song.mp3',
      media_type: 'audio',
    });
    expect(file.duration_frames).toBe(0);
    expect(file.waveform_data).toBeUndefined();

    const waveform = [0.1, 0.5, 0.9, 1.0, 0.7, 0.3];
    const updated = repo.updateDurationAndWaveform(file.id, 7500, waveform);
    expect(updated).toBeDefined();
    expect(updated!.duration_frames).toBe(7500);
    expect(updated!.waveform_data).toEqual(waveform);
  });

  it('powinno zaktualizować duration bez waveform', () => {
    const file = repo.create({
      act_id: actId,
      file_name: 'clip.mp4',
      file_path: '/media/clip.mp4',
      media_type: 'video',
    });

    const updated = repo.updateDurationAndWaveform(file.id, 3000);
    expect(updated).toBeDefined();
    expect(updated!.duration_frames).toBe(3000);
    expect(updated!.waveform_data).toBeUndefined();
  });

  it('powinno zwrócić undefined dla nieistniejącego id', () => {
    const result = repo.updateDurationAndWaveform('nonexistent-id', 100, [0.5]);
    expect(result).toBeUndefined();
  });
});
