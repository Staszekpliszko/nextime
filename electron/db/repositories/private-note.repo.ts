import Database from 'better-sqlite3';
import { generateId } from './base';

export interface PrivateNote {
  id: string;
  cue_id: string;
  user_id: string;
  content: string;
  updated_at: string;
}

export type CreatePrivateNoteInput = {
  cue_id: string;
  user_id: string;
  content?: string;
};

interface PrivateNoteRow {
  id: string;
  cue_id: string;
  user_id: string;
  content: string;
  updated_at: string;
}

function rowToNote(row: PrivateNoteRow): PrivateNote {
  return {
    id: row.id,
    cue_id: row.cue_id,
    user_id: row.user_id,
    content: row.content,
    updated_at: row.updated_at,
  };
}

export function createPrivateNoteRepo(db: Database.Database) {
  return {
    create(input: CreatePrivateNoteInput): PrivateNote {
      const id = generateId();
      db.prepare(`
        INSERT INTO private_notes (id, cue_id, user_id, content)
        VALUES (?, ?, ?, ?)
      `).run(id, input.cue_id, input.user_id, input.content ?? '');
      return this.findById(id)!;
    },

    findById(id: string): PrivateNote | undefined {
      const row = db.prepare('SELECT * FROM private_notes WHERE id = ?').get(id) as PrivateNoteRow | undefined;
      return row ? rowToNote(row) : undefined;
    },

    findByCueAndUser(cueId: string, userId: string): PrivateNote | undefined {
      const row = db.prepare(
        'SELECT * FROM private_notes WHERE cue_id = ? AND user_id = ?'
      ).get(cueId, userId) as PrivateNoteRow | undefined;
      return row ? rowToNote(row) : undefined;
    },

    findByCue(cueId: string): PrivateNote[] {
      const rows = db.prepare('SELECT * FROM private_notes WHERE cue_id = ?').all(cueId) as PrivateNoteRow[];
      return rows.map(rowToNote);
    },

    /** Upsert — tworzy lub aktualizuje notatkę (cue_id, user_id) */
    upsert(cueId: string, userId: string, content: string): PrivateNote {
      const existing = this.findByCueAndUser(cueId, userId);
      if (existing) {
        db.prepare('UPDATE private_notes SET content = ? WHERE id = ?').run(content, existing.id);
        return this.findById(existing.id)!;
      }
      return this.create({ cue_id: cueId, user_id: userId, content });
    },

    /** Pobiera wszystkie notatki użytkownika w danym rundownie (JOIN z cues) */
    findByRundownAndUser(rundownId: string, userId: string): PrivateNote[] {
      const rows = db.prepare(`
        SELECT pn.* FROM private_notes pn
        JOIN cues c ON c.id = pn.cue_id
        WHERE c.rundown_id = ? AND pn.user_id = ?
      `).all(rundownId, userId) as PrivateNoteRow[];
      return rows.map(rowToNote);
    },

    /** Usuwa notatkę po cue_id i user_id */
    deleteByCueAndUser(cueId: string, userId: string): boolean {
      const result = db.prepare(
        'DELETE FROM private_notes WHERE cue_id = ? AND user_id = ?'
      ).run(cueId, userId);
      return result.changes > 0;
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM private_notes WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
