import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import { createActRepo } from '../../../electron/db/repositories/act.repo';

describe('ActRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createActRepo>;
  let rundownId: string;
  let userId: string;

  beforeEach(() => {
    db = createTestDb();
    repo = createActRepo(db);
    userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
  });

  afterEach(() => { db.close(); });

  it('powinno stworzyć act z domyślnymi wartościami', () => {
    const act = repo.create({ rundown_id: rundownId, name: 'Song 1' });
    expect(act.fps).toBe(25);
    expect(act.status).toBe('draft');
    expect(act.color).toBe('#1E3A5F');
    expect(act.duration_frames).toBe(0);
  });

  it('powinno stworzyć act z custom fps', () => {
    const act = repo.create({ rundown_id: rundownId, name: 'S60', fps: 60, duration_frames: 54000 });
    expect(act.fps).toBe(60);
    expect(act.duration_frames).toBe(54000);
  });

  it('powinno znaleźć acty po rundownie', () => {
    repo.create({ rundown_id: rundownId, name: 'A', sort_order: 1 });
    repo.create({ rundown_id: rundownId, name: 'B', sort_order: 0 });
    const acts = repo.findByRundown(rundownId);
    expect(acts[0]!.name).toBe('B');
  });

  it('powinno zaktualizować status', () => {
    const act = repo.create({ rundown_id: rundownId, name: 'Act' });
    const updated = repo.update(act.id, { status: 'live' });
    expect(updated?.status).toBe('live');
  });

  // ── Act Notes ──

  it('powinno dodać notatkę do actu', () => {
    const act = repo.create({ rundown_id: rundownId, name: 'N' });
    const note = repo.addNote(act.id, userId, 'Uwaga na pyro');
    expect(note.content).toBe('Uwaga na pyro');
  });

  it('powinno znaleźć notatki actu', () => {
    const act = repo.create({ rundown_id: rundownId, name: 'N2' });
    repo.addNote(act.id, userId, 'Note 1');
    repo.addNote(act.id, userId, 'Note 2');
    expect(repo.findNotesByAct(act.id).length).toBe(2);
  });

  it('powinno usunąć notatki kaskadowo przy usunięciu actu', () => {
    const act = repo.create({ rundown_id: rundownId, name: 'NC' });
    const note = repo.addNote(act.id, userId, 'Cascade');
    repo.delete(act.id);
    const notes = db.prepare('SELECT * FROM act_notes WHERE id = ?').get(note.id);
    expect(notes).toBeUndefined();
  });
});
