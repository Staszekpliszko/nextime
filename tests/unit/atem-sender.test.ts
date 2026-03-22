import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { AtemSender } from '../../electron/senders/atem-sender';

describe('AtemSender', () => {
  let sender: AtemSender;
  let engine: EventEmitter;

  beforeEach(() => {
    // forcePlaceholder: true — testy nie łączą się z prawdziwym hardware
    sender = new AtemSender({ enabled: true, ip: '192.168.10.240', meIndex: 0, autoSwitch: true }, { forcePlaceholder: true });
    engine = new EventEmitter();
  });

  afterEach(() => {
    sender.destroy();
  });

  // ── Połączenie ──────────────────────────────────────────

  it('powinno połączyć się z ATEM (placeholder)', () => {
    sender.connect();
    const status = sender.getStatus();
    expect(status.connected).toBe(true);
    expect(status.modelName).toBe('ATEM Placeholder');
    expect(status.programInput).toBe(1);
    expect(status.previewInput).toBe(2);
  });

  it('powinno emitować event connected', () => {
    const spy = vi.fn();
    sender.on('connected', spy);
    sender.connect();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('powinno rozłączyć się z ATEM', () => {
    sender.connect();
    sender.disconnect();
    const status = sender.getStatus();
    expect(status.connected).toBe(false);
    expect(status.programInput).toBeNull();
    expect(status.previewInput).toBeNull();
    expect(status.modelName).toBeNull();
  });

  it('powinno emitować event disconnected', () => {
    sender.connect();
    const spy = vi.fn();
    sender.on('disconnected', spy);
    sender.disconnect();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('powinno nie łączyć gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    sender.connect();
    expect(sender.getStatus().connected).toBe(false);
  });

  // ── Auto-switch ─────────────────────────────────────────

  it('powinno wykonać CUT przy zmianie vision cue (auto-switch)', () => {
    const commands: Array<{ type: string; input?: number }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.handleVisionCueChanged({
      data: { camera_number: 3, shot_name: 'MCU', color: '#3b82f6' },
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({ type: 'cut', input: 3, me: 0 });
    expect(sender.getStatus().programInput).toBe(3);
  });

  it('powinno ignorować gdy auto-switch wyłączony', () => {
    sender.updateConfig({ autoSwitch: false });
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.handleVisionCueChanged({
      data: { camera_number: 3 },
    });

    expect(commands).toHaveLength(0);
  });

  it('powinno ignorować gdy nie połączony', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);

    sender.handleVisionCueChanged({
      data: { camera_number: 3 },
    });

    expect(commands).toHaveLength(0);
  });

  it('powinno ignorować gdy activeCue jest null', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.handleVisionCueChanged(null);

    expect(commands).toHaveLength(0);
  });

  it('powinno ignorować gdy camera_number brak w danych', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.handleVisionCueChanged({ data: { shot_name: 'MCU' } });

    expect(commands).toHaveLength(0);
  });

  it('powinno nie przełączać gdy input jest już na programie', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();
    // Program startuje na 1
    sender.handleVisionCueChanged({ data: { camera_number: 1 } });

    expect(commands).toHaveLength(0);
  });

  it('powinno wykonać MIX gdy transitionType=mix', () => {
    sender.updateConfig({ transitionType: 'mix', mixDurationFrames: 12 });
    const commands: Array<{ type: string; input?: number; duration?: number }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.handleVisionCueChanged({ data: { camera_number: 5 } });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({ type: 'mix', input: 5, me: 0, duration: 12 });
  });

  it('attach nie dodaje bezpośredniego listenera vision-cue-changed (routing przez VisionRouter)', () => {
    sender.attach(engine);
    sender.connect();

    // Od Fazy 27 AtemSender nie nasłuchuje bezpośrednio — VisionRouter to robi
    expect(engine.listenerCount('vision-cue-changed')).toBe(0);
  });

  // ── Guards when disconnected ──────────────────────────────

  it('performCut powinno być no-op gdy niepołączony', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    // NIE wywołujemy connect()
    sender.performCut(3);
    expect(commands).toHaveLength(0);
  });

  it('performMix powinno być no-op gdy niepołączony', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.performMix(3, 25);
    expect(commands).toHaveLength(0);
  });

  it('setPreview powinno być no-op gdy niepołączony', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.setPreview(3);
    expect(commands).toHaveLength(0);
  });

  // ── Manual override ──────────────────────────────────────

  it('powinno performCut ręcznie', () => {
    const commands: Array<{ type: string; input?: number }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.performCut(7);

    expect(commands).toEqual([{ type: 'cut', input: 7, me: 0 }]);
    expect(sender.getStatus().programInput).toBe(7);
  });

  it('powinno setPreview ręcznie', () => {
    const commands: Array<{ type: string; input?: number }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.setPreview(6);

    expect(commands).toEqual([{ type: 'preview', input: 6, me: 0 }]);
    expect(sender.getStatus().previewInput).toBe(6);
  });

  it('powinno emitować program-changed event', () => {
    sender.connect();
    const spy = vi.fn();
    sender.on('program-changed', spy);

    sender.performCut(5);

    expect(spy).toHaveBeenCalledWith({ input: 5, me: 0 });
  });

  // ── Konfiguracja ────────────────────────────────────────

  it('powinno zwracać status z konfiguracji', () => {
    sender.updateConfig({ ip: '10.0.0.1', meIndex: 2 });
    const status = sender.getStatus();
    expect(status.ip).toBe('10.0.0.1');
    expect(status.meIndex).toBe(2);
  });

  it('powinno reconnect przy zmianie IP (gdy połączony)', () => {
    sender.connect();
    expect(sender.getStatus().connected).toBe(true);

    const connectedSpy = vi.fn();
    sender.on('connected', connectedSpy);

    sender.updateConfig({ ip: '10.0.0.2' });

    expect(connectedSpy).toHaveBeenCalledTimes(1);
    expect(sender.getStatus().ip).toBe('10.0.0.2');
    expect(sender.getStatus().connected).toBe(true);
  });

  it('powinno nie reconnectować przy zmianie meIndex', () => {
    sender.connect();
    const disconnectedSpy = vi.fn();
    sender.on('disconnected', disconnectedSpy);

    sender.updateConfig({ meIndex: 2 });

    expect(disconnectedSpy).not.toHaveBeenCalled();
    expect(sender.getConfig().meIndex).toBe(2);
  });

  // ── Disabled ─────────────────────────────────────────────

  it('powinno ignorować trigger gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect(); // nie połączy się bo disabled

    sender.handleVisionCueChanged({ data: { camera_number: 3 } });

    expect(commands).toHaveLength(0);
  });

  // ── Destroy ──────────────────────────────────────────────

  it('powinno poprawnie zniszczyć sendera', () => {
    sender.connect();
    sender.destroy();
    expect(sender.getStatus().connected).toBe(false);
    expect(sender.onCommand).toBeNull();
  });

  // ── SenderManager integracja ────────────────────────────

  it('powinno działać z SenderManager', async () => {
    // Importuj dynamicznie, żeby test był niezależny
    const { SenderManager } = await import('../../electron/senders');
    const manager = new SenderManager();
    expect(manager.atem).toBeDefined();
    expect(manager.atem.getStatus().connected).toBe(false);
    manager.destroy();
  });
});
