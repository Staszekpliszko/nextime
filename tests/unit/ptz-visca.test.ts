import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  buildRecallPresetCmd,
  buildPanTiltCmd,
  buildStopCmd,
  buildZoomCmd,
  parseViscaResponse,
  viscaHeader,
} from '../../electron/senders/ptz-drivers/visca-protocol';
import { PtzSender } from '../../electron/senders/ptz-sender';
import type { PtzCameraConfig } from '../../electron/senders/ptz-sender';

// ── Testy VISCA protocol helpers ────────────────────────

describe('VISCA Protocol', () => {
  it('viscaHeader generuje poprawny bajt nagłówka', () => {
    expect(viscaHeader(1)).toBe(0x81); // default address
    expect(viscaHeader(2)).toBe(0x82);
    expect(viscaHeader(7)).toBe(0x87);
  });

  it('buildRecallPresetCmd generuje poprawne bajty', () => {
    // Memory Recall preset 5 na adresie 1: 81 01 04 3F 02 05 FF
    const cmd = buildRecallPresetCmd(1, 5);
    expect(cmd).toEqual(Buffer.from([0x81, 0x01, 0x04, 0x3F, 0x02, 0x05, 0xFF]));
  });

  it('buildRecallPresetCmd ogranicza preset do 0-255', () => {
    const cmd = buildRecallPresetCmd(1, 300);
    // 300 & 0xFF = 44
    expect(cmd[5]).toBe(44);
  });

  it('buildPanTiltCmd generuje poprawne bajty — prawo+góra', () => {
    // Pan right (dir=1) + Tilt up (dir=-1)
    const cmd = buildPanTiltCmd(1, 10, 5, 1, -1);
    expect(cmd[0]).toBe(0x81); // header
    expect(cmd[1]).toBe(0x01);
    expect(cmd[2]).toBe(0x06);
    expect(cmd[3]).toBe(0x01);
    expect(cmd[4]).toBe(10); // pan speed
    expect(cmd[5]).toBe(5);  // tilt speed
    expect(cmd[6]).toBe(0x02); // right
    expect(cmd[7]).toBe(0x01); // up
    expect(cmd[8]).toBe(0xFF); // terminator
  });

  it('buildStopCmd generuje komendę stop', () => {
    const cmd = buildStopCmd(1);
    expect(cmd[6]).toBe(0x03); // pan stop
    expect(cmd[7]).toBe(0x03); // tilt stop
  });

  it('buildZoomCmd — tele z prędkością', () => {
    const cmd = buildZoomCmd(1, 1, 5); // zoom in, speed 5
    expect(cmd[4]).toBe(0x25); // 0x20 | 5
  });

  it('buildZoomCmd — wide', () => {
    const cmd = buildZoomCmd(1, -1, 3); // zoom out, speed 3
    expect(cmd[4]).toBe(0x33); // 0x30 | 3
  });

  it('buildZoomCmd — stop', () => {
    const cmd = buildZoomCmd(1, 0);
    expect(cmd[4]).toBe(0x00); // stop
  });

  it('parseViscaResponse — ACK', () => {
    const resp = parseViscaResponse(Buffer.from([0x90, 0x41, 0xFF]));
    expect(resp.type).toBe('ack');
    expect(resp.socket).toBe(1);
  });

  it('parseViscaResponse — Completion', () => {
    const resp = parseViscaResponse(Buffer.from([0x90, 0x51, 0xFF]));
    expect(resp.type).toBe('completion');
    expect(resp.socket).toBe(1);
  });

  it('parseViscaResponse — Error', () => {
    const resp = parseViscaResponse(Buffer.from([0x90, 0x61, 0x02, 0xFF]));
    expect(resp.type).toBe('error');
    expect(resp.errorCode).toBe(0x02);
  });

  it('parseViscaResponse — zbyt krótki pakiet', () => {
    const resp = parseViscaResponse(Buffer.from([0x90, 0x41]));
    expect(resp.type).toBe('unknown');
  });
});

// ── Testy PtzSender ─────────────────────────────────────

describe('PtzSender', () => {
  let engine: EventEmitter;
  let sender: PtzSender;

  const cameras: PtzCameraConfig[] = [
    { number: 1, ip: '192.168.1.100', port: 52381, protocol: 'visca_ip' },
    { number: 2, ip: '192.168.1.101', port: 80, protocol: 'onvif' },
    { number: 3, ip: '', port: 0, protocol: 'visca_serial', serialPath: 'COM3', serialBaudRate: 9600 },
    { number: 4, ip: '192.168.1.104', port: 80, protocol: 'ndi' },
  ];

  beforeEach(() => {
    engine = new EventEmitter();
    sender = new PtzSender({ enabled: true, cameras });
    sender.attach(engine);
  });

  it('wywołuje onCommand przy vision-cue-changed', () => {
    const commands: unknown[] = [];
    sender.onCommand = (cmd) => commands.push(cmd);

    engine.emit('vision-cue-changed', { data: { camera_number: 1 } }, null);
    expect(commands).toHaveLength(1);
    expect((commands[0] as { cameraNumber: number }).cameraNumber).toBe(1);
  });

  it('nie wywołuje onCommand gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    const commands: unknown[] = [];
    sender.onCommand = (cmd) => commands.push(cmd);

    engine.emit('vision-cue-changed', { data: { camera_number: 1 } }, null);
    expect(commands).toHaveLength(0);
  });

  it('nie wywołuje onCommand przy null cue', () => {
    const commands: unknown[] = [];
    sender.onCommand = (cmd) => commands.push(cmd);

    engine.emit('vision-cue-changed', null, null);
    expect(commands).toHaveLength(0);
  });

  it('getCameraStatus zwraca null dla nieznanej kamery', () => {
    expect(sender.getCameraStatus(99)).toBeNull();
  });

  it('getCameraStatus zwraca status kamery (niepołączonej)', () => {
    const status = sender.getCameraStatus(1);
    expect(status).not.toBeNull();
    expect(status!.protocol).toBe('visca_ip');
    expect(status!.connected).toBe(false);
  });

  it('getAllCameraStatuses zwraca 4 kamery', () => {
    const statuses = sender.getAllCameraStatuses();
    expect(statuses).toHaveLength(4);
    expect(statuses[0]!.protocol).toBe('visca_ip');
    expect(statuses[1]!.protocol).toBe('onvif');
    expect(statuses[2]!.protocol).toBe('visca_serial');
    expect(statuses[3]!.protocol).toBe('ndi');
  });

  it('connectCamera zwraca błąd dla nieznanej kamery', async () => {
    const result = await sender.connectCamera(99);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('nie jest skonfigurowana');
  });

  it('disconnectCamera nie rzuca wyjątku dla nieznanej kamery', async () => {
    // Nie powinno rzucić
    await sender.disconnectCamera(99);
  });

  it('getConfig zwraca kopię konfiguracji', () => {
    const config = sender.getConfig();
    expect(config.cameras).toHaveLength(4);
    expect(config.enabled).toBe(true);
    // Mutacja nie powinna wpłynąć na sender
    config.cameras.push({ number: 5, ip: '', port: 0, protocol: 'visca_ip' });
    expect(sender.getConfig().cameras).toHaveLength(4);
  });

  it('destroy nie rzuca wyjątku', () => {
    sender.destroy();
    // Ponowne destroy też nie powinno
    sender.destroy();
  });
});
