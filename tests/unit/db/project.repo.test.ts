import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser } from '../../helpers/test-db';
import { createProjectRepo } from '../../../electron/db/repositories/project.repo';

describe('ProjectRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createProjectRepo>;
  let userId: string;

  beforeEach(() => {
    db = createTestDb();
    repo = createProjectRepo(db);
    userId = seedTestUser(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Projects ──

  it('powinno stworzyć projekt z domyślnymi wartościami', () => {
    const p = repo.create({ owner_id: userId, name: 'Show', slug: 'show-1' });
    expect(p.type).toBe('SOLO');
    expect(p.status).toBe('draft');
    expect(p.timezone).toBe('Europe/Warsaw');
    expect(p.default_fps).toBe(25);
  });

  it('powinno stworzyć projekt z custom fps', () => {
    const p = repo.create({ owner_id: userId, name: 'S60', slug: 's-60', default_fps: 60 });
    expect(p.default_fps).toBe(60);
  });

  it('powinno znaleźć projekt po slug', () => {
    repo.create({ owner_id: userId, name: 'S', slug: 'find-me' });
    expect(repo.findBySlug('find-me')).toBeDefined();
  });

  it('powinno zaktualizować status projektu', () => {
    const p = repo.create({ owner_id: userId, name: 'P', slug: 'p-1' });
    const updated = repo.update(p.id, { status: 'active' });
    expect(updated?.status).toBe('active');
  });

  it('powinno usunąć projekt', () => {
    const p = repo.create({ owner_id: userId, name: 'D', slug: 'd-1' });
    expect(repo.delete(p.id)).toBe(true);
    expect(repo.findById(p.id)).toBeUndefined();
  });

  // ── Project Members ──

  it('powinno dodać membera do projektu', () => {
    const p = repo.create({ owner_id: userId, name: 'M', slug: 'm-1' });
    const user2 = 'user-2';
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, 'U2', 'u2@t.pl', 'h')").run(user2);

    const member = repo.addMember({ project_id: p.id, user_id: user2, role: 'editor' });
    expect(member.role).toBe('editor');
    expect(member.project_id).toBe(p.id);
  });

  it('powinno znaleźć memberów projektu', () => {
    const p = repo.create({ owner_id: userId, name: 'M2', slug: 'm-2' });
    repo.addMember({ project_id: p.id, user_id: userId, role: 'owner' });
    const members = repo.findMembersByProject(p.id);
    expect(members.length).toBe(1);
  });

  it('powinno rzucić błąd przy duplikacie (project_id, user_id)', () => {
    const p = repo.create({ owner_id: userId, name: 'MD', slug: 'md-1' });
    repo.addMember({ project_id: p.id, user_id: userId });
    expect(() => repo.addMember({ project_id: p.id, user_id: userId })).toThrow();
  });

  it('powinno usunąć memberów kaskadowo przy usunięciu projektu', () => {
    const p = repo.create({ owner_id: userId, name: 'MC', slug: 'mc-1' });
    const member = repo.addMember({ project_id: p.id, user_id: userId });
    repo.delete(p.id);
    expect(repo.findMemberById(member.id)).toBeUndefined();
  });

  // ── Camera Presets ──

  it('powinno stworzyć preset kamery', () => {
    const p = repo.create({ owner_id: userId, name: 'C', slug: 'c-1' });
    const preset = repo.createPreset({ project_id: p.id, number: 1, label: 'Steadicam' });
    expect(preset.number).toBe(1);
    expect(preset.label).toBe('Steadicam');
    expect(preset.default_channel).toBe('PGM');
  });

  it('powinno znaleźć presety projektu posortowane po numerze', () => {
    const p = repo.create({ owner_id: userId, name: 'CP', slug: 'cp-1' });
    repo.createPreset({ project_id: p.id, number: 3 });
    repo.createPreset({ project_id: p.id, number: 1 });
    repo.createPreset({ project_id: p.id, number: 2 });
    const presets = repo.findPresetsByProject(p.id);
    expect(presets.map(pr => pr.number)).toEqual([1, 2, 3]);
  });

  it('powinno rzucić błąd przy duplikacie (project_id, number)', () => {
    const p = repo.create({ owner_id: userId, name: 'CD', slug: 'cd-1' });
    repo.createPreset({ project_id: p.id, number: 1 });
    expect(() => repo.createPreset({ project_id: p.id, number: 1 })).toThrow();
  });

  it('powinno usunąć presety kaskadowo przy usunięciu projektu', () => {
    const p = repo.create({ owner_id: userId, name: 'CC', slug: 'cc-1' });
    const preset = repo.createPreset({ project_id: p.id, number: 1 });
    repo.delete(p.id);
    expect(repo.findPresetById(preset.id)).toBeUndefined();
  });
});
