import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { createProjectRepo } from '../../electron/db/repositories/project.repo';
import type Database from 'better-sqlite3';

/**
 * Testy IPC handlers — weryfikują logikę CRUD cue'ów i rundownów.
 * Testujemy same repozytoria i logikę, nie Electron IPC (który jest cienkim wrapperem).
 */

let db: Database.Database;
let cueRepo: ReturnType<typeof createCueRepo>;
let rundownRepo: ReturnType<typeof createRundownRepo>;
let projectRepo: ReturnType<typeof createProjectRepo>;
let userId: string;
let projectId: string;
let rundownId: string;

beforeEach(() => {
  db = createTestDb();
  cueRepo = createCueRepo(db);
  rundownRepo = createRundownRepo(db);
  projectRepo = createProjectRepo(db);

  userId = seedTestUser(db);
  projectId = seedTestProject(db, userId);
  rundownId = seedTestRundown(db, projectId);
});

// ── nextime:createCue ─────────────────────────────────────────

describe('nextime:createCue', () => {
  it('powinno utworzyć cue z domyślnymi wartościami', () => {
    const cue = cueRepo.create({ rundown_id: rundownId });

    expect(cue).toBeDefined();
    expect(cue.id).toBeTruthy();
    expect(cue.rundown_id).toBe(rundownId);
    expect(cue.title).toBe('');
    expect(cue.subtitle).toBe('');
    expect(cue.duration_ms).toBe(0);
    expect(cue.start_type).toBe('soft');
    expect(cue.auto_start).toBe(false);
    expect(cue.locked).toBe(false);
  });

  it('powinno utworzyć cue z podanymi wartościami', () => {
    const cue = cueRepo.create({
      rundown_id: rundownId,
      title: 'Intro',
      subtitle: 'Powitanie',
      duration_ms: 60_000,
      start_type: 'soft',
      auto_start: true,
      background_color: '#FF5722',
      sort_order: 5,
    });

    expect(cue.title).toBe('Intro');
    expect(cue.subtitle).toBe('Powitanie');
    expect(cue.duration_ms).toBe(60_000);
    expect(cue.start_type).toBe('soft');
    expect(cue.auto_start).toBe(true);
    expect(cue.background_color).toBe('#FF5722');
    expect(cue.sort_order).toBe(5);
  });

  it('powinno utworzyć hard cue z hard_start_datetime', () => {
    const datetime = '2026-03-20T20:00:00.000Z';
    const cue = cueRepo.create({
      rundown_id: rundownId,
      title: 'Hard Start',
      duration_ms: 30_000,
      start_type: 'hard',
      hard_start_datetime: datetime,
    });

    expect(cue.start_type).toBe('hard');
    if (cue.start_type === 'hard') {
      expect(cue.hard_start_datetime).toBe(datetime);
    }
  });

  it('powinno być widoczne w findByRundown po utworzeniu', () => {
    cueRepo.create({ rundown_id: rundownId, title: 'Cue 1' });
    cueRepo.create({ rundown_id: rundownId, title: 'Cue 2' });

    const cues = cueRepo.findByRundown(rundownId);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.title).toBe('Cue 1');
    expect(cues[1]!.title).toBe('Cue 2');
  });
});

// ── nextime:updateCue ─────────────────────────────────────────

describe('nextime:updateCue', () => {
  it('powinno zaktualizować title i subtitle', () => {
    const cue = cueRepo.create({ rundown_id: rundownId, title: 'Stary' });
    const updated = cueRepo.update(cue.id, { title: 'Nowy', subtitle: 'Sub' });

    expect(updated).toBeDefined();
    expect(updated!.title).toBe('Nowy');
    expect(updated!.subtitle).toBe('Sub');
  });

  it('powinno zaktualizować duration_ms', () => {
    const cue = cueRepo.create({ rundown_id: rundownId, duration_ms: 60_000 });
    const updated = cueRepo.update(cue.id, { duration_ms: 120_000 });

    expect(updated!.duration_ms).toBe(120_000);
  });

  it('powinno zmienić start_type z soft na hard', () => {
    const cue = cueRepo.create({ rundown_id: rundownId, start_type: 'soft' });
    const datetime = '2026-03-20T21:00:00.000Z';
    const updated = cueRepo.update(cue.id, {
      start_type: 'hard',
      hard_start_datetime: datetime,
    });

    expect(updated!.start_type).toBe('hard');
    if (updated!.start_type === 'hard') {
      expect(updated!.hard_start_datetime).toBe(datetime);
    }
  });

  it('powinno zaktualizować auto_start i background_color', () => {
    const cue = cueRepo.create({ rundown_id: rundownId });
    const updated = cueRepo.update(cue.id, {
      auto_start: true,
      background_color: '#4CAF50',
    });

    expect(updated!.auto_start).toBe(true);
    expect(updated!.background_color).toBe('#4CAF50');
  });

  it('powinno zwrócić undefined dla nieistniejącego cue', () => {
    const updated = cueRepo.update('nonexistent-id', { title: 'Test' });
    // update wywołuje findById na końcu — powinno zwrócić undefined
    expect(updated).toBeUndefined();
  });

  it('powinno nie zmieniać pól gdy input jest pusty', () => {
    const cue = cueRepo.create({ rundown_id: rundownId, title: 'Oryginał' });
    const updated = cueRepo.update(cue.id, {});

    expect(updated!.title).toBe('Oryginał');
  });
});

// ── nextime:deleteCue ─────────────────────────────────────────

describe('nextime:deleteCue', () => {
  it('powinno usunąć istniejący cue', () => {
    const cue = cueRepo.create({ rundown_id: rundownId, title: 'Do usunięcia' });
    const deleted = cueRepo.delete(cue.id);

    expect(deleted).toBe(true);
    expect(cueRepo.findById(cue.id)).toBeUndefined();
  });

  it('powinno zwrócić false dla nieistniejącego cue', () => {
    const deleted = cueRepo.delete('nonexistent-id');
    expect(deleted).toBe(false);
  });

  it('powinno usunąć cue z listy rundownu', () => {
    cueRepo.create({ rundown_id: rundownId, title: 'Cue 1' });
    const cue2 = cueRepo.create({ rundown_id: rundownId, title: 'Cue 2' });
    cueRepo.create({ rundown_id: rundownId, title: 'Cue 3' });

    cueRepo.delete(cue2.id);

    const remaining = cueRepo.findByRundown(rundownId);
    expect(remaining).toHaveLength(2);
    expect(remaining.map(c => c.title)).toEqual(['Cue 1', 'Cue 3']);
  });
});

// ── nextime:reorderCues ───────────────────────────────────────

describe('nextime:reorderCues', () => {
  it('powinno zmienić kolejność cue\'ów', () => {
    const cue1 = cueRepo.create({ rundown_id: rundownId, title: 'A', sort_order: 0 });
    const cue2 = cueRepo.create({ rundown_id: rundownId, title: 'B', sort_order: 1 });
    const cue3 = cueRepo.create({ rundown_id: rundownId, title: 'C', sort_order: 2 });

    // Odwróć kolejność: C, A, B
    cueRepo.reorder(rundownId, [cue3.id, cue1.id, cue2.id]);

    const reordered = cueRepo.findByRundown(rundownId);
    expect(reordered[0]!.title).toBe('C');
    expect(reordered[0]!.sort_order).toBe(0);
    expect(reordered[1]!.title).toBe('A');
    expect(reordered[1]!.sort_order).toBe(1);
    expect(reordered[2]!.title).toBe('B');
    expect(reordered[2]!.sort_order).toBe(2);
  });
});

// ── nextime:createRundown ─────────────────────────────────────

describe('nextime:createRundown', () => {
  it('powinno utworzyć nowy rundown', () => {
    const rundown = rundownRepo.create({
      project_id: projectId,
      name: 'Nowy Show',
    });

    expect(rundown).toBeDefined();
    expect(rundown.id).toBeTruthy();
    expect(rundown.name).toBe('Nowy Show');
    expect(rundown.project_id).toBe(projectId);
    expect(rundown.status).toBe('draft');
  });

  it('powinno być widoczne w findAll po utworzeniu', () => {
    rundownRepo.create({ project_id: projectId, name: 'Show 1' });
    rundownRepo.create({ project_id: projectId, name: 'Show 2' });

    const all = rundownRepo.findAll();
    // +1 bo seedTestRundown tworzy domyślny rundown
    expect(all.length).toBeGreaterThanOrEqual(3);
  });
});

// ── nextime:deleteRundown ─────────────────────────────────────

describe('nextime:deleteRundown', () => {
  it('powinno usunąć rundown', () => {
    const rundown = rundownRepo.create({ project_id: projectId, name: 'Tymczasowy' });
    const deleted = rundownRepo.delete(rundown.id);

    expect(deleted).toBe(true);
    expect(rundownRepo.findById(rundown.id)).toBeUndefined();
  });

  it('powinno usunąć kaskadowo cue\'y rundownu', () => {
    const rd = rundownRepo.create({ project_id: projectId, name: 'Kaskada' });
    cueRepo.create({ rundown_id: rd.id, title: 'Cue kaskada' });

    rundownRepo.delete(rd.id);

    const cues = cueRepo.findByRundown(rd.id);
    expect(cues).toHaveLength(0);
  });
});

// ── nextime:getProjects ───────────────────────────────────────

describe('nextime:getProjects', () => {
  it('powinno zwrócić listę projektów', () => {
    const projects = projectRepo.findAll();
    expect(projects.length).toBeGreaterThanOrEqual(1);
    expect(projects[0]!.id).toBe(projectId);
  });
});
