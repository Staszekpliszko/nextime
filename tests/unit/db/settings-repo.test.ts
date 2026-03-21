import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/test-db';
import { createSettingsRepo } from '../../../electron/db/repositories/settings.repo';
import type Database from 'better-sqlite3';

describe('SettingsRepo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createSettingsRepo>;

  beforeEach(() => {
    db = createTestDb();
    repo = createSettingsRepo(db);
  });

  it('get() zwraca undefined dla nieistniejącego klucza', () => {
    expect(repo.get('nieistniejący')).toBeUndefined();
  });

  it('set() + get() — zapis i odczyt wartości', () => {
    repo.set('osc.host', '192.168.1.100');
    expect(repo.get('osc.host')).toBe('192.168.1.100');
  });

  it('set() nadpisuje istniejącą wartość (upsert)', () => {
    repo.set('osc.port', '8000');
    repo.set('osc.port', '9000');
    expect(repo.get('osc.port')).toBe('9000');
  });

  it('getAll() zwraca mapę key→value', () => {
    repo.set('osc.host', '127.0.0.1');
    repo.set('osc.port', '8000');
    repo.set('midi.channel', '1');

    const all = repo.getAll();
    expect(all['osc.host']).toBe('127.0.0.1');
    expect(all['osc.port']).toBe('8000');
    expect(all['midi.channel']).toBe('1');
  });

  it('getByPrefix() filtruje po prefiksie i obcina go', () => {
    repo.set('osc.host', '10.0.0.1');
    repo.set('osc.port', '5555');
    repo.set('midi.channel', '3');

    const oscSettings = repo.getByPrefix('osc.');
    expect(oscSettings).toEqual({ host: '10.0.0.1', port: '5555' });
    expect(oscSettings['channel']).toBeUndefined();
  });

  it('setMany() zapisuje wiele kluczy w transakcji', () => {
    repo.setMany({
      'atem.ip': '192.168.10.240',
      'atem.meIndex': '0',
      'atem.enabled': 'true',
    });

    expect(repo.get('atem.ip')).toBe('192.168.10.240');
    expect(repo.get('atem.meIndex')).toBe('0');
    expect(repo.get('atem.enabled')).toBe('true');
  });

  it('delete() usuwa klucz i zwraca true', () => {
    repo.set('tmp.key', 'wartość');
    const deleted = repo.delete('tmp.key');
    expect(deleted).toBe(true);
    expect(repo.get('tmp.key')).toBeUndefined();
  });

  it('delete() zwraca false dla nieistniejącego klucza', () => {
    const deleted = repo.delete('brak.klucza');
    expect(deleted).toBe(false);
  });

  it('getRow() zwraca pełny rekord z updated_at', () => {
    repo.set('test.key', 'test.value');
    const row = repo.getRow('test.key');
    expect(row).toBeDefined();
    expect(row!.key).toBe('test.key');
    expect(row!.value).toBe('test.value');
    expect(row!.updated_at).toBeDefined();
  });
});
