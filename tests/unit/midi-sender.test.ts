import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { MidiSender } from '../../electron/senders/midi-sender';
import type { MidiOutputPort, MidiOutputConstructor } from '../../electron/senders/midi-sender';

// ── Mock klasa MidiOutput (DI zamiast vi.mock) ─────────────

function createMockOutput(): MidiOutputPort & {
  _sendCalls: number[][];
  _openedPort: number | null;
  _closed: boolean;
} {
  const instance = {
    _sendCalls: [] as number[][],
    _openedPort: null as number | null,
    _closed: false,
    getPortCount: vi.fn(() => 3),
    getPortName: vi.fn((index: number) => {
      const names = ['Microsoft GS Wavetable Synth', 'loopMIDI Port', 'ATEM MIDI Control'];
      return names[index] ?? `Port ${index}`;
    }),
    openPort: vi.fn((index: number) => { instance._openedPort = index; }),
    closePort: vi.fn(() => { instance._closed = true; }),
    sendMessage: vi.fn((bytes: number[]) => { instance._sendCalls.push(bytes); }),
    isPortOpen: vi.fn(() => instance._openedPort !== null && !instance._closed),
  };
  return instance;
}

// Fabryka do DI — tworzymy nową instancję mocka na każde new MockOutputClass()
let lastMockOutput: ReturnType<typeof createMockOutput> | null = null;

class MockOutputClass implements MidiOutputPort {
  private impl: ReturnType<typeof createMockOutput>;

  constructor() {
    this.impl = createMockOutput();
    lastMockOutput = this.impl;
  }
  getPortCount() { return this.impl.getPortCount(); }
  getPortName(index: number) { return this.impl.getPortName(index); }
  openPort(index: number) { this.impl.openPort(index); }
  closePort() { this.impl.closePort(); }
  sendMessage(bytes: number[]) { this.impl.sendMessage(bytes); }
  isPortOpen() { return this.impl.isPortOpen(); }
}

// ── Testy ──────────────────────────────────────────────────

describe('MidiSender — listPorts()', () => {
  let sender: MidiSender;

  beforeEach(() => {
    lastMockOutput = null;
    sender = new MidiSender({ enabled: true, defaultChannel: 1 }, MockOutputClass as MidiOutputConstructor);
  });

  afterEach(() => {
    sender.destroy();
  });

  it('powinno zwrócić listę dostępnych portów MIDI', () => {
    const ports = sender.listPorts();
    expect(ports).toHaveLength(3);
    expect(ports[0]).toEqual({ index: 0, name: 'Microsoft GS Wavetable Synth' });
    expect(ports[1]).toEqual({ index: 1, name: 'loopMIDI Port' });
    expect(ports[2]).toEqual({ index: 2, name: 'ATEM MIDI Control' });
  });

  it('powinno zwrócić pustą listę gdy MIDI niedostępne', () => {
    const noMidiSender = new MidiSender({ enabled: true }, null);
    const ports = noMidiSender.listPorts();
    expect(ports).toHaveLength(0);
    noMidiSender.destroy();
  });
});

describe('MidiSender — openPort() / closePort()', () => {
  let sender: MidiSender;

  beforeEach(() => {
    lastMockOutput = null;
    sender = new MidiSender({ enabled: true, defaultChannel: 1 }, MockOutputClass as MidiOutputConstructor);
  });

  afterEach(() => {
    sender.destroy();
  });

  it('powinno otworzyć port po indeksie', () => {
    const result = sender.openPort(1);
    expect(result.ok).toBe(true);
    expect(sender.isPortOpen()).toBe(true);
    expect(sender.getOpenedPortIndex()).toBe(1);
  });

  it('powinno zwrócić error dla nieprawidłowego indeksu (za duży)', () => {
    const result = sender.openPort(99);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('nie istnieje');
    expect(sender.isPortOpen()).toBe(false);
  });

  it('powinno zwrócić error dla ujemnego indeksu', () => {
    const result = sender.openPort(-1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('nie istnieje');
  });

  it('powinno zamknąć otwarty port', () => {
    sender.openPort(0);
    expect(sender.isPortOpen()).toBe(true);

    sender.closePort();
    expect(sender.isPortOpen()).toBe(false);
    expect(sender.getOpenedPortIndex()).toBe(-1);
  });

  it('powinno zamknąć stary port przed otwarciem nowego', () => {
    sender.openPort(0);
    sender.openPort(1);

    expect(sender.isPortOpen()).toBe(true);
    expect(sender.getOpenedPortIndex()).toBe(1);
  });

  it('powinno zwrócić error gdy moduł MIDI niedostępny', () => {
    const noMidiSender = new MidiSender({ enabled: true }, null);
    const result = noMidiSender.openPort(0);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('niedostępny');
    noMidiSender.destroy();
  });
});

describe('MidiSender — handleTrigger() z otwartym portem', () => {
  let sender: MidiSender;
  let engine: EventEmitter;

  beforeEach(() => {
    lastMockOutput = null;
    sender = new MidiSender({ enabled: true, defaultChannel: 1 }, MockOutputClass as MidiOutputConstructor);
    engine = new EventEmitter();
    sender.attach(engine);
    sender.openPort(0);
  });

  afterEach(() => {
    sender.destroy();
  });

  it('powinno wysłać Note On przez natywny port MIDI', () => {
    engine.emit('midi-trigger', {
      id: 'midi-hw-1',
      type: 'midi',
      data: { message_type: 'note_on', note_or_cc: 60, velocity_or_val: 100 },
    });

    expect(lastMockOutput!.sendMessage).toHaveBeenCalledWith([0x90, 60, 100]);
  });

  it('powinno wysłać CC przez natywny port MIDI', () => {
    engine.emit('midi-trigger', {
      id: 'midi-hw-2',
      type: 'midi',
      data: { message_type: 'cc', note_or_cc: 7, velocity_or_val: 64, channel: 2 },
    });

    expect(lastMockOutput!.sendMessage).toHaveBeenCalledWith([0xB1, 7, 64]);
  });

  it('powinno wysłać Program Change (2 bajty) przez natywny port', () => {
    engine.emit('midi-trigger', {
      id: 'midi-hw-3',
      type: 'midi',
      data: { message_type: 'program', note_or_cc: 5, velocity_or_val: 0 },
    });

    expect(lastMockOutput!.sendMessage).toHaveBeenCalledWith([0xC0, 5]);
  });

  it('powinno jednocześnie wywoływać onMessage callback', () => {
    const messages: Array<{ status: number; data1: number; data2: number }> = [];
    sender.onMessage = (msg) => messages.push(msg);

    engine.emit('midi-trigger', {
      id: 'midi-hw-4',
      type: 'midi',
      data: { message_type: 'note_on', note_or_cc: 72, velocity_or_val: 110 },
    });

    expect(lastMockOutput!.sendMessage).toHaveBeenCalledTimes(1);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.status).toBe(0x90);
    expect(messages[0]!.data1).toBe(72);
  });
});

describe('MidiSender — handleTrigger() bez otwartego portu', () => {
  let sender: MidiSender;
  let engine: EventEmitter;

  beforeEach(() => {
    lastMockOutput = null;
    sender = new MidiSender({ enabled: true, defaultChannel: 1 }, MockOutputClass as MidiOutputConstructor);
    engine = new EventEmitter();
    sender.attach(engine);
    // NIE otwieramy portu
  });

  afterEach(() => {
    sender.destroy();
  });

  it('powinno fallback do onMessage callback bez natywnego portu', () => {
    const messages: Array<{ status: number; data1: number; data2: number }> = [];
    sender.onMessage = (msg) => messages.push(msg);

    engine.emit('midi-trigger', {
      id: 'midi-fb-1',
      type: 'midi',
      data: { message_type: 'note_on', note_or_cc: 60, velocity_or_val: 127 },
    });

    // Callback powinien być wywołany
    expect(messages).toHaveLength(1);
    // Ale nie powinno być żadnego output (port nie otwarty, lastMockOutput to null od listPorts lub brak)
  });
});

describe('MidiSender — testSend()', () => {
  let sender: MidiSender;

  beforeEach(() => {
    lastMockOutput = null;
    sender = new MidiSender({ enabled: true, defaultChannel: 1 }, MockOutputClass as MidiOutputConstructor);
  });

  afterEach(() => {
    sender.destroy();
  });

  it('powinno zwrócić { ok: true } z otwartym portem', async () => {
    sender.openPort(0);
    const result = await sender.testSend();
    expect(result.ok).toBe(true);

    // Note On C4 vel=1 + Note Off C4 vel=0
    expect(lastMockOutput!.sendMessage).toHaveBeenCalledTimes(2);
    expect(lastMockOutput!.sendMessage).toHaveBeenCalledWith([0x90, 60, 1]);
    expect(lastMockOutput!.sendMessage).toHaveBeenCalledWith([0x80, 60, 0]);
  });

  it('powinno zwrócić error gdy port nie otwarty', async () => {
    const result = await sender.testSend();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('nie jest otwarty');
  });

  it('powinno zwrócić error gdy sender wyłączony', async () => {
    sender.updateConfig({ enabled: false });
    const result = await sender.testSend();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('wyłączony');
  });

  it('powinno zwrócić error przy wyjątku sendMessage', async () => {
    sender.openPort(0);
    // Nadpisz sendMessage żeby rzucił wyjątek
    (lastMockOutput!.sendMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('Device disconnected');
    });

    const result = await sender.testSend();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Device disconnected');
  });

  it('powinno zwrócić error gdy moduł MIDI niedostępny', async () => {
    const noMidiSender = new MidiSender({ enabled: true }, null);
    const result = await noMidiSender.testSend();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('niedostępny');
    noMidiSender.destroy();
  });
});

describe('MidiSender — isMidiAvailable()', () => {
  it('powinno zwrócić true gdy OutputClass podany', () => {
    const sender = new MidiSender({}, MockOutputClass as MidiOutputConstructor);
    expect(sender.isMidiAvailable()).toBe(true);
    sender.destroy();
  });

  it('powinno zwrócić false gdy OutputClass = null', () => {
    const sender = new MidiSender({}, null);
    expect(sender.isMidiAvailable()).toBe(false);
    sender.destroy();
  });
});

describe('MidiSender — destroy()', () => {
  it('powinno zamknąć port i wyczyścić callback', () => {
    const sender = new MidiSender({ enabled: true }, MockOutputClass as MidiOutputConstructor);
    sender.onMessage = () => {};
    sender.openPort(0);

    expect(sender.isPortOpen()).toBe(true);
    expect(sender.onMessage).not.toBeNull();

    sender.destroy();

    expect(sender.isPortOpen()).toBe(false);
    expect(sender.onMessage).toBeNull();
  });
});
