import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PtzSender } from '../../electron/senders/ptz-sender';

describe('PtzSender', () => {
  let sender: PtzSender;
  let engine: EventEmitter;

  beforeEach(() => {
    sender = new PtzSender({
      enabled: true,
      cameras: [
        { number: 1, ip: '192.168.1.10', port: 52381, protocol: 'visca_ip' },
        { number: 2, ip: '192.168.1.11', port: 52381, protocol: 'visca_ip' },
      ],
    });
    engine = new EventEmitter();
  });

  afterEach(() => {
    sender.destroy();
  });

  // ── Recall preset ──────────────────────────────────────

  it('powinno recall preset na kamerze z konfiguracją', () => {
    const commands: Array<{ type: string; cameraNumber: number; ip?: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);

    sender.recallPreset(1);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      type: 'recall_preset',
      cameraNumber: 1,
      ip: '192.168.1.10',
      port: 52381,
    });
  });

  it('powinno recall preset na kamerze bez konfiguracji', () => {
    const commands: Array<{ type: string; cameraNumber: number; ip?: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);

    sender.recallPreset(5); // Kamera 5 nie jest skonfigurowana

    expect(commands).toHaveLength(1);
    expect(commands[0]!.cameraNumber).toBe(5);
    expect(commands[0]!.ip).toBeUndefined();
  });

  it('powinno ignorować gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);

    sender.recallPreset(1);

    expect(commands).toHaveLength(0);
  });

  // ── Attach / vision-cue-changed ────────────────────────

  it('powinno reagować na vision-cue-changed z engine', () => {
    const commands: Array<{ type: string; cameraNumber: number }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.attach(engine);

    engine.emit('vision-cue-changed', {
      data: { camera_number: 2, shot_name: 'WS' },
    }, null);

    expect(commands).toHaveLength(1);
    expect(commands[0]!.cameraNumber).toBe(2);
  });

  it('powinno ignorować null activeCue', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.attach(engine);

    engine.emit('vision-cue-changed', null, null);

    expect(commands).toHaveLength(0);
  });

  it('powinno ignorować brak camera_number', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.attach(engine);

    engine.emit('vision-cue-changed', {
      data: { shot_name: 'MCU' },
    }, null);

    expect(commands).toHaveLength(0);
  });

  // ── Config ─────────────────────────────────────────────

  it('powinno zwracać konfigurację', () => {
    const config = sender.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.cameras).toHaveLength(2);
  });

  it('powinno aktualizować konfigurację', () => {
    sender.updateConfig({ enabled: false });
    expect(sender.getConfig().enabled).toBe(false);
  });

  // ── Destroy ────────────────────────────────────────────

  it('powinno poprawnie zniszczyć sendera', () => {
    sender.destroy();
    expect(sender.onCommand).toBeNull();
  });
});
