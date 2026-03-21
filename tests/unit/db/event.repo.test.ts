import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser } from '../../helpers/test-db';
import { createEventRepo } from '../../../electron/db/repositories/event.repo';

describe('EventRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createEventRepo>;
  let userId: string;

  beforeEach(() => {
    db = createTestDb();
    repo = createEventRepo(db);
    userId = seedTestUser(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Events ──

  it('powinno stworzyć event', () => {
    const event = repo.create({ owner_id: userId, name: 'Gala', slug: 'gala-2025' });
    expect(event.id).toBeDefined();
    expect(event.name).toBe('Gala');
    expect(event.slug).toBe('gala-2025');
    expect(event.owner_id).toBe(userId);
  });

  it('powinno znaleźć event po id', () => {
    const event = repo.create({ owner_id: userId, name: 'E', slug: 'e-1' });
    expect(repo.findById(event.id)).toBeDefined();
  });

  it('powinno znaleźć event po slug', () => {
    repo.create({ owner_id: userId, name: 'E', slug: 'unique-slug' });
    expect(repo.findBySlug('unique-slug')).toBeDefined();
  });

  it('powinno znaleźć eventy po owner', () => {
    repo.create({ owner_id: userId, name: 'A', slug: 'a-1' });
    repo.create({ owner_id: userId, name: 'B', slug: 'b-1' });
    expect(repo.findByOwner(userId).length).toBe(2);
  });

  it('powinno zaktualizować event', () => {
    const event = repo.create({ owner_id: userId, name: 'Old', slug: 'old' });
    const updated = repo.update(event.id, { name: 'New' });
    expect(updated?.name).toBe('New');
  });

  it('powinno usunąć event', () => {
    const event = repo.create({ owner_id: userId, name: 'Del', slug: 'del' });
    expect(repo.delete(event.id)).toBe(true);
    expect(repo.findById(event.id)).toBeUndefined();
  });

  it('powinno rzucić błąd przy duplikacie slug', () => {
    repo.create({ owner_id: userId, name: 'A', slug: 'same' });
    expect(() => repo.create({ owner_id: userId, name: 'B', slug: 'same' })).toThrow();
  });

  // ── Event Guests ──

  it('powinno stworzyć guest link', () => {
    const event = repo.create({ owner_id: userId, name: 'E', slug: 'e-g' });
    const guest = repo.createGuest({ event_id: event.id, share_token: 'tok123', label: 'Klient' });
    expect(guest.share_token).toBe('tok123');
    expect(guest.label).toBe('Klient');
  });

  it('powinno znaleźć guest po token', () => {
    const event = repo.create({ owner_id: userId, name: 'E', slug: 'e-gt' });
    repo.createGuest({ event_id: event.id, share_token: 'find-me' });
    expect(repo.findGuestByToken('find-me')).toBeDefined();
  });

  it('powinno usunąć guests kaskadowo przy usunięciu eventu', () => {
    const event = repo.create({ owner_id: userId, name: 'E', slug: 'e-cascade' });
    const guest = repo.createGuest({ event_id: event.id, share_token: 'cascade-tok' });
    repo.delete(event.id);
    expect(repo.findGuestById(guest.id)).toBeUndefined();
  });
});
