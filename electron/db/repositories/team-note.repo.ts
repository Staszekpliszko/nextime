import Database from 'better-sqlite3';
import { generateId } from './base';

// ── Typy ────────────────────────────────────────────────────────

export interface TeamNote {
  id: string;
  rundown_id: string;
  cue_id: string | null;
  author_name: string;
  content: string;
  resolved: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTeamNoteInput {
  rundown_id: string;
  cue_id?: string | null;
  author_name: string;
  content: string;
}

export interface UpdateTeamNoteInput {
  content?: string;
  resolved?: boolean;
}

// ── Row z SQLite ────────────────────────────────────────────────

interface TeamNoteRow {
  id: string;
  rundown_id: string;
  cue_id: string | null;
  author_name: string;
  content: string;
  resolved: number;
  created_at: string;
  updated_at: string;
}

function rowToNote(row: TeamNoteRow): TeamNote {
  return {
    id: row.id,
    rundown_id: row.rundown_id,
    cue_id: row.cue_id,
    author_name: row.author_name,
    content: row.content,
    resolved: row.resolved === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── Fabryka repozytorium ────────────────────────────────────────

export function createTeamNoteRepo(db: Database.Database) {
  return {
    /** Tworzy nową notatkę zespołową */
    create(input: CreateTeamNoteInput): TeamNote {
      const id = generateId();
      db.prepare(`
        INSERT INTO team_notes (id, rundown_id, cue_id, author_name, content)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, input.rundown_id, input.cue_id ?? null, input.author_name, input.content);
      return this.findById(id)!;
    },

    /** Pobiera notatkę po ID */
    findById(id: string): TeamNote | undefined {
      const row = db.prepare('SELECT * FROM team_notes WHERE id = ?').get(id) as TeamNoteRow | undefined;
      return row ? rowToNote(row) : undefined;
    },

    /** Pobiera wszystkie notatki dla rundownu (sortowane od najnowszej) */
    findByRundown(rundownId: string): TeamNote[] {
      const rows = db.prepare(
        'SELECT * FROM team_notes WHERE rundown_id = ? ORDER BY created_at DESC, rowid DESC'
      ).all(rundownId) as TeamNoteRow[];
      return rows.map(rowToNote);
    },

    /** Pobiera notatki dla konkretnego cue (sortowane od najnowszej) */
    findByCue(cueId: string): TeamNote[] {
      const rows = db.prepare(
        'SELECT * FROM team_notes WHERE cue_id = ? ORDER BY created_at DESC, rowid DESC'
      ).all(cueId) as TeamNoteRow[];
      return rows.map(rowToNote);
    },

    /** Aktualizuje treść i/lub status notatki */
    update(id: string, input: UpdateTeamNoteInput): TeamNote | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.content !== undefined) {
        fields.push('content = ?');
        values.push(input.content);
      }
      if (input.resolved !== undefined) {
        fields.push('resolved = ?');
        values.push(input.resolved ? 1 : 0);
      }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE team_notes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    /** Toggle resolved — wygodny skrót */
    toggleResolved(id: string, resolved: boolean): TeamNote | undefined {
      return this.update(id, { resolved });
    },

    /** Usuwa notatkę */
    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM team_notes WHERE id = ?').run(id);
      return result.changes > 0;
    },

    /** Liczba nierozwiązanych notatek w rundownie */
    countUnresolved(rundownId: string): number {
      const row = db.prepare(
        'SELECT COUNT(*) as cnt FROM team_notes WHERE rundown_id = ? AND resolved = 0'
      ).get(rundownId) as { cnt: number };
      return row.cnt;
    },
  };
}
