import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb } from '../../helpers/test-db';
import { createUserRepo } from '../../../electron/db/repositories/user.repo';

describe('UserRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createUserRepo>;

  beforeEach(() => {
    db = createTestDb();
    repo = createUserRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it('powinno stworzyć usera i zwrócić go z id i timestamps', () => {
    const user = repo.create({ name: 'Jan', email: 'jan@test.pl', password_hash: 'hash123' });
    expect(user.id).toBeDefined();
    expect(user.name).toBe('Jan');
    expect(user.email).toBe('jan@test.pl');
    expect(user.created_at).toBeDefined();
    expect(user.updated_at).toBeDefined();
  });

  it('powinno znaleźć usera po id', () => {
    const created = repo.create({ name: 'Anna', email: 'anna@test.pl', password_hash: 'h' });
    const found = repo.findById(created.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe('Anna');
  });

  it('powinno zwrócić undefined dla nieistniejącego id', () => {
    expect(repo.findById('non-existent')).toBeUndefined();
  });

  it('powinno znaleźć usera po email', () => {
    repo.create({ name: 'Bob', email: 'bob@test.pl', password_hash: 'h' });
    const found = repo.findByEmail('bob@test.pl');
    expect(found?.name).toBe('Bob');
  });

  it('powinno zwrócić wszystkich userów', () => {
    repo.create({ name: 'A', email: 'a@t.pl', password_hash: 'h' });
    repo.create({ name: 'B', email: 'b@t.pl', password_hash: 'h' });
    const all = repo.findAll();
    // +1 bo jest seed admin
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('powinno zaktualizować usera', () => {
    const user = repo.create({ name: 'Old', email: 'up@t.pl', password_hash: 'h' });
    const updated = repo.update(user.id, { name: 'New' });
    expect(updated?.name).toBe('New');
  });

  it('powinno usunąć usera', () => {
    const user = repo.create({ name: 'Del', email: 'del@t.pl', password_hash: 'h' });
    expect(repo.delete(user.id)).toBe(true);
    expect(repo.findById(user.id)).toBeUndefined();
  });

  it('powinno zwrócić false przy usuwaniu nieistniejącego usera', () => {
    expect(repo.delete('non-existent')).toBe(false);
  });

  it('powinno rzucić błąd przy duplikacie email', () => {
    repo.create({ name: 'A', email: 'dup@t.pl', password_hash: 'h' });
    expect(() => repo.create({ name: 'B', email: 'dup@t.pl', password_hash: 'h' })).toThrow();
  });

  it('powinno obsłużyć opcjonalny avatar_url', () => {
    const user = repo.create({ name: 'Ava', email: 'ava@t.pl', password_hash: 'h', avatar_url: 'http://img.png' });
    expect(user.avatar_url).toBe('http://img.png');

    const noAvatar = repo.create({ name: 'No', email: 'no@t.pl', password_hash: 'h' });
    expect(noAvatar.avatar_url).toBeUndefined();
  });
});
