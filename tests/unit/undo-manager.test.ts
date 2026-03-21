import { describe, it, expect, beforeEach } from 'vitest';
import {
  UndoManager,
  createCueCommand,
  deleteCueCommand,
  updateCueCommand,
  reorderCuesCommand,
  createColumnCommand,
  deleteColumnCommand,
  updateColumnCommand,
  updateCellCommand,
  createCueGroupCommand,
  deleteCueGroupCommand,
  updateCueGroupCommand,
  createTextVariableCommand,
  deleteTextVariableCommand,
  updateTextVariableCommand,
} from '../../electron/undo-manager';
import { createTestDb, seedTestUser, seedTestEvent, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createColumnRepo } from '../../electron/db/repositories/column.repo';
import { createCellRepo } from '../../electron/db/repositories/cell.repo';
import { createCueGroupRepo } from '../../electron/db/repositories/cue-group.repo';
import { createTextVariableRepo } from '../../electron/db/repositories/text-variable.repo';
import type Database from 'better-sqlite3';

// ── Helpers ─────────────────────────────────────────────────────

let db: Database.Database;
let rundownId: string;
let cueRepo: ReturnType<typeof createCueRepo>;
let columnRepo: ReturnType<typeof createColumnRepo>;
let cellRepo: ReturnType<typeof createCellRepo>;
let cueGroupRepo: ReturnType<typeof createCueGroupRepo>;
let textVariableRepo: ReturnType<typeof createTextVariableRepo>;

beforeEach(() => {
  db = createTestDb();
  const userId = seedTestUser(db);
  const eventId = seedTestEvent(db, userId);
  const projectId = seedTestProject(db, userId, { event_id: eventId });
  rundownId = seedTestRundown(db, projectId);
  cueRepo = createCueRepo(db);
  columnRepo = createColumnRepo(db);
  cellRepo = createCellRepo(db);
  cueGroupRepo = createCueGroupRepo(db);
  textVariableRepo = createTextVariableRepo(db);
});

// ── Testy UndoManager ───────────────────────────────────────────

describe('UndoManager — podstawowe operacje', () => {
  it('domyślnie canUndo=false, canRedo=false', () => {
    const mgr = new UndoManager();
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.getUndoDescription()).toBe('');
    expect(mgr.getRedoDescription()).toBe('');
  });

  it('push → canUndo=true, canRedo=false', () => {
    const mgr = new UndoManager();
    mgr.pushCommand({ execute() {}, undo() {}, description: 'test' });
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.getUndoDescription()).toBe('test');
  });

  it('push + undo → canUndo=false, canRedo=true', () => {
    const mgr = new UndoManager();
    let undone = false;
    mgr.pushCommand({ execute() {}, undo() { undone = true; }, description: 'op1' });
    const result = mgr.undo();
    expect(result).toBe(true);
    expect(undone).toBe(true);
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(true);
    expect(mgr.getRedoDescription()).toBe('op1');
  });

  it('push + undo + redo → canUndo=true, canRedo=false', () => {
    const mgr = new UndoManager();
    let executed = 0;
    mgr.pushCommand({ execute() { executed++; }, undo() {}, description: 'op1' });
    mgr.undo();
    const result = mgr.redo();
    expect(result).toBe(true);
    expect(executed).toBe(1); // execute wywołany przy redo
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);
  });

  it('undo na pustym stosie → false', () => {
    const mgr = new UndoManager();
    expect(mgr.undo()).toBe(false);
  });

  it('redo na pustym stosie → false', () => {
    const mgr = new UndoManager();
    expect(mgr.redo()).toBe(false);
  });

  it('nowy push po undo czyści redo stack', () => {
    const mgr = new UndoManager();
    mgr.pushCommand({ execute() {}, undo() {}, description: 'op1' });
    mgr.undo();
    expect(mgr.canRedo()).toBe(true);
    mgr.pushCommand({ execute() {}, undo() {}, description: 'op2' });
    expect(mgr.canRedo()).toBe(false);
  });

  it('limit 50 operacji — 51-szy wyrzuca najstarszy', () => {
    const mgr = new UndoManager();
    for (let i = 0; i < 51; i++) {
      mgr.pushCommand({ execute() {}, undo() {}, description: `op${i}` });
    }
    expect(mgr.undoSize).toBe(50);
    // Najstarszy (op0) wyrzucony — najstarszy to teraz op1
    expect(mgr.getUndoDescription()).toBe('op50');
  });

  it('clear() czyści oba stosy', () => {
    const mgr = new UndoManager();
    mgr.pushCommand({ execute() {}, undo() {}, description: 'op1' });
    mgr.pushCommand({ execute() {}, undo() {}, description: 'op2' });
    mgr.undo(); // op2 → redo
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(true);
    mgr.clear();
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.undoSize).toBe(0);
    expect(mgr.redoSize).toBe(0);
  });
});

// ── Testy komend Cue ────────────────────────────────────────────

describe('UndoManager — komendy Cue', () => {
  it('createCueCommand roundtrip: create → undo (usunięty) → redo (wrócił)', () => {
    const cue = cueRepo.create({ rundown_id: rundownId, title: 'Cue A' });
    const cmd = createCueCommand(cue, { cueRepo, cellRepo });

    // Undo = delete
    cmd.undo();
    expect(cueRepo.findById(cue.id)).toBeUndefined();

    // Redo = re-create
    cmd.execute();
    const restored = cueRepo.findByRundown(rundownId);
    expect(restored.length).toBe(1);
    expect(restored[0]!.title).toBe('Cue A');
  });

  it('deleteCueCommand roundtrip z cells', () => {
    const cue = cueRepo.create({ rundown_id: rundownId, title: 'Cue B' });
    const col = columnRepo.create({ rundown_id: rundownId, name: 'Notatki' });
    cellRepo.upsert({ cue_id: cue.id, column_id: col.id, richtext: { text: 'hello' } });

    const cells = cellRepo.findByCue(cue.id);
    const snapshot = { cue, cells };

    // Wykonaj delete
    cueRepo.delete(cue.id);
    expect(cueRepo.findById(cue.id)).toBeUndefined();
    expect(cellRepo.findByCue(cue.id)).toHaveLength(0);

    // Undo = odtwórz cue + cells
    const cmd = deleteCueCommand(snapshot, { cueRepo, cellRepo });
    cmd.undo();

    const restoredCues = cueRepo.findByRundown(rundownId);
    expect(restoredCues.length).toBe(1);
    expect(restoredCues[0]!.title).toBe('Cue B');

    const restoredCells = cellRepo.findByCue(restoredCues[0]!.id);
    expect(restoredCells.length).toBe(1);

    // Redo = delete znowu
    cmd.execute();
    expect(cueRepo.findByRundown(rundownId)).toHaveLength(0);
  });

  it('updateCueCommand roundtrip', () => {
    const cue = cueRepo.create({ rundown_id: rundownId, title: 'Cue C', duration_ms: 5000 });

    const oldData = { title: 'Cue C' };
    const newData = { title: 'Cue C zmieniony' };
    const cmd = updateCueCommand(cue.id, oldData, newData, { cueRepo }, 'Cue C');

    // Execute = update z newData
    cmd.execute();
    expect(cueRepo.findById(cue.id)!.title).toBe('Cue C zmieniony');

    // Undo = update z oldData
    cmd.undo();
    expect(cueRepo.findById(cue.id)!.title).toBe('Cue C');
  });

  it('reorderCuesCommand roundtrip', () => {
    const c1 = cueRepo.create({ rundown_id: rundownId, title: 'Cue 1', sort_order: 0 });
    const c2 = cueRepo.create({ rundown_id: rundownId, title: 'Cue 2', sort_order: 1 });
    const c3 = cueRepo.create({ rundown_id: rundownId, title: 'Cue 3', sort_order: 2 });

    const oldOrder = [c1.id, c2.id, c3.id];
    const newOrder = [c3.id, c1.id, c2.id];
    const cmd = reorderCuesCommand(rundownId, oldOrder, newOrder, { cueRepo });

    // Execute = nowa kolejność
    cmd.execute();
    const reordered = cueRepo.findByRundown(rundownId);
    expect(reordered[0]!.id).toBe(c3.id);
    expect(reordered[1]!.id).toBe(c1.id);
    expect(reordered[2]!.id).toBe(c2.id);

    // Undo = stara kolejność
    cmd.undo();
    const restored = cueRepo.findByRundown(rundownId);
    expect(restored[0]!.id).toBe(c1.id);
    expect(restored[1]!.id).toBe(c2.id);
    expect(restored[2]!.id).toBe(c3.id);
  });
});

// ── Testy komend Column ─────────────────────────────────────────

describe('UndoManager — komendy Column', () => {
  it('createColumnCommand → undo usunie, redo odtworzy', () => {
    const col = columnRepo.create({ rundown_id: rundownId, name: 'Kamera' });
    const cmd = createColumnCommand(col, { columnRepo });

    cmd.undo();
    expect(columnRepo.findById(col.id)).toBeUndefined();

    cmd.execute();
    const all = columnRepo.findByRundown(rundownId);
    expect(all.some(c => c.name === 'Kamera')).toBe(true);
  });

  it('deleteColumnCommand → undo odtworzy', () => {
    const col = columnRepo.create({ rundown_id: rundownId, name: 'Audio' });
    const cmd = deleteColumnCommand(col, { columnRepo });

    cmd.execute();
    expect(columnRepo.findById(col.id)).toBeUndefined();

    cmd.undo();
    const all = columnRepo.findByRundown(rundownId);
    expect(all.some(c => c.name === 'Audio')).toBe(true);
  });

  it('updateColumnCommand roundtrip', () => {
    const col = columnRepo.create({ rundown_id: rundownId, name: 'Notatki' });
    const cmd = updateColumnCommand(col.id, { name: 'Notatki' }, { name: 'Uwagi' }, { columnRepo }, 'Notatki');

    cmd.execute();
    expect(columnRepo.findById(col.id)!.name).toBe('Uwagi');

    cmd.undo();
    expect(columnRepo.findById(col.id)!.name).toBe('Notatki');
  });
});

// ── Testy komend Cell ───────────────────────────────────────────

describe('UndoManager — komendy Cell', () => {
  it('updateCellCommand roundtrip (nowa komórka → undo → usunięta)', () => {
    const cue = cueRepo.create({ rundown_id: rundownId, title: 'Cue X' });
    const col = columnRepo.create({ rundown_id: rundownId, name: 'Notatki' });

    const cmd = updateCellCommand(
      cue.id, col.id,
      null, // nie istniała
      { content_type: 'richtext', richtext: { text: 'nowy' } },
      { cellRepo },
    );

    // Execute = upsert
    cmd.execute();
    const cells = cellRepo.findByCue(cue.id);
    expect(cells.length).toBe(1);

    // Undo = komórka nie istniała → usuń
    cmd.undo();
    expect(cellRepo.findByCue(cue.id)).toHaveLength(0);
  });

  it('updateCellCommand roundtrip (istniejąca komórka)', () => {
    const cue = cueRepo.create({ rundown_id: rundownId, title: 'Cue Y' });
    const col = columnRepo.create({ rundown_id: rundownId, name: 'Info' });
    cellRepo.upsert({ cue_id: cue.id, column_id: col.id, richtext: { text: 'stary' } });

    const cmd = updateCellCommand(
      cue.id, col.id,
      { content_type: 'richtext', richtext: { text: 'stary' } },
      { content_type: 'richtext', richtext: { text: 'nowy' } },
      { cellRepo },
    );

    cmd.execute();
    const cells = cellRepo.findByCue(cue.id);
    expect(cells[0]!.richtext).toEqual({ text: 'nowy' });

    cmd.undo();
    const restored = cellRepo.findByCue(cue.id);
    expect(restored[0]!.richtext).toEqual({ text: 'stary' });
  });
});

// ── Testy komend CueGroup ───────────────────────────────────────

describe('UndoManager — komendy CueGroup', () => {
  it('createCueGroupCommand → undo usunie', () => {
    const group = cueGroupRepo.create({ rundown_id: rundownId, label: 'Akt 1' });
    const cmd = createCueGroupCommand(group, { cueGroupRepo });

    cmd.undo();
    expect(cueGroupRepo.findById(group.id)).toBeUndefined();

    cmd.execute();
    expect(cueGroupRepo.findByRundown(rundownId).some(g => g.label === 'Akt 1')).toBe(true);
  });

  it('deleteCueGroupCommand → undo odtworzy', () => {
    const group = cueGroupRepo.create({ rundown_id: rundownId, label: 'Akt 2' });
    const cmd = deleteCueGroupCommand(group, { cueGroupRepo });

    cmd.execute();
    expect(cueGroupRepo.findById(group.id)).toBeUndefined();

    cmd.undo();
    expect(cueGroupRepo.findByRundown(rundownId).some(g => g.label === 'Akt 2')).toBe(true);
  });

  it('updateCueGroupCommand roundtrip', () => {
    const group = cueGroupRepo.create({ rundown_id: rundownId, label: 'Blok A' });
    const cmd = updateCueGroupCommand(group.id, { label: 'Blok A' }, { label: 'Blok B' }, { cueGroupRepo }, 'Blok A');

    cmd.execute();
    expect(cueGroupRepo.findById(group.id)!.label).toBe('Blok B');

    cmd.undo();
    expect(cueGroupRepo.findById(group.id)!.label).toBe('Blok A');
  });
});

// ── Testy komend TextVariable ───────────────────────────────────

describe('UndoManager — komendy TextVariable', () => {
  it('createTextVariableCommand → undo usunie', () => {
    const v = textVariableRepo.create({ rundown_id: rundownId, key: 'host', value: 'Jan' });
    const cmd = createTextVariableCommand(v, { textVariableRepo });

    cmd.undo();
    expect(textVariableRepo.findById(v.id)).toBeUndefined();

    cmd.execute();
    expect(textVariableRepo.findByRundown(rundownId).some(x => x.key === 'host')).toBe(true);
  });

  it('deleteTextVariableCommand → undo odtworzy', () => {
    const v = textVariableRepo.create({ rundown_id: rundownId, key: 'guest', value: 'Anna' });
    const cmd = deleteTextVariableCommand(v, { textVariableRepo });

    cmd.execute();
    expect(textVariableRepo.findById(v.id)).toBeUndefined();

    cmd.undo();
    expect(textVariableRepo.findByRundown(rundownId).some(x => x.key === 'guest')).toBe(true);
  });

  it('updateTextVariableCommand roundtrip', () => {
    const v = textVariableRepo.create({ rundown_id: rundownId, key: 'title', value: 'Stary' });
    const cmd = updateTextVariableCommand(v.id, { value: 'Stary' }, { value: 'Nowy' }, { textVariableRepo }, 'title');

    cmd.execute();
    expect(textVariableRepo.findById(v.id)!.value).toBe('Nowy');

    cmd.undo();
    expect(textVariableRepo.findById(v.id)!.value).toBe('Stary');
  });
});

// ── Testy pełnego flow UndoManager z prawdziwą bazą ─────────────

describe('UndoManager — pełny flow z bazą', () => {
  it('create cue → undo → cue usunięty → redo → cue wrócił', () => {
    const mgr = new UndoManager();
    const cue = cueRepo.create({ rundown_id: rundownId, title: 'Flow Cue' });
    mgr.pushCommand(createCueCommand(cue, { cueRepo, cellRepo }));

    expect(cueRepo.findByRundown(rundownId)).toHaveLength(1);

    mgr.undo();
    expect(cueRepo.findByRundown(rundownId)).toHaveLength(0);

    mgr.redo();
    expect(cueRepo.findByRundown(rundownId)).toHaveLength(1);
  });

  it('wielokrotny push + undo + redo zachowuje kolejność', () => {
    const mgr = new UndoManager();
    const c1 = cueRepo.create({ rundown_id: rundownId, title: 'C1' });
    mgr.pushCommand(createCueCommand(c1, { cueRepo, cellRepo }));

    const c2 = cueRepo.create({ rundown_id: rundownId, title: 'C2' });
    mgr.pushCommand(createCueCommand(c2, { cueRepo, cellRepo }));

    expect(cueRepo.findByRundown(rundownId)).toHaveLength(2);

    // Undo C2
    mgr.undo();
    expect(cueRepo.findByRundown(rundownId)).toHaveLength(1);
    expect(cueRepo.findByRundown(rundownId)[0]!.title).toBe('C1');

    // Undo C1
    mgr.undo();
    expect(cueRepo.findByRundown(rundownId)).toHaveLength(0);

    // Redo C1
    mgr.redo();
    expect(cueRepo.findByRundown(rundownId)).toHaveLength(1);

    // Redo C2
    mgr.redo();
    expect(cueRepo.findByRundown(rundownId)).toHaveLength(2);
  });
});
