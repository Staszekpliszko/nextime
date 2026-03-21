import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb } from '../../helpers/test-db';

describe('Connection + Schema', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it('powinno załadować schema.sql do in-memory SQLite', () => {
    db = createTestDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('rundowns');
    expect(tableNames).toContain('cues');
    expect(tableNames).toContain('acts');
    expect(tableNames).toContain('timeline_cues');
    expect(tableNames).toContain('tracks');
    expect(tableNames).toContain('cells');
    expect(tableNames).toContain('columns');
  });

  it('powinno mieć PRAGMA foreign_keys = ON', () => {
    db = createTestDb();
    const fk = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(fk[0]?.foreign_keys).toBe(1);
  });

  it('powinno zawierać seed usera admin', () => {
    db = createTestDb();
    const admin = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@localhost') as { name: string } | undefined;
    expect(admin).toBeDefined();
    expect(admin?.name).toBe('Admin');
  });
});
