import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../helpers/test-db';
import { createSettingsRepo } from '../../electron/db/repositories/settings.repo';
import { SettingsManager } from '../../electron/settings-manager';
import { SenderManager } from '../../electron/senders';
import type Database from 'better-sqlite3';

describe('SettingsManager', () => {
  let db: Database.Database;
  let manager: SettingsManager;

  beforeEach(() => {
    db = createTestDb();
    const repo = createSettingsRepo(db);
    manager = new SettingsManager(repo);
  });

  it('getAll() zwraca domyślne ustawienia gdy baza jest pusta', () => {
    manager.loadAll();
    const all = manager.getAll();
    expect(all.osc.host).toBe('127.0.0.1');
    expect(all.osc.port).toBe(8000);
    expect(all.osc.enabled).toBe(true);
    expect(all.midi.defaultChannel).toBe(1);
    expect(all.atem.ip).toBe('192.168.10.240');
    expect(all.ltc.source).toBe('internal');
  });

  it('getSection() zwraca kopię ustawień sekcji', () => {
    manager.loadAll();
    const osc = manager.getSection('osc');
    expect(osc.host).toBe('127.0.0.1');
    // Modyfikacja kopii nie wpływa na oryginał
    osc.host = '999.999.999.999';
    expect(manager.getSection('osc').host).toBe('127.0.0.1');
  });

  it('updateSection() zapisuje do cache i DB', () => {
    manager.loadAll();
    manager.updateSection('osc', { host: '10.0.0.1', port: 9999 });

    const osc = manager.getSection('osc');
    expect(osc.host).toBe('10.0.0.1');
    expect(osc.port).toBe(9999);
    expect(osc.enabled).toBe(true); // nie zmieniony

    // Sprawdź czy zapisano do DB
    const repo = createSettingsRepo(db);
    expect(repo.get('osc.host')).toBe('10.0.0.1');
    expect(repo.get('osc.port')).toBe('9999');
  });

  it('loadAll() wczytuje ustawienia z DB', () => {
    // Zapisz do DB ręcznie
    const repo = createSettingsRepo(db);
    repo.set('osc.host', '192.168.1.50');
    repo.set('osc.port', '7777');
    repo.set('osc.enabled', 'false');

    manager.loadAll();
    const osc = manager.getSection('osc');
    expect(osc.host).toBe('192.168.1.50');
    expect(osc.port).toBe(7777);
    expect(osc.enabled).toBe(false);
  });

  it('loadAll() ignoruje nieprawidłowe wartości numeryczne', () => {
    const repo = createSettingsRepo(db);
    repo.set('osc.port', 'abc');

    manager.loadAll();
    const osc = manager.getSection('osc');
    expect(osc.port).toBe(8000); // domyślna wartość
  });

  it('updateSection() z tablicą (PTZ cameras)', () => {
    manager.loadAll();
    const cameras = [
      { number: 1, ip: '10.0.0.10', port: 52381, protocol: 'visca_ip' as const },
    ];
    manager.updateSection('ptz', { cameras, enabled: true });

    const ptz = manager.getSection('ptz');
    expect(ptz.enabled).toBe(true);
    expect(ptz.cameras).toHaveLength(1);
    expect(ptz.cameras[0]!.ip).toBe('10.0.0.10');
  });

  it('applyToSenders() propaguje ustawienia do SenderManager', () => {
    manager.loadAll();
    manager.updateSection('osc', { host: '10.10.10.10', port: 5000 });

    const sm = new SenderManager();
    manager.applyToSenders(sm);

    expect(sm.osc.getConfig().host).toBe('10.10.10.10');
    expect(sm.osc.getConfig().port).toBe(5000);
  });

  it('applySectionToSender() propaguje jedną sekcję', () => {
    manager.loadAll();
    manager.updateSection('midi', { defaultChannel: 5, enabled: false });

    const sm = new SenderManager();
    manager.applySectionToSender('midi', sm);

    expect(sm.midi.getConfig().defaultChannel).toBe(5);
    expect(sm.midi.getConfig().enabled).toBe(false);
  });
});
