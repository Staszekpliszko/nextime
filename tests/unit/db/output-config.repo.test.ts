import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import { createOutputConfigRepo } from '../../../electron/db/repositories/output-config.repo';

describe('OutputConfigRepo', () => {
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

  afterEach(() => { db.close(); });

  it('powinno stworzyć output config z domyślnymi ustawieniami', () => {
    const oc = repo.create({ rundown_id: rundownId, name: 'Monitor', share_token: 'tok-1' });
    expect(oc.layout).toBe('list');
    expect(oc.settings).toEqual({});
  });

  it('powinno stworzyć output config z ustawieniami promptera', () => {
    const oc = repo.create({
      rundown_id: rundownId, name: 'Prompter', share_token: 'tok-p',
      layout: 'prompter',
      settings: { prompter_speed: 50, prompter_text_size: 48, prompter_uppercase: true },
    });
    expect(oc.layout).toBe('prompter');
    expect(oc.settings.prompter_speed).toBe(50);
    expect(oc.settings.prompter_uppercase).toBe(true);
  });

  it('powinno znaleźć po share_token', () => {
    repo.create({ rundown_id: rundownId, name: 'O', share_token: 'find-tok' });
    expect(repo.findByToken('find-tok')).toBeDefined();
  });

  it('powinno zaktualizować ustawienia', () => {
    const oc = repo.create({ rundown_id: rundownId, name: 'U', share_token: 'upd-tok' });
    const updated = repo.update(oc.id, { settings: { progress_bar: 'on' } });
    expect(updated?.settings.progress_bar).toBe('on');
  });

  it('powinno rzucić błąd przy duplikacie share_token', () => {
    repo.create({ rundown_id: rundownId, name: 'A', share_token: 'dup-tok' });
    expect(() => repo.create({ rundown_id: rundownId, name: 'B', share_token: 'dup-tok' })).toThrow();
  });
});
