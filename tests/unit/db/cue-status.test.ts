import { describe, it, expect, beforeEach } from 'vitest';
import { createCueRepo } from '../../../electron/db/repositories/cue.repo';
import { createTestDb, seedTestUser, seedTestEvent, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import type Database from 'better-sqlite3';

let db: Database.Database;
let cueRepo: ReturnType<typeof createCueRepo>;

beforeEach(() => {
  db = createTestDb();
  const userId = seedTestUser(db);
  const eventId = seedTestEvent(db, userId);
  const projectId = seedTestProject(db, userId, { event_id: eventId });
  seedTestRundown(db, projectId, { id: 'r1' });

  cueRepo = createCueRepo(db);
});

describe('Cue status — DB + repo', () => {
  it('nowy cue ma domyślny status "ready"', () => {
    const cue = cueRepo.create({ rundown_id: 'r1', title: 'Test' });
    expect(cue.status).toBe('ready');
  });

  it('tworzy cue z podanym statusem', () => {
    const cue = cueRepo.create({ rundown_id: 'r1', title: 'Test', status: 'standby' });
    expect(cue.status).toBe('standby');
  });

  it('update zmienia status cue', () => {
    const cue = cueRepo.create({ rundown_id: 'r1', title: 'Test' });
    const updated = cueRepo.update(cue.id, { status: 'done' });
    expect(updated!.status).toBe('done');
  });

  it('findByRundown zwraca cue ze statusem', () => {
    cueRepo.create({ rundown_id: 'r1', title: 'A', status: 'ready' });
    cueRepo.create({ rundown_id: 'r1', title: 'B', status: 'skipped' });

    const cues = cueRepo.findByRundown('r1');
    expect(cues).toHaveLength(2);
    expect(cues[0]!.status).toBe('ready');
    expect(cues[1]!.status).toBe('skipped');
  });

  it('status ma constraint — nie można ustawić nieprawidłowej wartości', () => {
    const cue = cueRepo.create({ rundown_id: 'r1', title: 'Test' });
    expect(() => {
      db.prepare('UPDATE cues SET status = ? WHERE id = ?').run('invalid', cue.id);
    }).toThrow();
  });
});
