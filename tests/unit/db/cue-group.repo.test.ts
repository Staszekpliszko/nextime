import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import { createCueGroupRepo } from '../../../electron/db/repositories/cue-group.repo';

describe('CueGroupRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createCueGroupRepo>;
  let rundownId: string;

  beforeEach(() => {
    db = createTestDb();
    repo = createCueGroupRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
  });

  afterEach(() => { db.close(); });

  it('powinno stworzyć grupę', () => {
    const g = repo.create({ rundown_id: rundownId, label: 'Act 1' });
    expect(g.label).toBe('Act 1');
    expect(g.collapsed).toBe(false);
  });

  it('powinno stworzyć grupę z kolorem', () => {
    const g = repo.create({ rundown_id: rundownId, label: 'Act 2', color: '#FF5722' });
    expect(g.color).toBe('#FF5722');
  });

  it('powinno zaktualizować collapsed', () => {
    const g = repo.create({ rundown_id: rundownId, label: 'G' });
    const updated = repo.update(g.id, { collapsed: true });
    expect(updated?.collapsed).toBe(true);
  });

  it('powinno usunąć grupę', () => {
    const g = repo.create({ rundown_id: rundownId, label: 'Del' });
    expect(repo.delete(g.id)).toBe(true);
    expect(repo.findById(g.id)).toBeUndefined();
  });
});
