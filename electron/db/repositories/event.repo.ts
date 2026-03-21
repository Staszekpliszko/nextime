import Database from 'better-sqlite3';
import { generateId } from './base';

// ── Event ────────────────────────────────────────────────────

export interface Event {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  logo_url?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export type CreateEventInput = {
  owner_id: string;
  name: string;
  slug: string;
  logo_url?: string;
  description?: string;
};

export type UpdateEventInput = Partial<Omit<CreateEventInput, 'owner_id'>>;

interface EventRow {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEvent(row: EventRow): Event {
  return {
    id: row.id,
    owner_id: row.owner_id,
    name: row.name,
    slug: row.slug,
    logo_url: row.logo_url ?? undefined,
    description: row.description ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── EventGuest ───────────────────────────────────────────────

export interface EventGuest {
  id: string;
  event_id: string;
  share_token: string;
  label?: string;
  expires_at?: string;
  created_at: string;
}

export type CreateEventGuestInput = {
  event_id: string;
  share_token: string;
  label?: string;
  expires_at?: string;
};

interface EventGuestRow {
  id: string;
  event_id: string;
  share_token: string;
  label: string | null;
  expires_at: string | null;
  created_at: string;
}

function rowToEventGuest(row: EventGuestRow): EventGuest {
  return {
    id: row.id,
    event_id: row.event_id,
    share_token: row.share_token,
    label: row.label ?? undefined,
    expires_at: row.expires_at ?? undefined,
    created_at: row.created_at,
  };
}

// ── Repository ───────────────────────────────────────────────

export function createEventRepo(db: Database.Database) {
  return {
    // ── Events ──
    create(input: CreateEventInput): Event {
      const id = generateId();
      db.prepare(`
        INSERT INTO events (id, owner_id, name, slug, logo_url, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, input.owner_id, input.name, input.slug, input.logo_url ?? null, input.description ?? null);
      return this.findById(id)!;
    },

    findById(id: string): Event | undefined {
      const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
      return row ? rowToEvent(row) : undefined;
    },

    findBySlug(slug: string): Event | undefined {
      const row = db.prepare('SELECT * FROM events WHERE slug = ?').get(slug) as EventRow | undefined;
      return row ? rowToEvent(row) : undefined;
    },

    findByOwner(ownerId: string): Event[] {
      const rows = db.prepare('SELECT * FROM events WHERE owner_id = ? ORDER BY name').all(ownerId) as EventRow[];
      return rows.map(rowToEvent);
    },

    findAll(): Event[] {
      const rows = db.prepare('SELECT * FROM events ORDER BY name').all() as EventRow[];
      return rows.map(rowToEvent);
    },

    update(id: string, input: UpdateEventInput): Event | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
      if (input.slug !== undefined) { fields.push('slug = ?'); values.push(input.slug); }
      if (input.logo_url !== undefined) { fields.push('logo_url = ?'); values.push(input.logo_url); }
      if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM events WHERE id = ?').run(id);
      return result.changes > 0;
    },

    // ── Event Guests ──
    createGuest(input: CreateEventGuestInput): EventGuest {
      const id = generateId();
      db.prepare(`
        INSERT INTO event_guests (id, event_id, share_token, label, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, input.event_id, input.share_token, input.label ?? null, input.expires_at ?? null);
      return this.findGuestById(id)!;
    },

    findGuestById(id: string): EventGuest | undefined {
      const row = db.prepare('SELECT * FROM event_guests WHERE id = ?').get(id) as EventGuestRow | undefined;
      return row ? rowToEventGuest(row) : undefined;
    },

    findGuestByToken(token: string): EventGuest | undefined {
      const row = db.prepare('SELECT * FROM event_guests WHERE share_token = ?').get(token) as EventGuestRow | undefined;
      return row ? rowToEventGuest(row) : undefined;
    },

    findGuestsByEvent(eventId: string): EventGuest[] {
      const rows = db.prepare('SELECT * FROM event_guests WHERE event_id = ?').all(eventId) as EventGuestRow[];
      return rows.map(rowToEventGuest);
    },

    deleteGuest(id: string): boolean {
      const result = db.prepare('DELETE FROM event_guests WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
