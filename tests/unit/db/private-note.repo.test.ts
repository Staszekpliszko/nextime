import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import { createCueRepo } from '../../../electron/db/repositories/cue.repo';
import { createPrivateNoteRepo } from '../../../electron/db/repositories/private-note.repo';

describe('PrivateNoteRepo', () => {
  let db: Database.Database;
  let noteRepo: ReturnType<typeof createPrivateNoteRepo>;
  let cueId: string;
  let userId: string;

  beforeEach(() => {
    db = createTestDb();
    noteRepo = createPrivateNoteRepo(db);
    userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    const rundownId = seedTestRundown(db, projectId);
    cueId = createCueRepo(db).create({ rundown_id: rundownId, title: 'C1' }).id;
  });

  afterEach(() => { db.close(); });

  it('powinno stworzyć notatkę', () => {
    const note = noteRepo.create({ cue_id: cueId, user_id: userId, content: 'Notatka' });
    expect(note.content).toBe('Notatka');
  });

  it('powinno znaleźć notatkę po cue + user', () => {
    noteRepo.create({ cue_id: cueId, user_id: userId, content: 'test' });
    const found = noteRepo.findByCueAndUser(cueId, userId);
    expect(found?.content).toBe('test');
  });

  it('powinno upsertować notatkę', () => {
    noteRepo.upsert(cueId, userId, 'v1');
    expect(noteRepo.findByCueAndUser(cueId, userId)?.content).toBe('v1');

    noteRepo.upsert(cueId, userId, 'v2');
    expect(noteRepo.findByCueAndUser(cueId, userId)?.content).toBe('v2');
    // sprawdź że jest nadal jedna notatka
    expect(noteRepo.findByCue(cueId).length).toBe(1);
  });

  it('powinno rzucić błąd przy duplikacie (cue_id, user_id)', () => {
    noteRepo.create({ cue_id: cueId, user_id: userId });
    expect(() => noteRepo.create({ cue_id: cueId, user_id: userId })).toThrow();
  });

  it('powinno pobrać notatki po rundownie i użytkowniku (findByRundownAndUser)', () => {
    const cueRepo = createCueRepo(db);
    // Pobierz rundownId z istniejącego cue
    const cue = cueRepo.findById(cueId);
    expect(cue).toBeDefined();
    const rundownId = cue!.rundown_id;

    // Utwórz drugi cue w tym samym rundownie
    const cue2 = cueRepo.create({ rundown_id: rundownId, title: 'C2' });

    noteRepo.upsert(cueId, userId, 'Notatka 1');
    noteRepo.upsert(cue2.id, userId, 'Notatka 2');

    const notes = noteRepo.findByRundownAndUser(rundownId, userId);
    expect(notes).toHaveLength(2);
    expect(notes.map(n => n.content).sort()).toEqual(['Notatka 1', 'Notatka 2']);
  });

  it('powinno usunąć notatkę po cue_id i user_id (deleteByCueAndUser)', () => {
    noteRepo.upsert(cueId, userId, 'Do usunięcia');
    expect(noteRepo.findByCueAndUser(cueId, userId)).toBeDefined();

    const deleted = noteRepo.deleteByCueAndUser(cueId, userId);
    expect(deleted).toBe(true);
    expect(noteRepo.findByCueAndUser(cueId, userId)).toBeUndefined();
  });

  it('deleteByCueAndUser powinno zwrócić false jeśli brak notatki', () => {
    const deleted = noteRepo.deleteByCueAndUser(cueId, userId);
    expect(deleted).toBe(false);
  });
});
