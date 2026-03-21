import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import { createColumnRepo } from '../../../electron/db/repositories/column.repo';

describe('ColumnRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createColumnRepo>;
  let rundownId: string;
  let userId: string;

  beforeEach(() => {
    db = createTestDb();
    repo = createColumnRepo(db);
    userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
  });

  afterEach(() => { db.close(); });

  it('powinno stworzyć kolumnę richtext', () => {
    const col = repo.create({ rundown_id: rundownId, name: 'Camera' });
    expect(col.type).toBe('richtext');
    expect(col.is_script).toBe(false);
    expect(col.width_px).toBe(200);
  });

  it('powinno stworzyć kolumnę dropdown z opcjami', () => {
    const col = repo.create({
      rundown_id: rundownId, name: 'Source', type: 'dropdown',
      dropdown_options: ['Cam 1', 'Cam 2', 'VT'],
    });
    expect(col.dropdown_options).toEqual(['Cam 1', 'Cam 2', 'VT']);
  });

  it('powinno stworzyć kolumnę script dla promptera', () => {
    const col = repo.create({ rundown_id: rundownId, name: 'Script', type: 'script', is_script: true });
    expect(col.is_script).toBe(true);
  });

  it('powinno zwrócić kolumny posortowane po sort_order', () => {
    repo.create({ rundown_id: rundownId, name: 'B', sort_order: 2 });
    repo.create({ rundown_id: rundownId, name: 'A', sort_order: 1 });
    const cols = repo.findByRundown(rundownId);
    expect(cols[0]!.name).toBe('A');
  });

  it('powinno zaktualizować dropdown_options', () => {
    const col = repo.create({ rundown_id: rundownId, name: 'S', type: 'dropdown', dropdown_options: ['A'] });
    const updated = repo.update(col.id, { dropdown_options: ['A', 'B'] });
    expect(updated?.dropdown_options).toEqual(['A', 'B']);
  });

  // ── Visibility ──

  it('powinno ustawić i odczytać widoczność kolumny per user', () => {
    const col = repo.create({ rundown_id: rundownId, name: 'V' });
    repo.setVisibility(col.id, userId, true);
    const vis = repo.getVisibility(col.id, userId);
    expect(vis?.hidden).toBe(true);
  });

  it('powinno nadpisać widoczność przy kolejnym ustawieniu', () => {
    const col = repo.create({ rundown_id: rundownId, name: 'V2' });
    repo.setVisibility(col.id, userId, true);
    repo.setVisibility(col.id, userId, false);
    const vis = repo.getVisibility(col.id, userId);
    expect(vis?.hidden).toBe(false);
  });

  it('powinno pobrać wszystkie widoczności kolumn użytkownika w rundownie (getVisibilitiesByUser)', () => {
    const c1 = repo.create({ rundown_id: rundownId, name: 'A' });
    const c2 = repo.create({ rundown_id: rundownId, name: 'B' });
    repo.setVisibility(c1.id, userId, true);
    repo.setVisibility(c2.id, userId, false);

    const vis = repo.getVisibilitiesByUser(rundownId, userId);
    expect(vis).toHaveLength(2);
    const hidden = vis.find(v => v.column_id === c1.id);
    const visible = vis.find(v => v.column_id === c2.id);
    expect(hidden?.hidden).toBe(true);
    expect(visible?.hidden).toBe(false);
  });

  // ── Reorder (Faza 12) ──

  it('powinno zmienić kolejność kolumn przez reorder', () => {
    const c1 = repo.create({ rundown_id: rundownId, name: 'A', sort_order: 0 });
    const c2 = repo.create({ rundown_id: rundownId, name: 'B', sort_order: 1 });
    const c3 = repo.create({ rundown_id: rundownId, name: 'C', sort_order: 2 });

    // Odwróć kolejność: C, B, A
    repo.reorder(rundownId, [c3.id, c2.id, c1.id]);

    const cols = repo.findByRundown(rundownId);
    expect(cols[0]!.name).toBe('C');
    expect(cols[0]!.sort_order).toBe(0);
    expect(cols[1]!.name).toBe('B');
    expect(cols[1]!.sort_order).toBe(1);
    expect(cols[2]!.name).toBe('A');
    expect(cols[2]!.sort_order).toBe(2);
  });

  it('powinno usunąć kolumnę i powiązane komórki (cascade)', () => {
    const col = repo.create({ rundown_id: rundownId, name: 'Del' });
    const deleted = repo.delete(col.id);
    expect(deleted).toBe(true);
    expect(repo.findById(col.id)).toBeUndefined();
  });
});
