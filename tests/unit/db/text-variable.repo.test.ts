import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import { createTextVariableRepo } from '../../../electron/db/repositories/text-variable.repo';

describe('TextVariableRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createTextVariableRepo>;
  let rundownId: string;

  beforeEach(() => {
    db = createTestDb();
    repo = createTextVariableRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
  });

  afterEach(() => { db.close(); });

  it('powinno stworzyć zmienną tekstową', () => {
    const v = repo.create({ rundown_id: rundownId, key: 'host-name', value: 'Jan Kowalski' });
    expect(v.key).toBe('host-name');
    expect(v.value).toBe('Jan Kowalski');
  });

  it('powinno znaleźć zmienną po kluczu', () => {
    repo.create({ rundown_id: rundownId, key: 'venue', value: 'Kraków Arena' });
    const found = repo.findByKey(rundownId, 'venue');
    expect(found?.value).toBe('Kraków Arena');
  });

  it('powinno zwrócić mapę klucz→wartość', () => {
    repo.create({ rundown_id: rundownId, key: 'a', value: '1' });
    repo.create({ rundown_id: rundownId, key: 'b', value: '2' });
    const map = repo.getVariableMap(rundownId);
    expect(map).toEqual({ a: '1', b: '2' });
  });

  it('powinno upsertować — stworzyć lub zaktualizować', () => {
    repo.upsert(rundownId, 'host', 'Anna');
    expect(repo.findByKey(rundownId, 'host')?.value).toBe('Anna');

    repo.upsert(rundownId, 'host', 'Maria');
    expect(repo.findByKey(rundownId, 'host')?.value).toBe('Maria');
  });

  it('powinno rzucić błąd przy duplikacie (rundown_id, key)', () => {
    repo.create({ rundown_id: rundownId, key: 'dup' });
    expect(() => repo.create({ rundown_id: rundownId, key: 'dup' })).toThrow();
  });
});
