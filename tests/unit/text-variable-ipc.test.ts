import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createTextVariableRepo } from '../../electron/db/repositories/text-variable.repo';
import type Database from 'better-sqlite3';

describe('TextVariable IPC (repo layer)', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createTextVariableRepo>;
  let rundownId: string;

  beforeEach(() => {
    db = createTestDb();
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
    repo = createTextVariableRepo(db);
  });

  it('tworzy zmienna', () => {
    const v = repo.create({ rundown_id: rundownId, key: 'host-name', value: 'Jan' });
    expect(v.key).toBe('host-name');
    expect(v.value).toBe('Jan');
  });

  it('tworzy zmienna z opisem', () => {
    const v = repo.create({ rundown_id: rundownId, key: 'venue', value: 'Studio A', description: 'Lokalizacja' });
    expect(v.description).toBe('Lokalizacja');
  });

  it('pobiera po rundown', () => {
    repo.create({ rundown_id: rundownId, key: 'aaa', value: '1' });
    repo.create({ rundown_id: rundownId, key: 'bbb', value: '2' });
    const list = repo.findByRundown(rundownId);
    expect(list.length).toBe(2);
    // Posortowane po key
    expect(list[0]!.key).toBe('aaa');
    expect(list[1]!.key).toBe('bbb');
  });

  it('pobiera po kluczu', () => {
    repo.create({ rundown_id: rundownId, key: 'test', value: 'v' });
    const found = repo.findByKey(rundownId, 'test');
    expect(found).toBeDefined();
    expect(found!.value).toBe('v');
  });

  it('zwraca undefined dla nieistniejacego klucza', () => {
    expect(repo.findByKey(rundownId, 'nope')).toBeUndefined();
  });

  it('aktualizuje wartosc', () => {
    const v = repo.create({ rundown_id: rundownId, key: 'x', value: 'old' });
    const updated = repo.update(v.id, { value: 'new' });
    expect(updated!.value).toBe('new');
  });

  it('usuwa zmienna', () => {
    const v = repo.create({ rundown_id: rundownId, key: 'del', value: 'v' });
    expect(repo.delete(v.id)).toBe(true);
    expect(repo.findById(v.id)).toBeUndefined();
  });

  it('upsert — tworzenie', () => {
    const v = repo.upsert(rundownId, 'new-key', 'val');
    expect(v.key).toBe('new-key');
    expect(v.value).toBe('val');
  });

  it('upsert — aktualizacja', () => {
    repo.create({ rundown_id: rundownId, key: 'up', value: 'v1' });
    const v = repo.upsert(rundownId, 'up', 'v2');
    expect(v.value).toBe('v2');
    // Tylko jedna zmienna z tym kluczem
    expect(repo.findByRundown(rundownId).length).toBe(1);
  });

  it('getVariableMap buduje mape', () => {
    repo.create({ rundown_id: rundownId, key: 'a', value: '1' });
    repo.create({ rundown_id: rundownId, key: 'b', value: '2' });
    const map = repo.getVariableMap(rundownId);
    expect(map).toEqual({ a: '1', b: '2' });
  });
});
