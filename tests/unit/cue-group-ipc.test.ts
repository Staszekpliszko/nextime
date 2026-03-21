import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueGroupRepo } from '../../electron/db/repositories/cue-group.repo';
import type Database from 'better-sqlite3';

describe('CueGroup IPC (repo layer)', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createCueGroupRepo>;
  let rundownId: string;

  beforeEach(() => {
    db = createTestDb();
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
    repo = createCueGroupRepo(db);
  });

  it('tworzy grupe', () => {
    const g = repo.create({ rundown_id: rundownId, label: 'Segment 1' });
    expect(g.label).toBe('Segment 1');
    expect(g.collapsed).toBe(false);
  });

  it('tworzy grupe z kolorem', () => {
    const g = repo.create({ rundown_id: rundownId, label: 'VIP', color: '#FF5722' });
    expect(g.color).toBe('#FF5722');
  });

  it('pobiera po rundown posortowane', () => {
    repo.create({ rundown_id: rundownId, label: 'B', sort_order: 2 });
    repo.create({ rundown_id: rundownId, label: 'A', sort_order: 1 });
    const list = repo.findByRundown(rundownId);
    expect(list.length).toBe(2);
    expect(list[0]!.label).toBe('A');
    expect(list[1]!.label).toBe('B');
  });

  it('aktualizuje label', () => {
    const g = repo.create({ rundown_id: rundownId, label: 'Old' });
    const updated = repo.update(g.id, { label: 'New' });
    expect(updated!.label).toBe('New');
  });

  it('aktualizuje collapsed', () => {
    const g = repo.create({ rundown_id: rundownId, label: 'Test' });
    expect(g.collapsed).toBe(false);
    const updated = repo.update(g.id, { collapsed: true });
    expect(updated!.collapsed).toBe(true);
  });

  it('usuwa grupe', () => {
    const g = repo.create({ rundown_id: rundownId, label: 'Del' });
    expect(repo.delete(g.id)).toBe(true);
    expect(repo.findById(g.id)).toBeUndefined();
  });

  it('zwraca false dla nieistniejacego ID', () => {
    expect(repo.delete('nonexistent')).toBe(false);
  });

  it('zwraca undefined dla nieistniejacego findById', () => {
    expect(repo.findById('nonexistent')).toBeUndefined();
  });
});
