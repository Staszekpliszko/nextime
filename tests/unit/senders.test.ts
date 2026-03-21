import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { OscSender, buildOscMessage } from '../../electron/senders/osc-sender';
import { MidiSender } from '../../electron/senders/midi-sender';
import { GpiSender } from '../../electron/senders/gpi-sender';
import { MediaSender } from '../../electron/senders/media-sender';
import { SenderManager } from '../../electron/senders';

// ── OSC Sender ────────────────────────────────────────────

describe('OscSender', () => {
  let sender: OscSender;
  let engine: EventEmitter;

  beforeEach(() => {
    sender = new OscSender({ enabled: true, host: '127.0.0.1', port: 9000 });
    engine = new EventEmitter();
  });

  afterEach(() => {
    sender.destroy();
  });

  it('powinno zbudować poprawny pakiet OSC (string + int)', () => {
    const buf = buildOscMessage('/test/path', [
      { type: 'i', value: 42 },
      { type: 's', value: 'hello' },
    ]);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    // Pakiet zaczyna się od adresu
    expect(buf.toString('ascii', 0, 11)).toContain('/test/path');
  });

  it('powinno zbudować pakiet OSC z float', () => {
    const buf = buildOscMessage('/volume', [{ type: 'f', value: 0.75 }]);
    expect(buf).toBeInstanceOf(Buffer);
    // Type tag: ",f"
    const str = buf.toString('ascii');
    expect(str).toContain('/volume');
  });

  it('powinno zbudować pusty pakiet OSC (brak args)', () => {
    const buf = buildOscMessage('/go', []);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('powinno reagować na osc-trigger z engine', () => {
    sender.attach(engine);
    // Mockujemy send żeby nie wysyłać prawdziwych pakietów UDP
    const sendSpy = vi.spyOn(sender as never, 'send' as never).mockImplementation(() => {});

    engine.emit('osc-trigger', {
      id: 'osc-cue-1',
      type: 'osc',
      data: { address: '/cue/1/go', args: [{ type: 'i', value: 1 }] },
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('powinno ignorować trigger gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    sender.attach(engine);
    const sendSpy = vi.spyOn(sender as never, 'send' as never).mockImplementation(() => {});

    engine.emit('osc-trigger', {
      id: 'osc-cue-1',
      type: 'osc',
      data: { address: '/cue/1/go', args: [] },
    });

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('powinno ostrzec gdy brak adresu OSC', () => {
    sender.attach(engine);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    engine.emit('osc-trigger', {
      id: 'osc-cue-bad',
      type: 'osc',
      data: { args: [] }, // brak address
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('brak adresu OSC'));
    warnSpy.mockRestore();
  });

  it('powinno zwracać i aktualizować konfigurację', () => {
    const config = sender.getConfig();
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(9000);

    sender.updateConfig({ port: 8080 });
    expect(sender.getConfig().port).toBe(8080);
  });
});

// ── MIDI Sender ───────────────────────────────────────────

describe('MidiSender', () => {
  let sender: MidiSender;
  let engine: EventEmitter;

  beforeEach(() => {
    sender = new MidiSender({ enabled: true, defaultChannel: 1 });
    engine = new EventEmitter();
  });

  afterEach(() => {
    sender.destroy();
  });

  it('powinno budować Note On message', () => {
    const messages: Array<{ status: number; data1: number; data2: number }> = [];
    sender.onMessage = (msg) => messages.push(msg);
    sender.attach(engine);

    engine.emit('midi-trigger', {
      id: 'midi-1', type: 'midi',
      data: { message_type: 'note_on', note_or_cc: 60, velocity_or_val: 100 },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.status).toBe(0x90); // Note On, ch 1
    expect(messages[0]!.data1).toBe(60);
    expect(messages[0]!.data2).toBe(100);
  });

  it('powinno budować Note Off message', () => {
    const messages: Array<{ status: number; data1: number; data2: number }> = [];
    sender.onMessage = (msg) => messages.push(msg);
    sender.attach(engine);

    engine.emit('midi-trigger', {
      id: 'midi-2', type: 'midi',
      data: { message_type: 'note_off', note_or_cc: 64, velocity_or_val: 0 },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.status).toBe(0x80); // Note Off, ch 1
  });

  it('powinno budować CC message', () => {
    const messages: Array<{ status: number; data1: number; data2: number }> = [];
    sender.onMessage = (msg) => messages.push(msg);
    sender.attach(engine);

    engine.emit('midi-trigger', {
      id: 'midi-3', type: 'midi',
      data: { message_type: 'cc', note_or_cc: 7, velocity_or_val: 64, channel: 3 },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.status).toBe(0xB0 | 2); // CC, ch 3 (0-indexed: 2)
    expect(messages[0]!.data1).toBe(7);
    expect(messages[0]!.data2).toBe(64);
  });

  it('powinno budować Program Change (2-byte message)', () => {
    const messages: Array<{ status: number; data1: number; raw: number[] }> = [];
    sender.onMessage = (msg) => messages.push(msg);
    sender.attach(engine);

    engine.emit('midi-trigger', {
      id: 'midi-4', type: 'midi',
      data: { message_type: 'program', note_or_cc: 5, velocity_or_val: 0 },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.status).toBe(0xC0); // Program Change, ch 1
    expect(messages[0]!.raw).toHaveLength(2); // Program Change to 2 bajty
  });

  it('powinno clampować wartości MIDI do 0-127', () => {
    const messages: Array<{ data1: number; data2: number }> = [];
    sender.onMessage = (msg) => messages.push(msg);
    sender.attach(engine);

    engine.emit('midi-trigger', {
      id: 'midi-5', type: 'midi',
      data: { message_type: 'note_on', note_or_cc: 200, velocity_or_val: -10 },
    });

    expect(messages[0]!.data1).toBe(127);
    expect(messages[0]!.data2).toBe(0);
  });

  it('powinno ignorować trigger gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    const messages: unknown[] = [];
    sender.onMessage = (msg) => messages.push(msg);
    sender.attach(engine);

    engine.emit('midi-trigger', {
      id: 'midi-6', type: 'midi',
      data: { message_type: 'note_on', note_or_cc: 60, velocity_or_val: 100 },
    });

    expect(messages).toHaveLength(0);
  });
});

// ── GPI Sender ────────────────────────────────────────────

describe('GpiSender', () => {
  let sender: GpiSender;
  let engine: EventEmitter;

  beforeEach(() => {
    sender = new GpiSender({ enabled: true, defaultPulseMs: 100 });
    engine = new EventEmitter();
  });

  afterEach(() => {
    sender.destroy();
  });

  it('powinno wysłać trigger pulse', () => {
    const triggers: Array<{ channel: number; triggerType: string; pulseMs: number }> = [];
    sender.onTrigger = (t) => triggers.push(t);
    sender.attach(engine);

    engine.emit('gpi-trigger', {
      id: 'gpi-1', type: 'gpi',
      data: { channel: 3, trigger_type: 'pulse', pulse_ms: 200 },
    });

    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.channel).toBe(3);
    expect(triggers[0]!.triggerType).toBe('pulse');
    expect(triggers[0]!.pulseMs).toBe(200);
  });

  it('powinno wysłać trigger on/off', () => {
    const triggers: Array<{ channel: number; triggerType: string }> = [];
    sender.onTrigger = (t) => triggers.push(t);
    sender.attach(engine);

    engine.emit('gpi-trigger', {
      id: 'gpi-2', type: 'gpi',
      data: { channel: 1, trigger_type: 'on' },
    });

    expect(triggers[0]!.triggerType).toBe('on');
  });

  it('powinno clampować kanał do 1-8', () => {
    const triggers: Array<{ channel: number }> = [];
    sender.onTrigger = (t) => triggers.push(t);
    sender.attach(engine);

    engine.emit('gpi-trigger', {
      id: 'gpi-3', type: 'gpi',
      data: { channel: 99, trigger_type: 'pulse' },
    });

    expect(triggers[0]!.channel).toBe(8);
  });

  it('powinno używać domyślnego pulse_ms gdy brak w danych', () => {
    const triggers: Array<{ pulseMs: number }> = [];
    sender.onTrigger = (t) => triggers.push(t);
    sender.attach(engine);

    engine.emit('gpi-trigger', {
      id: 'gpi-4', type: 'gpi',
      data: { channel: 1, trigger_type: 'pulse' }, // brak pulse_ms
    });

    expect(triggers[0]!.pulseMs).toBe(100); // defaultPulseMs
  });

  it('powinno ignorować trigger gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    const triggers: unknown[] = [];
    sender.onTrigger = (t) => triggers.push(t);
    sender.attach(engine);

    engine.emit('gpi-trigger', {
      id: 'gpi-5', type: 'gpi',
      data: { channel: 1, trigger_type: 'pulse' },
    });

    expect(triggers).toHaveLength(0);
  });
});

// ── Media Sender ──────────────────────────────────────────

describe('MediaSender', () => {
  let sender: MediaSender;
  let engine: EventEmitter;

  beforeEach(() => {
    sender = new MediaSender({ enabled: true });
    engine = new EventEmitter();
  });

  afterEach(() => {
    sender.destroy();
  });

  it('powinno wysłać trigger media z pełnymi danymi', () => {
    const triggers: Array<{ filePath: string; volume: number; loop: boolean; cueId: string }> = [];
    sender.onTrigger = (t) => triggers.push(t);
    sender.attach(engine);

    engine.emit('media-trigger', {
      id: 'media-1', type: 'media',
      data: { file_path: '/audio/intro.wav', volume: 80, loop: true },
    });

    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.filePath).toBe('/audio/intro.wav');
    expect(triggers[0]!.volume).toBe(80);
    expect(triggers[0]!.loop).toBe(true);
    expect(triggers[0]!.cueId).toBe('media-1');
  });

  it('powinno używać wartości domyślnych', () => {
    const triggers: Array<{ filePath: string; volume: number; loop: boolean }> = [];
    sender.onTrigger = (t) => triggers.push(t);
    sender.attach(engine);

    engine.emit('media-trigger', {
      id: 'media-2', type: 'media',
      data: {}, // brak pól
    });

    expect(triggers[0]!.filePath).toBe('');
    expect(triggers[0]!.volume).toBe(100);
    expect(triggers[0]!.loop).toBe(false);
  });

  it('powinno clampować głośność do 0-100', () => {
    const triggers: Array<{ volume: number }> = [];
    sender.onTrigger = (t) => triggers.push(t);
    sender.attach(engine);

    engine.emit('media-trigger', {
      id: 'media-3', type: 'media',
      data: { volume: 150 },
    });

    expect(triggers[0]!.volume).toBe(100);
  });

  it('powinno ignorować trigger gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    const triggers: unknown[] = [];
    sender.onTrigger = (t) => triggers.push(t);
    sender.attach(engine);

    engine.emit('media-trigger', {
      id: 'media-4', type: 'media',
      data: { file_path: '/test.wav' },
    });

    expect(triggers).toHaveLength(0);
  });
});

// ── SenderManager ─────────────────────────────────────────

describe('SenderManager', () => {
  it('powinno podpiąć wszystkie sendery do engine', () => {
    const engine = new EventEmitter();
    const manager = new SenderManager();

    // Ustaw callbacki testowe
    const oscMessages: unknown[] = [];
    const midiMessages: unknown[] = [];
    const gpiTriggers: unknown[] = [];
    const mediaTriggers: unknown[] = [];

    vi.spyOn(manager.osc as never, 'send' as never).mockImplementation(() => {});
    manager.midi.onMessage = (msg) => midiMessages.push(msg);
    manager.gpi.onTrigger = (t) => gpiTriggers.push(t);
    manager.media.onTrigger = (t) => mediaTriggers.push(t);

    manager.attach(engine);

    // Emituj triggery
    engine.emit('osc-trigger', { id: 'o1', type: 'osc', data: { address: '/test' } });
    engine.emit('midi-trigger', { id: 'm1', type: 'midi', data: { message_type: 'note_on', note_or_cc: 60, velocity_or_val: 127 } });
    engine.emit('gpi-trigger', { id: 'g1', type: 'gpi', data: { channel: 1, trigger_type: 'pulse' } });
    engine.emit('media-trigger', { id: 'med1', type: 'media', data: { file_path: '/test.wav' } });

    expect(midiMessages).toHaveLength(1);
    expect(gpiTriggers).toHaveLength(1);
    expect(mediaTriggers).toHaveLength(1);

    manager.destroy();
  });

  it('powinno tworzyć sendery z konfiguracją', () => {
    const manager = new SenderManager({
      osc: { port: 9999, host: '10.0.0.1' },
      midi: { defaultChannel: 5 },
      gpi: { defaultPulseMs: 250 },
      media: { enabled: false },
    });

    expect(manager.osc.getConfig().port).toBe(9999);
    expect(manager.osc.getConfig().host).toBe('10.0.0.1');
    expect(manager.midi.getConfig().defaultChannel).toBe(5);
    expect(manager.gpi.getConfig().defaultPulseMs).toBe(250);
    expect(manager.media.getConfig().enabled).toBe(false);

    manager.destroy();
  });

  it('powinno zawierać ltc i ptz sendery (Faza 10)', () => {
    const manager = new SenderManager({
      ltc: { source: 'manual' },
      ptz: { enabled: true, cameras: [{ number: 1, ip: '10.0.0.5', port: 52381, protocol: 'visca_ip' }] },
    });

    expect(manager.ltc).toBeDefined();
    expect(manager.ltc.getConfig().source).toBe('manual');
    expect(manager.ptz).toBeDefined();
    expect(manager.ptz.getConfig().enabled).toBe(true);
    expect(manager.ptz.getConfig().cameras).toHaveLength(1);

    manager.destroy();
  });

  it('destroy() powinno wywołać destroy() na MidiSender (Faza 17)', () => {
    const manager = new SenderManager();
    const midiDestroySpy = vi.spyOn(manager.midi, 'destroy');
    const oscDestroySpy = vi.spyOn(manager.osc, 'destroy');

    manager.destroy();

    expect(midiDestroySpy).toHaveBeenCalledTimes(1);
    expect(oscDestroySpy).toHaveBeenCalledTimes(1);
  });

  it('MidiSender w SenderManager powinien mieć dostęp do listPorts() (Faza 17)', () => {
    const manager = new SenderManager();

    // listPorts() istnieje i nie rzuca wyjątku
    const ports = manager.midi.listPorts();
    expect(Array.isArray(ports)).toBe(true);

    manager.destroy();
  });
});
