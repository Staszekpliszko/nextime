import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, seedTestUser, seedTestProject } from '../helpers/test-db';
import { createCameraPresetRepo } from '../../electron/db/repositories/camera-preset.repo';
import type Database from 'better-sqlite3';

describe('CameraPresetRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createCameraPresetRepo>;
  let projectId: string;

  beforeEach(() => {
    db = createTestDb();
    const userId = seedTestUser(db);
    projectId = seedTestProject(db, userId);
    repo = createCameraPresetRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── CREATE ─────────────────────────────────────────────

  it('powinno utworzyć camera preset z domyślnymi wartościami', () => {
    const preset = repo.create({ project_id: projectId, number: 1 });
    expect(preset.id).toBeDefined();
    expect(preset.project_id).toBe(projectId);
    expect(preset.number).toBe(1);
    expect(preset.label).toBe('');
    expect(preset.color).toBe('#2196F3');
    expect(preset.default_channel).toBe('PGM');
    expect(preset.operator_name).toBeUndefined();
  });

  it('powinno utworzyć preset z pełnymi danymi', () => {
    const preset = repo.create({
      project_id: projectId,
      number: 3,
      label: 'Steadicam',
      color: '#FF5722',
      default_channel: 'ME1',
      operator_name: 'Jan',
    });
    expect(preset.label).toBe('Steadicam');
    expect(preset.color).toBe('#FF5722');
    expect(preset.default_channel).toBe('ME1');
    expect(preset.operator_name).toBe('Jan');
  });

  // ── FIND ───────────────────────────────────────────────

  it('powinno znaleźć preset po ID', () => {
    const created = repo.create({ project_id: projectId, number: 5 });
    const found = repo.findById(created.id);
    expect(found).toBeDefined();
    expect(found!.number).toBe(5);
  });

  it('powinno zwrócić undefined dla nieistniejącego ID', () => {
    expect(repo.findById('nonexistent')).toBeUndefined();
  });

  it('powinno znaleźć presety po project_id (posortowane po number)', () => {
    repo.create({ project_id: projectId, number: 3 });
    repo.create({ project_id: projectId, number: 1 });
    repo.create({ project_id: projectId, number: 2 });

    const presets = repo.findByProject(projectId);
    expect(presets).toHaveLength(3);
    expect(presets[0]!.number).toBe(1);
    expect(presets[1]!.number).toBe(2);
    expect(presets[2]!.number).toBe(3);
  });

  it('powinno zwrócić pustą listę dla nieistniejącego projektu', () => {
    expect(repo.findByProject('nonexistent')).toHaveLength(0);
  });

  // ── UPDATE ─────────────────────────────────────────────

  it('powinno zaktualizować label', () => {
    const created = repo.create({ project_id: projectId, number: 1 });
    const updated = repo.update(created.id, { label: 'Wide Shot' });
    expect(updated).toBeDefined();
    expect(updated!.label).toBe('Wide Shot');
  });

  it('powinno zaktualizować operator_name', () => {
    const created = repo.create({ project_id: projectId, number: 1 });
    const updated = repo.update(created.id, { operator_name: 'Kowalski' });
    expect(updated).toBeDefined();
    expect(updated!.operator_name).toBe('Kowalski');
  });

  it('powinno zwrócić undefined przy update nieistniejącego', () => {
    expect(repo.update('nonexistent', { label: 'X' })).toBeUndefined();
  });

  it('powinno zwrócić istniejący preset przy pustym update', () => {
    const created = repo.create({ project_id: projectId, number: 1, label: 'Cam A' });
    const same = repo.update(created.id, {});
    expect(same).toBeDefined();
    expect(same!.label).toBe('Cam A');
  });

  // ── DELETE ─────────────────────────────────────────────

  it('powinno usunąć preset', () => {
    const created = repo.create({ project_id: projectId, number: 1 });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.findById(created.id)).toBeUndefined();
  });

  it('powinno zwrócić false przy usuwaniu nieistniejącego', () => {
    expect(repo.delete('nonexistent')).toBe(false);
  });

  // ── UNIQUE constraint ─────────────────────────────────

  it('powinno odrzucić duplikat numeru w tym samym projekcie', () => {
    repo.create({ project_id: projectId, number: 1 });
    expect(() => repo.create({ project_id: projectId, number: 1 })).toThrow();
  });
});
