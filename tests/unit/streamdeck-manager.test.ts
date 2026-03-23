import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StreamDeckManager } from '../../electron/streamdeck/streamdeck-manager';

describe('StreamDeckManager', () => {
  let manager: StreamDeckManager;

  beforeEach(() => {
    manager = new StreamDeckManager();
  });

  afterEach(async () => {
    await manager.close();
  });

  it('getStatus przed open zwraca disconnected', () => {
    const status = manager.getStatus();
    expect(status.connected).toBe(false);
    expect(status.model).toBeNull();
    expect(status.keyCount).toBe(0);
    expect(status.modelName).toBe('');
  });

  it('isConnected przed open zwraca false', () => {
    expect(manager.isConnected).toBe(false);
  });

  it('iconSize zwraca domyślne 72x72 przed open', () => {
    expect(manager.iconSize).toEqual({ width: 72, height: 72 });
  });

  it('listDevices zwraca tablicę (pusta jeśli brak hardware)', async () => {
    const devices = await manager.listDevices();
    expect(Array.isArray(devices)).toBe(true);
  });

  it('close na zamkniętym urządzeniu nie rzuca błędu', async () => {
    // close() na niezainicjalizowanym managerze — nie powinno rzucić
    await expect(manager.close()).resolves.toBeUndefined();
  });

  it('setBrightness na zamkniętym urządzeniu nie rzuca błędu', async () => {
    // setBrightness bez urządzenia — graceful return
    await expect(manager.setBrightness(50)).resolves.toBeUndefined();
  });

  it('clearAllKeys na zamkniętym urządzeniu nie rzuca błędu', async () => {
    await expect(manager.clearAllKeys()).resolves.toBeUndefined();
  });

  it('fillKeyColor na zamkniętym urządzeniu nie rzuca błędu', async () => {
    await expect(manager.fillKeyColor(0, 255, 0, 0)).resolves.toBeUndefined();
  });
});
