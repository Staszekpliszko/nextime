import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { runMigrationsFromString } from '../../electron/db/migrate';

/**
 * Tworzy in-memory SQLite z załadowanym schematem.
 * Każdy test dostaje izolowaną bazę.
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  const schemaPath = path.join(__dirname, '..', '..', 'docs', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  runMigrationsFromString(db, schema);

  return db;
}

/**
 * Tworzy domyślnego usera do testów (wymagany przez FK w wielu tabelach).
 */
export function seedTestUser(db: Database.Database, overrides?: Partial<{
  id: string;
  name: string;
  email: string;
}>): string {
  const id = overrides?.id ?? 'test-user-001';
  const name = overrides?.name ?? 'Test User';
  const email = overrides?.email ?? `test-${id}@test.com`;

  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password_hash)
    VALUES (?, ?, ?, 'test-hash')
  `).run(id, name, email);

  return id;
}

/**
 * Tworzy domyślny event do testów.
 */
export function seedTestEvent(db: Database.Database, ownerId: string, overrides?: Partial<{
  id: string;
  name: string;
  slug: string;
}>): string {
  const id = overrides?.id ?? 'test-event-001';
  const name = overrides?.name ?? 'Test Event';
  const slug = overrides?.slug ?? `test-event-${id}`;

  db.prepare(`
    INSERT OR IGNORE INTO events (id, owner_id, name, slug)
    VALUES (?, ?, ?, ?)
  `).run(id, ownerId, name, slug);

  return id;
}

/**
 * Tworzy domyślny project do testów.
 */
export function seedTestProject(db: Database.Database, ownerId: string, overrides?: Partial<{
  id: string;
  name: string;
  slug: string;
  event_id: string;
}>): string {
  const id = overrides?.id ?? 'test-project-001';
  const name = overrides?.name ?? 'Test Project';
  const slug = overrides?.slug ?? `test-project-${id}`;

  db.prepare(`
    INSERT OR IGNORE INTO projects (id, owner_id, name, slug, event_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, ownerId, name, slug, overrides?.event_id ?? null);

  return id;
}

/**
 * Tworzy domyślny rundown do testów.
 */
export function seedTestRundown(db: Database.Database, projectId: string, overrides?: Partial<{
  id: string;
  name: string;
}>): string {
  const id = overrides?.id ?? 'test-rundown-001';
  const name = overrides?.name ?? 'Test Rundown';

  db.prepare(`
    INSERT OR IGNORE INTO rundowns (id, project_id, name)
    VALUES (?, ?, ?)
  `).run(id, projectId, name);

  return id;
}
