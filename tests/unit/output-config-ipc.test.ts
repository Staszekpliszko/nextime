import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createOutputConfigRepo } from '../../electron/db/repositories/output-config.repo';
import type { OutputConfig, CreateOutputConfigInput } from '../../electron/db/repositories/output-config.repo';
import crypto from 'crypto';

describe('OutputConfig Repository (Faza 9)', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createOutputConfigRepo>;
  let rundownId: string;

  beforeEach(() => {
    db = createTestDb();
    repo = createOutputConfigRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
  });

  afterEach(() => {
    db.close();
  });

  // ── CREATE ────────────────────────────────────────────────

  it('powinno utworzyć output config z domyślnym layout=list', () => {
    const config = repo.create({
      rundown_id: rundownId,
      name: 'Monitor reżysera',
      share_token: crypto.randomUUID(),
    });

    expect(config).toBeDefined();
    expect(config.name).toBe('Monitor reżysera');
    expect(config.layout).toBe('list');
    expect(config.rundown_id).toBe(rundownId);
    expect(config.share_token).toMatch(/^[a-f0-9-]{36}$/);
    expect(config.settings).toEqual({});
  });

  it('powinno utworzyć output config z layout=prompter i settings', () => {
    const config = repo.create({
      rundown_id: rundownId,
      name: 'Prompter prezentera',
      layout: 'prompter',
      share_token: crypto.randomUUID(),
      settings: {
        prompter_text_size: 64,
        prompter_margin: 30,
        prompter_auto_scroll: true,
      },
    });

    expect(config.layout).toBe('prompter');
    expect(config.settings.prompter_text_size).toBe(64);
    expect(config.settings.prompter_margin).toBe(30);
    expect(config.settings.prompter_auto_scroll).toBe(true);
  });

  it('powinno utworzyć output config z layout=single', () => {
    const config = repo.create({
      rundown_id: rundownId,
      name: 'Pełny ekran',
      layout: 'single',
      share_token: crypto.randomUUID(),
    });

    expect(config.layout).toBe('single');
  });

  // ── FIND ──────────────────────────────────────────────────

  it('powinno znaleźć output config po ID', () => {
    const created = repo.create({
      rundown_id: rundownId,
      name: 'Test',
      share_token: crypto.randomUUID(),
    });

    const found = repo.findById(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe('Test');
  });

  it('powinno znaleźć output config po share_token', () => {
    const token = crypto.randomUUID();
    const created = repo.create({
      rundown_id: rundownId,
      name: 'Token test',
      share_token: token,
    });

    const found = repo.findByToken(token);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
    expect(found!.share_token).toBe(token);
  });

  it('powinno zwrócić undefined dla nieistniejącego tokenu', () => {
    const found = repo.findByToken('non-existent-token');
    expect(found).toBeUndefined();
  });

  it('powinno znaleźć wszystkie output configs dla rundownu', () => {
    repo.create({ rundown_id: rundownId, name: 'Output A', share_token: crypto.randomUUID() });
    repo.create({ rundown_id: rundownId, name: 'Output B', share_token: crypto.randomUUID() });
    repo.create({ rundown_id: rundownId, name: 'Output C', share_token: crypto.randomUUID() });

    const configs = repo.findByRundown(rundownId);
    expect(configs).toHaveLength(3);
    // Posortowane po nazwie
    expect(configs[0]!.name).toBe('Output A');
    expect(configs[1]!.name).toBe('Output B');
    expect(configs[2]!.name).toBe('Output C');
  });

  it('powinno zwrócić pustą listę dla rundownu bez outputów', () => {
    const configs = repo.findByRundown(rundownId);
    expect(configs).toHaveLength(0);
  });

  // ── UPDATE ────────────────────────────────────────────────

  it('powinno zaktualizować nazwę output config', () => {
    const config = repo.create({
      rundown_id: rundownId,
      name: 'Stara nazwa',
      share_token: crypto.randomUUID(),
    });

    const updated = repo.update(config.id, { name: 'Nowa nazwa' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Nowa nazwa');
    // share_token się nie zmienia
    expect(updated!.share_token).toBe(config.share_token);
  });

  it('powinno zaktualizować layout', () => {
    const config = repo.create({
      rundown_id: rundownId,
      name: 'Test',
      share_token: crypto.randomUUID(),
    });

    const updated = repo.update(config.id, { layout: 'prompter' });
    expect(updated!.layout).toBe('prompter');
  });

  it('powinno zaktualizować settings (merge)', () => {
    const config = repo.create({
      rundown_id: rundownId,
      name: 'Test',
      share_token: crypto.randomUUID(),
      settings: { prompter_text_size: 48 },
    });

    const updated = repo.update(config.id, {
      settings: { prompter_text_size: 72, prompter_margin: 20 },
    });
    expect(updated!.settings.prompter_text_size).toBe(72);
    expect(updated!.settings.prompter_margin).toBe(20);
  });

  it('powinno zwrócić oryginalny config jeśli nie ma zmian', () => {
    const config = repo.create({
      rundown_id: rundownId,
      name: 'Test',
      share_token: crypto.randomUUID(),
    });

    const updated = repo.update(config.id, {});
    expect(updated!.name).toBe('Test');
  });

  // ── DELETE ────────────────────────────────────────────────

  it('powinno usunąć output config', () => {
    const config = repo.create({
      rundown_id: rundownId,
      name: 'Do usunięcia',
      share_token: crypto.randomUUID(),
    });

    const deleted = repo.delete(config.id);
    expect(deleted).toBe(true);

    const found = repo.findById(config.id);
    expect(found).toBeUndefined();
  });

  it('powinno zwrócić false przy usuwaniu nieistniejącego', () => {
    const deleted = repo.delete('non-existent-id');
    expect(deleted).toBe(false);
  });

  // ── UNIKALNOŚĆ TOKEN ──────────────────────────────────────

  it('powinno wymusić unikalność share_token (UNIQUE constraint)', () => {
    const token = crypto.randomUUID();
    repo.create({
      rundown_id: rundownId,
      name: 'First',
      share_token: token,
    });

    expect(() => {
      repo.create({
        rundown_id: rundownId,
        name: 'Second',
        share_token: token,
      });
    }).toThrow(); // UNIQUE constraint violation
  });
});
