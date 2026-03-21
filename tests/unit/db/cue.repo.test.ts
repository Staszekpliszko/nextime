import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import { createCueRepo, isHardCue } from '../../../electron/db/repositories/cue.repo';
import { createCueGroupRepo } from '../../../electron/db/repositories/cue-group.repo';

describe('CueRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createCueRepo>;
  let groupRepo: ReturnType<typeof createCueGroupRepo>;
  let rundownId: string;

  beforeEach(() => {
    db = createTestDb();
    repo = createCueRepo(db);
    groupRepo = createCueGroupRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
  });

  afterEach(() => { db.close(); });

  it('powinno stworzyć soft cue z domyślnymi wartościami', () => {
    const cue = repo.create({ rundown_id: rundownId, title: 'Opening' });
    expect(cue.start_type).toBe('soft');
    expect(cue.duration_ms).toBe(0);
    expect(cue.auto_start).toBe(false);
    expect(cue.locked).toBe(false);
    expect(isHardCue(cue)).toBe(false);
  });

  it('powinno stworzyć hard cue z hard_start_datetime', () => {
    const cue = repo.create({
      rundown_id: rundownId, title: 'Finale',
      start_type: 'hard', hard_start_datetime: '2025-06-01T21:00:00.000Z',
      duration_ms: 600000,
    });
    expect(isHardCue(cue)).toBe(true);
    if (isHardCue(cue)) {
      expect(cue.hard_start_datetime).toBe('2025-06-01T21:00:00.000Z');
    }
  });

  it('powinno znaleźć cues po rundownie posortowane po sort_order', () => {
    repo.create({ rundown_id: rundownId, title: 'B', sort_order: 2 });
    repo.create({ rundown_id: rundownId, title: 'A', sort_order: 1 });
    const cues = repo.findByRundown(rundownId);
    expect(cues[0]!.title).toBe('A');
  });

  it('powinno znaleźć cues po grupie', () => {
    const group = groupRepo.create({ rundown_id: rundownId, label: 'Act 1' });
    repo.create({ rundown_id: rundownId, title: 'C1', group_id: group.id });
    repo.create({ rundown_id: rundownId, title: 'C2', group_id: group.id });
    repo.create({ rundown_id: rundownId, title: 'C3' }); // bez grupy
    const inGroup = repo.findByGroup(group.id);
    expect(inGroup.length).toBe(2);
  });

  it('powinno zaktualizować cue z soft na hard', () => {
    const cue = repo.create({ rundown_id: rundownId, title: 'Soft' });
    const updated = repo.update(cue.id, {
      start_type: 'hard',
      hard_start_datetime: '2025-06-01T20:00:00.000Z',
    });
    expect(updated).toBeDefined();
    expect(isHardCue(updated!)).toBe(true);
  });

  it('powinno usunąć cue', () => {
    const cue = repo.create({ rundown_id: rundownId, title: 'Del' });
    expect(repo.delete(cue.id)).toBe(true);
    expect(repo.findById(cue.id)).toBeUndefined();
  });

  it('powinno zmienić kolejność cues', () => {
    const c1 = repo.create({ rundown_id: rundownId, title: 'A', sort_order: 0 });
    const c2 = repo.create({ rundown_id: rundownId, title: 'B', sort_order: 1 });
    const c3 = repo.create({ rundown_id: rundownId, title: 'C', sort_order: 2 });

    repo.reorder(rundownId, [c3.id, c1.id, c2.id]);

    const cues = repo.findByRundown(rundownId);
    expect(cues[0]!.title).toBe('C');
    expect(cues[1]!.title).toBe('A');
    expect(cues[2]!.title).toBe('B');
  });

  it('powinno obsłużyć auto_start i locked jako boolean', () => {
    const cue = repo.create({
      rundown_id: rundownId, title: 'Flags',
      auto_start: true, locked: true,
    });
    expect(cue.auto_start).toBe(true);
    expect(cue.locked).toBe(true);
  });
});
