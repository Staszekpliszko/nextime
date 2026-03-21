import Database from 'better-sqlite3';
import { generateId } from './base';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export type PublicUser = Omit<User, 'password_hash'>;

export type CreateUserInput = {
  name: string;
  email: string;
  password_hash: string;
  avatar_url?: string;
};

export type UpdateUserInput = Partial<Omit<CreateUserInput, 'email'>>;

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password_hash: row.password_hash,
    avatar_url: row.avatar_url ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createUserRepo(db: Database.Database) {
  return {
    create(input: CreateUserInput): User {
      const id = generateId();
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash, avatar_url)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, input.name, input.email, input.password_hash, input.avatar_url ?? null);

      return this.findById(id)!;
    },

    findById(id: string): User | undefined {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
      return row ? rowToUser(row) : undefined;
    },

    findByEmail(email: string): User | undefined {
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
      return row ? rowToUser(row) : undefined;
    },

    findAll(): User[] {
      const rows = db.prepare('SELECT * FROM users ORDER BY name').all() as UserRow[];
      return rows.map(rowToUser);
    },

    update(id: string, input: UpdateUserInput): User | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
      if (input.password_hash !== undefined) { fields.push('password_hash = ?'); values.push(input.password_hash); }
      if (input.avatar_url !== undefined) { fields.push('avatar_url = ?'); values.push(input.avatar_url); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
