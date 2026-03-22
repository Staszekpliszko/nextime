import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { SenderManager } from '../../electron/senders';
import { ObsSender } from '../../electron/senders/obs-sender';

describe('OBS Integration (SenderManager)', () => {
  let manager: SenderManager;

  beforeEach(() => {
    manager = new SenderManager({
      obs: { enabled: true, ip: '127.0.0.1', port: 4455, autoSwitch: true, sceneMap: { 1: 'Wide' } },
    });
  });

  afterEach(() => {
    manager.destroy();
  });

  it('powinno tworzyć ObsSender w SenderManager', () => {
    expect(manager.obs).toBeInstanceOf(ObsSender);
  });

  it('powinno podpiąć ObsSender do engine przez attach', () => {
    const engine = new EventEmitter();
    // attach nie powinno rzucić wyjątku
    expect(() => manager.attach(engine)).not.toThrow();
  });

  it('powinno zniszczyć ObsSender przy destroy', () => {
    const destroySpy = vi.spyOn(manager.obs, 'destroy');
    manager.destroy();
    expect(destroySpy).toHaveBeenCalled();
  });
});

describe('OBS Settings Integration', () => {
  it('powinno ObsSettings mieć prawidłowe defaults', async () => {
    // Dynamiczny import SettingsManager żeby przetestować domyślne wartości
    const { SettingsManager } = await import('../../electron/settings-manager');

    // Tworzymy mock repo
    const mockRepo = {
      getAll: () => ({}),
      get: () => undefined,
      set: vi.fn(),
      setMany: vi.fn(),
      delete: vi.fn(),
    };

    const settings = new SettingsManager(mockRepo as ReturnType<typeof import('../../electron/db/repositories/settings.repo').createSettingsRepo>);
    settings.loadAll();

    const obs = settings.getSection('obs');
    expect(obs.ip).toBe('127.0.0.1');
    expect(obs.port).toBe(4455);
    expect(obs.password).toBe('');
    expect(obs.enabled).toBe(false);
    expect(obs.autoSwitch).toBe(true);
    expect(obs.sceneMap).toEqual({});
  });

  it('powinno SettingsManager obsłużyć updateSection obs', async () => {
    const { SettingsManager } = await import('../../electron/settings-manager');

    const mockRepo = {
      getAll: () => ({}),
      get: () => undefined,
      set: vi.fn(),
      setMany: vi.fn(),
      delete: vi.fn(),
    };

    const settings = new SettingsManager(mockRepo as ReturnType<typeof import('../../electron/db/repositories/settings.repo').createSettingsRepo>);
    settings.loadAll();

    settings.updateSection('obs', { ip: '10.0.0.5', port: 5555, sceneMap: { 1: 'Test' } });

    const obs = settings.getSection('obs');
    expect(obs.ip).toBe('10.0.0.5');
    expect(obs.port).toBe(5555);
    expect(obs.sceneMap).toEqual({ 1: 'Test' });
    // Reszta powinna zostać domyślna
    expect(obs.password).toBe('');
    expect(obs.enabled).toBe(false);
    expect(obs.autoSwitch).toBe(true);
  });

  it('powinno SettingsManager propagować obs do sendera', async () => {
    const { SettingsManager } = await import('../../electron/settings-manager');

    const mockRepo = {
      getAll: () => ({}),
      get: () => undefined,
      set: vi.fn(),
      setMany: vi.fn(),
      delete: vi.fn(),
    };

    const settings = new SettingsManager(mockRepo as ReturnType<typeof import('../../electron/db/repositories/settings.repo').createSettingsRepo>);
    settings.loadAll();

    settings.updateSection('obs', { ip: '192.168.1.100', enabled: true });

    const manager = new SenderManager();
    const updateSpy = vi.spyOn(manager.obs, 'updateConfig');

    settings.applyToSenders(manager);
    expect(updateSpy).toHaveBeenCalled();

    const callArg = updateSpy.mock.calls[0]![0];
    expect(callArg.ip).toBe('192.168.1.100');
    expect(callArg.enabled).toBe(true);

    manager.destroy();
  });
});
