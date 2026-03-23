import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import { createCueRepo } from '../../../electron/db/repositories/cue.repo';
import { createTeamNoteRepo } from '../../../electron/db/repositories/team-note.repo';

describe('TeamNoteRepo', () => {
  let db: Database.Database;
  let noteRepo: ReturnType<typeof createTeamNoteRepo>;
  let rundownId: string;
  let cueId: string;

  beforeEach(() => {
    db = createTestDb();
    noteRepo = createTeamNoteRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
    cueId = createCueRepo(db).create({ rundown_id: rundownId, title: 'C1' }).id;
  });

  afterEach(() => { db.close(); });

  it('powinno stworzyć notatkę zespołową (globalną)', () => {
    const note = noteRepo.create({
      rundown_id: rundownId,
      author_name: 'Reżyser',
      content: 'Sprawdzić audio przed show',
    });
    expect(note.id).toBeDefined();
    expect(note.rundown_id).toBe(rundownId);
    expect(note.cue_id).toBeNull();
    expect(note.author_name).toBe('Reżyser');
    expect(note.content).toBe('Sprawdzić audio przed show');
    expect(note.resolved).toBe(false);
    expect(note.created_at).toBeDefined();
  });

  it('powinno stworzyć notatkę per cue', () => {
    const note = noteRepo.create({
      rundown_id: rundownId,
      cue_id: cueId,
      author_name: 'Operator',
      content: 'Tu dodać przejście',
    });
    expect(note.cue_id).toBe(cueId);
  });

  it('powinno pobrać notatki per rundown (sorted DESC)', () => {
    noteRepo.create({ rundown_id: rundownId, author_name: 'A', content: 'Pierwsza' });
    noteRepo.create({ rundown_id: rundownId, author_name: 'B', content: 'Druga' });
    noteRepo.create({ rundown_id: rundownId, author_name: 'C', content: 'Trzecia' });

    const notes = noteRepo.findByRundown(rundownId);
    expect(notes).toHaveLength(3);
    // Najnowsza pierwsza
    expect(notes[0]!.content).toBe('Trzecia');
    expect(notes[2]!.content).toBe('Pierwsza');
  });

  it('powinno pobrać notatki per cue', () => {
    noteRepo.create({ rundown_id: rundownId, cue_id: cueId, author_name: 'A', content: 'Dla cue' });
    noteRepo.create({ rundown_id: rundownId, author_name: 'B', content: 'Globalna' });

    const cueNotes = noteRepo.findByCue(cueId);
    expect(cueNotes).toHaveLength(1);
    expect(cueNotes[0]!.content).toBe('Dla cue');
  });

  it('powinno zaktualizować treść notatki', () => {
    const note = noteRepo.create({ rundown_id: rundownId, author_name: 'A', content: 'Oryginał' });
    const updated = noteRepo.update(note.id, { content: 'Zmieniona treść' });
    expect(updated?.content).toBe('Zmieniona treść');
  });

  it('powinno toggle resolved (oznacz jako rozwiązane)', () => {
    const note = noteRepo.create({ rundown_id: rundownId, author_name: 'A', content: 'Problem' });
    expect(note.resolved).toBe(false);

    const resolved = noteRepo.toggleResolved(note.id, true);
    expect(resolved?.resolved).toBe(true);

    const reopened = noteRepo.toggleResolved(note.id, false);
    expect(reopened?.resolved).toBe(false);
  });

  it('powinno usunąć notatkę', () => {
    const note = noteRepo.create({ rundown_id: rundownId, author_name: 'A', content: 'Do usunięcia' });
    expect(noteRepo.findById(note.id)).toBeDefined();

    const deleted = noteRepo.delete(note.id);
    expect(deleted).toBe(true);
    expect(noteRepo.findById(note.id)).toBeUndefined();
  });

  it('delete powinno zwrócić false jeśli notatka nie istnieje', () => {
    const deleted = noteRepo.delete('non-existent-id');
    expect(deleted).toBe(false);
  });

  it('powinno policzyć nierozwiązane notatki (countUnresolved)', () => {
    noteRepo.create({ rundown_id: rundownId, author_name: 'A', content: 'N1' });
    noteRepo.create({ rundown_id: rundownId, author_name: 'B', content: 'N2' });
    const n3 = noteRepo.create({ rundown_id: rundownId, author_name: 'C', content: 'N3' });
    noteRepo.toggleResolved(n3.id, true);

    expect(noteRepo.countUnresolved(rundownId)).toBe(2);
  });

  it('CASCADE: usunięcie rundownu powinno usunąć notatki', () => {
    noteRepo.create({ rundown_id: rundownId, author_name: 'A', content: 'test' });
    expect(noteRepo.findByRundown(rundownId)).toHaveLength(1);

    db.prepare('DELETE FROM rundowns WHERE id = ?').run(rundownId);
    expect(noteRepo.findByRundown(rundownId)).toHaveLength(0);
  });

  it('SET NULL: usunięcie cue powinno ustawić cue_id na null', () => {
    const note = noteRepo.create({
      rundown_id: rundownId,
      cue_id: cueId,
      author_name: 'A',
      content: 'Per cue note',
    });
    expect(note.cue_id).toBe(cueId);

    db.prepare('DELETE FROM cues WHERE id = ?').run(cueId);
    const after = noteRepo.findById(note.id);
    expect(after?.cue_id).toBeNull();
  });
});
