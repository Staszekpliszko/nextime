import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PanasonicHttpDriver } from '../../electron/senders/ptz-drivers/panasonic-http-driver';
import { PtzSender } from '../../electron/senders/ptz-sender';
import type { PtzCameraConfig } from '../../electron/senders/ptz-sender';

// ── PanasonicHttpDriver ─────────────────────────────────

describe('PanasonicHttpDriver', () => {
  let driver: PanasonicHttpDriver;

  beforeEach(() => {
    driver = new PanasonicHttpDriver({ ip: '192.168.1.10', port: 80, timeout: 1000 });
  });

  afterEach(async () => {
    await driver.destroy();
  });

  it('zwraca protocol = panasonic_http', () => {
    expect(driver.protocol).toBe('panasonic_http');
  });

  it('connect() bez IP zwraca błąd', async () => {
    const noIpDriver = new PanasonicHttpDriver({ ip: '', port: 80 });
    const result = await noIpDriver.connect();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Nie podano adresu IP');
    await noIpDriver.destroy();
  });

  it('connect() z IP ustawia connected=true (bez weryfikacji)', async () => {
    // Przechwytujemy request żeby nie wysyłać do prawdziwego IP
    driver.onRequest = () => {
      throw new Error('connection refused');
    };
    const result = await driver.connect();
    // Nawet bez odpowiedzi QID — powinno się połączyć
    expect(result.ok).toBe(true);
    expect(driver.isConnected()).toBe(true);
  });

  it('recallPreset(1) wysyła prawidłowy URL CGI', async () => {
    // Łączymy z przechwyceniem
    driver.onRequest = () => { throw new Error('skip'); };
    await driver.connect();

    const urls: string[] = [];
    driver.onRequest = (url) => { urls.push(url); };

    // Mock _httpGet żeby nie robił prawdziwego requestu
    // Zamiast tego używamy onRequest do przechwycenia URL
    // ale _httpGet dalej rzuci błąd sieciowy - to OK, sprawdzamy URL
    await driver.recallPreset(1).catch(() => {});

    expect(urls.length).toBe(1);
    // Preset 1 → dwucyfrowy → 01, %23 = #
    expect(urls[0]).toBe('/cgi-bin/aw_ptz?cmd=%23R01&res=1');
  });

  it('recallPreset(99) wysyła URL z R99', async () => {
    driver.onRequest = () => { throw new Error('skip'); };
    await driver.connect();

    const urls: string[] = [];
    driver.onRequest = (url) => { urls.push(url); };
    await driver.recallPreset(99).catch(() => {});

    expect(urls[0]).toBe('/cgi-bin/aw_ptz?cmd=%23R99&res=1');
  });

  it('recallPreset() bez connect zwraca błąd', async () => {
    const result = await driver.recallPreset(1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Nie połączono');
  });

  it('panTilt(10, 10, 1, 0) wysyła prawidłowy URL PTS (prawo, brak tiltu)', async () => {
    driver.onRequest = () => { throw new Error('skip'); };
    await driver.connect();

    const urls: string[] = [];
    driver.onRequest = (url) => { urls.push(url); };
    await driver.panTilt(10, 10, 1, 0).catch(() => {});

    // panDir=1, speed=10 → pp = 50 + 10 = 60
    // tiltDir=0, speed=10 → ale dir=0 → oba=0 → stop? NIE: panDir=1 więc nie oba=0
    // tiltDir=0 → tt = 50 + 0*10 = 50
    expect(urls[0]).toBe('/cgi-bin/aw_ptz?cmd=%23PTS6050&res=1');
  });

  it('panTilt(5, 8, -1, -1) wysyła URL lewo+góra', async () => {
    driver.onRequest = () => { throw new Error('skip'); };
    await driver.connect();

    const urls: string[] = [];
    driver.onRequest = (url) => { urls.push(url); };
    await driver.panTilt(5, 8, -1, -1).catch(() => {});

    // panDir=-1, speed=5 → pp = 50 + (-1*5) = 45
    // tiltDir=-1, speed=8 → tt = 50 + (-1*8) = 42
    expect(urls[0]).toBe('/cgi-bin/aw_ptz?cmd=%23PTS4542&res=1');
  });

  it('panTilt(0, 0, 0, 0) wywołuje stop (PTS5050)', async () => {
    driver.onRequest = () => { throw new Error('skip'); };
    await driver.connect();

    const urls: string[] = [];
    driver.onRequest = (url) => { urls.push(url); };
    await driver.panTilt(0, 0, 0, 0).catch(() => {});

    expect(urls[0]).toBe('/cgi-bin/aw_ptz?cmd=%23PTS5050&res=1');
  });

  it('stop() wysyła URL PTS5050', async () => {
    driver.onRequest = () => { throw new Error('skip'); };
    await driver.connect();

    const urls: string[] = [];
    driver.onRequest = (url) => { urls.push(url); };
    await driver.stop().catch(() => {});

    expect(urls[0]).toBe('/cgi-bin/aw_ptz?cmd=%23PTS5050&res=1');
  });

  it('getStatus() zwraca prawidłowy status', async () => {
    const status = driver.getStatus();
    expect(status.protocol).toBe('panasonic_http');
    expect(status.connected).toBe(false);
    expect(status.lastError).toBeUndefined();
  });

  it('destroy() rozłącza i czyści callback', async () => {
    driver.onRequest = () => { throw new Error('skip'); };
    await driver.connect();
    expect(driver.isConnected()).toBe(true);

    await driver.destroy();
    expect(driver.isConnected()).toBe(false);
    expect(driver.onRequest).toBeNull();
  });

  it('getModelName() zwraca undefined przed connect', () => {
    expect(driver.getModelName()).toBeUndefined();
  });
});

// ── Integracja z PtzSender ──────────────────────────────

describe('PtzSender — panasonic_http', () => {
  it('tworzy PanasonicHttpDriver dla protokołu panasonic_http', async () => {
    const camera: PtzCameraConfig = {
      number: 1,
      ip: '192.168.1.50',
      port: 80,
      protocol: 'panasonic_http',
    };

    const sender = new PtzSender({
      enabled: true,
      cameras: [camera],
    });

    // connectCamera tworzy driver i próbuje connect
    // onRequest przechwytuje żeby nie robić prawdziwego HTTP
    const commands: Array<{ type: string; cameraNumber: number }> = [];
    sender.onCommand = (cmd) => { commands.push(cmd); };

    // Po connect driver powinien istnieć
    const result = await sender.connectCamera(1);
    expect(result.ok).toBe(true);

    // Status powinien wskazywać panasonic_http
    const status = sender.getCameraStatus(1);
    expect(status).not.toBeNull();
    expect(status!.protocol).toBe('panasonic_http');
    expect(status!.connected).toBe(true);

    sender.destroy();
  });
});
