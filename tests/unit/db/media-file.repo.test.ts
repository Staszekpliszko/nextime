import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import { createActRepo } from '../../../electron/db/repositories/act.repo';
import { createMediaFileRepo } from '../../../electron/db/repositories/media-file.repo';

describe('MediaFileRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createMediaFileRepo>;
  let actId: string;

  beforeEach(() => {
    db = createTestDb();
    repo = createMediaFileRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    const rundownId = seedTestRundown(db, projectId);
    actId = createActRepo(db).create({ rundown_id: rundownId, name: 'Act' }).id;
  });

  afterEach(() => { db.close(); });

  it('powinno stworzyć plik audio', () => {
    const f = repo.create({ act_id: actId, file_name: 'track.wav', file_path: '/media/track.wav', media_type: 'audio' });
    expect(f.media_type).toBe('audio');
    expect(f.duration_frames).toBe(0);
  });

  it('powinno stworzyć plik z waveform_data', () => {
    const waveform = [0.1, 0.5, 0.8, 0.3, 0.2];
    const f = repo.create({
      act_id: actId, file_name: 'song.mp3', file_path: '/media/song.mp3',
      media_type: 'audio', duration_frames: 90000, waveform_data: waveform,
    });
    expect(f.waveform_data).toEqual(waveform);
    expect(f.duration_frames).toBe(90000);
  });

  it('powinno znaleźć pliki po act_id', () => {
    repo.create({ act_id: actId, file_name: 'a.wav', file_path: '/a.wav', media_type: 'audio' });
    repo.create({ act_id: actId, file_name: 'b.mp4', file_path: '/b.mp4', media_type: 'video' });
    expect(repo.findByAct(actId).length).toBe(2);
  });

  it('powinno usunąć plik', () => {
    const f = repo.create({ act_id: actId, file_name: 'del.wav', file_path: '/del.wav', media_type: 'audio' });
    expect(repo.delete(f.id)).toBe(true);
    expect(repo.findById(f.id)).toBeUndefined();
  });
});
