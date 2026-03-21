import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import { createActRepo } from '../../../electron/db/repositories/act.repo';
import { createTrackRepo } from '../../../electron/db/repositories/track.repo';

describe('TrackRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createTrackRepo>;
  let actId: string;

  beforeEach(() => {
    db = createTestDb();
    repo = createTrackRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    const rundownId = seedTestRundown(db, projectId);
    actId = createActRepo(db).create({ rundown_id: rundownId, name: 'Act 1' }).id;
  });

  afterEach(() => { db.close(); });

  it('powinno stworzyć track vision z domyślnymi wartościami', () => {
    const t = repo.create({ act_id: actId, type: 'vision', name: 'Vision PGM' });
    expect(t.enabled).toBe(true);
    expect(t.height_px).toBe(48);
    expect(t.settings).toEqual({});
  });

  it('powinno stworzyć track z custom settings', () => {
    const t = repo.create({
      act_id: actId, type: 'osc', name: 'Lighting OSC',
      settings: { host: '192.168.1.10', port: 8000 },
    });
    expect(t.settings).toEqual({ host: '192.168.1.10', port: 8000 });
  });

  it('powinno znaleźć tracki posortowane po sort_order', () => {
    repo.create({ act_id: actId, type: 'vision', name: 'V', sort_order: 1 });
    repo.create({ act_id: actId, type: 'lyrics', name: 'L', sort_order: 0 });
    const tracks = repo.findByAct(actId);
    expect(tracks[0]!.name).toBe('L');
  });

  it('powinno zaktualizować enabled i settings', () => {
    const t = repo.create({ act_id: actId, type: 'midi', name: 'MIDI' });
    const updated = repo.update(t.id, {
      enabled: false,
      settings: { midi_channel: 2, device_name: 'IAC' },
    });
    expect(updated?.enabled).toBe(false);
    expect(updated?.settings).toEqual({ midi_channel: 2, device_name: 'IAC' });
  });
});
