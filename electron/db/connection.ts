import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db: Database.Database | null = null;

/**
 * Zwraca singleton instancji bazy danych.
 * Przy pierwszym wywołaniu otwiera plik i ustawia PRAGMAy.
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(app.getPath('userData'), 'nextime.db');
  db = openDatabase(dbPath);
  return db;
}

/**
 * Otwiera bazę danych z podanej ścieżki i ustawia PRAGMAy.
 * Używane też przez testy z ':memory:'.
 */
export function openDatabase(dbPath: string): Database.Database {
  const database = new Database(dbPath);

  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('synchronous = NORMAL');

  return database;
}

/**
 * Zamyka połączenie z bazą danych.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
