import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject } from '../../helpers/test-db';
import { createRundownRepo } from '../../../electron/db/repositories/rundown.repo';

describe('RundownRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createRundownRepo>;
  let projectId: string;

  beforeEach(() => {
    db = createTestDb();
    repo = createRundownRepo(db);
    const userId = seedTestUser(db);
    projectId = seedTestProject(db, userId);
  });

  afterEach(() => { db.close(); });

  it('powinno stworzyć rundown z domyślnymi wartościami', () => {
    const r = repo.create({ project_id: projectId, name: 'Show 1' });
    expect(r.status).toBe('draft');
    expect(r.sort_order).toBe(0);
  });

  it('powinno stworzyć rundown z datą i godziną', () => {
    const r = repo.create({ project_id: projectId, name: 'Gala', show_date: '2025-06-01', show_time: '20:00:00' });
    expect(r.show_date).toBe('2025-06-01');
    expect(r.show_time).toBe('20:00:00');
  });

  it('powinno znaleźć rundowny po project_id', () => {
    repo.create({ project_id: projectId, name: 'A', sort_order: 1 });
    repo.create({ project_id: projectId, name: 'B', sort_order: 0 });
    const list = repo.findByProject(projectId);
    expect(list.length).toBe(2);
    expect(list[0]!.name).toBe('B'); // sort_order 0 first
  });

  it('powinno zaktualizować status', () => {
    const r = repo.create({ project_id: projectId, name: 'S' });
    const updated = repo.update(r.id, { status: 'live' });
    expect(updated?.status).toBe('live');
  });

  it('powinno usunąć rundown', () => {
    const r = repo.create({ project_id: projectId, name: 'D' });
    expect(repo.delete(r.id)).toBe(true);
    expect(repo.findById(r.id)).toBeUndefined();
  });
});
