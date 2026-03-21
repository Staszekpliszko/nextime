import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import { createCueRepo } from '../../../electron/db/repositories/cue.repo';
import { createColumnRepo } from '../../../electron/db/repositories/column.repo';
import { createCellRepo } from '../../../electron/db/repositories/cell.repo';

describe('CellRepo', () => {
  let db: Database.Database;
  let cellRepo: ReturnType<typeof createCellRepo>;
  let cueId: string;
  let columnId: string;

  beforeEach(() => {
    db = createTestDb();
    cellRepo = createCellRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    const rundownId = seedTestRundown(db, projectId);

    const cueRepo = createCueRepo(db);
    const colRepo = createColumnRepo(db);
    cueId = cueRepo.create({ rundown_id: rundownId, title: 'Cue 1' }).id;
    columnId = colRepo.create({ rundown_id: rundownId, name: 'Camera' }).id;
  });

  afterEach(() => { db.close(); });

  it('powinno stworzyć cell z richtext', () => {
    const richtextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'MCU Lead' }] }] };
    const cell = cellRepo.create({ cue_id: cueId, column_id: columnId, richtext: richtextDoc });
    expect(cell.content_type).toBe('richtext');
    expect(cell.richtext).toEqual(richtextDoc);
  });

  it('powinno stworzyć cell z dropdown_value', () => {
    const cell = cellRepo.create({
      cue_id: cueId, column_id: columnId,
      content_type: 'dropdown_value', dropdown_value: 'Cam 1',
    });
    expect(cell.dropdown_value).toBe('Cam 1');
  });

  it('powinno znaleźć cell po cue i kolumnie', () => {
    cellRepo.create({ cue_id: cueId, column_id: columnId, dropdown_value: 'V' });
    const found = cellRepo.findByCueAndColumn(cueId, columnId);
    expect(found).toBeDefined();
  });

  it('powinno upsertować cell', () => {
    cellRepo.upsert({ cue_id: cueId, column_id: columnId, dropdown_value: 'A' });
    expect(cellRepo.findByCueAndColumn(cueId, columnId)?.dropdown_value).toBe('A');

    cellRepo.upsert({ cue_id: cueId, column_id: columnId, dropdown_value: 'B' });
    expect(cellRepo.findByCueAndColumn(cueId, columnId)?.dropdown_value).toBe('B');
  });

  it('powinno znaleźć wszystkie cells cue', () => {
    const colRepo = createColumnRepo(db);
    const col2 = colRepo.create({ rundown_id: 'test-rundown-001', name: 'Script' });

    cellRepo.create({ cue_id: cueId, column_id: columnId, dropdown_value: '1' });
    cellRepo.create({ cue_id: cueId, column_id: col2.id, dropdown_value: '2' });

    const cells = cellRepo.findByCue(cueId);
    expect(cells.length).toBe(2);
  });

  it('powinno rzucić błąd przy duplikacie (cue_id, column_id)', () => {
    cellRepo.create({ cue_id: cueId, column_id: columnId });
    expect(() => cellRepo.create({ cue_id: cueId, column_id: columnId })).toThrow();
  });
});
