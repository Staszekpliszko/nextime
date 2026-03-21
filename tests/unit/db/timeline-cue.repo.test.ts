import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import { createActRepo } from '../../../electron/db/repositories/act.repo';
import { createTrackRepo } from '../../../electron/db/repositories/track.repo';
import { createTimelineCueRepo } from '../../../electron/db/repositories/timeline-cue.repo';

describe('TimelineCueRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createTimelineCueRepo>;
  let actId: string;
  let trackId: string;

  beforeEach(() => {
    db = createTestDb();
    repo = createTimelineCueRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    const rundownId = seedTestRundown(db, projectId);
    actId = createActRepo(db).create({ rundown_id: rundownId, name: 'Act' }).id;
    trackId = createTrackRepo(db).create({ act_id: actId, type: 'vision', name: 'V' }).id;
  });

  afterEach(() => { db.close(); });

  it('powinno stworzyć vision cue z JSON data', () => {
    const cue = repo.create({
      track_id: trackId, act_id: actId, type: 'vision',
      tc_in_frames: 100, tc_out_frames: 250,
      data: { camera_number: 1, shot_name: 'MCU LEAD', shot_description: '', director_notes: '', operator_note: '' },
    });
    expect(cue.data).toEqual({
      camera_number: 1, shot_name: 'MCU LEAD',
      shot_description: '', director_notes: '', operator_note: '',
    });
    expect(cue.tc_in_frames).toBe(100);
    expect(cue.tc_out_frames).toBe(250);
  });

  it('powinno stworzyć cue punktowy (bez tc_out_frames)', () => {
    const cue = repo.create({
      track_id: trackId, act_id: actId, type: 'marker',
      tc_in_frames: 500,
      data: { label: 'PYRO', color: '#FF5722', pre_warn_frames: 50, has_duration: false },
    });
    expect(cue.tc_out_frames).toBeUndefined();
  });

  it('powinno znaleźć cues po tracku posortowane po tc_in_frames', () => {
    repo.create({ track_id: trackId, act_id: actId, type: 'vision', tc_in_frames: 200, tc_out_frames: 300 });
    repo.create({ track_id: trackId, act_id: actId, type: 'vision', tc_in_frames: 100, tc_out_frames: 200 });
    const cues = repo.findByTrack(trackId);
    expect(cues[0]!.tc_in_frames).toBe(100);
  });

  it('powinno znaleźć cues po typie', () => {
    repo.create({ track_id: trackId, act_id: actId, type: 'vision', tc_in_frames: 0, tc_out_frames: 100 });
    const lyricsTrackId = createTrackRepo(db).create({ act_id: actId, type: 'lyrics', name: 'L' }).id;
    repo.create({ track_id: lyricsTrackId, act_id: actId, type: 'lyric', tc_in_frames: 50 });

    const visions = repo.findByActAndType(actId, 'vision');
    expect(visions.length).toBe(1);
    const lyrics = repo.findByActAndType(actId, 'lyric');
    expect(lyrics.length).toBe(1);
  });

  it('powinno znaleźć aktywny cue na danej klatce', () => {
    repo.create({
      track_id: trackId, act_id: actId, type: 'vision',
      tc_in_frames: 100, tc_out_frames: 300,
      data: { camera_number: 1, shot_name: 'A' },
    });
    repo.create({
      track_id: trackId, act_id: actId, type: 'vision',
      tc_in_frames: 300, tc_out_frames: 500,
      data: { camera_number: 2, shot_name: 'B' },
    });

    const at150 = repo.findActiveAtFrame(actId, 'vision', 150);
    expect(at150?.data).toHaveProperty('shot_name', 'A');

    const at350 = repo.findActiveAtFrame(actId, 'vision', 350);
    expect(at350?.data).toHaveProperty('shot_name', 'B');

    const at600 = repo.findActiveAtFrame(actId, 'vision', 600);
    expect(at600).toBeUndefined();
  });

  it('powinno zaktualizować pozycję i dane cue', () => {
    const cue = repo.create({
      track_id: trackId, act_id: actId, type: 'vision',
      tc_in_frames: 0, tc_out_frames: 100,
      data: { camera_number: 1 },
    });
    const updated = repo.update(cue.id, {
      tc_in_frames: 50, tc_out_frames: 200,
      data: { camera_number: 3, shot_name: 'WS' },
    });
    expect(updated?.tc_in_frames).toBe(50);
    expect(updated?.tc_out_frames).toBe(200);
    expect(updated?.data).toEqual({ camera_number: 3, shot_name: 'WS' });
  });

  it('powinno rzucić błąd gdy tc_out_frames <= tc_in_frames', () => {
    expect(() => repo.create({
      track_id: trackId, act_id: actId, type: 'vision',
      tc_in_frames: 100, tc_out_frames: 50,
    })).toThrow();
  });
});
