import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { GpiSender } from '../../electron/senders/gpi-sender';
import { GpiSerialPort } from '../../electron/senders/gpi-serial';
import type { SerialPortConstructor, SerialPortLike } from '../../electron/senders/gpi-serial';

// ── Mock SerialPort ──────────────────────────────────────

function createMockSerialPortClass(): SerialPortConstructor {
  const instances: MockSerialPort[] = [];

  class MockSerialPort implements SerialPortLike {
    isOpen = true;
    writtenData: Buffer[] = [];
    closeCalled = false;

    constructor(_opts: { path: string; baudRate: number; autoOpen?: boolean }) {
      instances.push(this);
    }

    write(data: Buffer | Uint8Array, callback?: (err: Error | null) => void): void {
      this.writtenData.push(Buffer.from(data));
      if (callback) callback(null);
    }

    close(callback?: (err: Error | null) => void): void {
      this.isOpen = false;
      this.closeCalled = true;
      if (callback) callback(null);
    }

    on(_event: string, _listener: (...args: unknown[]) => void): this {
      return this;
    }

    static instances = instances;

    static async list() {
      return [
        { path: 'COM3', manufacturer: 'FTDI', friendlyName: 'USB Serial' },
        { path: 'COM4', manufacturer: 'Prolific' },
      ];
    }
  }

  return MockSerialPort as unknown as SerialPortConstructor;
}

// ── Testy GpiSerialPort ─────────────────────────────────

describe('GpiSerialPort', () => {
  it('zgłasza niedostępność gdy moduł nie podany', () => {
    const serial = new GpiSerialPort(null);
    expect(serial.isSerialAvailable()).toBe(false);
    expect(serial.getLoadError()).toBe('Moduł serialport nie został podany');
  });

  it('zwraca listę portów z mock', async () => {
    const MockClass = createMockSerialPortClass();
    const serial = new GpiSerialPort(MockClass);
    expect(serial.isSerialAvailable()).toBe(true);

    const ports = await serial.listPorts();
    expect(ports).toHaveLength(2);
    expect(ports[0]!.path).toBe('COM3');
  });

  it('otwiera i zamyka port', () => {
    const MockClass = createMockSerialPortClass();
    const serial = new GpiSerialPort(MockClass);

    const result = serial.open('COM3', 9600);
    expect(result.ok).toBe(true);
    expect(serial.isOpen()).toBe(true);

    serial.close();
    // Po zamknięciu port = null
    expect(serial.isOpen()).toBe(false);
  });

  it('odmawia otwarcia bez modułu serialport', () => {
    const serial = new GpiSerialPort(null);
    const result = serial.open('COM3', 9600);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('niedostępny');
  });

  it('wysyła trigger ON na port serial', () => {
    const MockClass = createMockSerialPortClass();
    const serial = new GpiSerialPort(MockClass);
    serial.open('COM3', 9600);

    const written: Buffer[] = [];
    serial.onWrite = (data) => written.push(data);

    const result = serial.sendTrigger(3, 'on', 100);
    expect(result.ok).toBe(true);
    expect(written).toHaveLength(1);
    expect(written[0]![0]).toBe(3); // pin
    expect(written[0]![1]).toBe(0x01); // ON
  });

  it('wysyła trigger OFF na port serial', () => {
    const MockClass = createMockSerialPortClass();
    const serial = new GpiSerialPort(MockClass);
    serial.open('COM3', 9600);

    const written: Buffer[] = [];
    serial.onWrite = (data) => written.push(data);

    serial.sendTrigger(5, 'off', 100);
    expect(written).toHaveLength(1);
    expect(written[0]![0]).toBe(5); // pin
    expect(written[0]![1]).toBe(0x00); // OFF
  });

  it('wysyła trigger PULSE (on + off po timeout)', async () => {
    vi.useFakeTimers();
    const MockClass = createMockSerialPortClass();
    const serial = new GpiSerialPort(MockClass);
    serial.open('COM3', 9600);

    const written: Buffer[] = [];
    serial.onWrite = (data) => written.push(data);

    serial.sendTrigger(1, 'pulse', 50);
    // Natychmiast ON
    expect(written).toHaveLength(1);
    expect(written[0]![1]).toBe(0x01);

    // Po 50ms OFF
    vi.advanceTimersByTime(50);
    expect(written).toHaveLength(2);
    expect(written[1]![1]).toBe(0x00);

    vi.useRealTimers();
    serial.destroy();
  });

  it('odmawia wysyłania gdy port zamknięty', () => {
    const MockClass = createMockSerialPortClass();
    const serial = new GpiSerialPort(MockClass);
    // Nie otwieramy portu
    const result = serial.sendTrigger(1, 'pulse', 100);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('nie jest otwarty');
  });
});

// ── Testy GpiSender ─────────────────────────────────────

describe('GpiSender', () => {
  let engine: EventEmitter;
  let sender: GpiSender;

  beforeEach(() => {
    engine = new EventEmitter();
    sender = new GpiSender({ enabled: true }, null); // null = bez serialport
    sender.attach(engine);
  });

  it('wywołuje onTrigger callback przy gpi-trigger', () => {
    const triggers: unknown[] = [];
    sender.onTrigger = (t) => triggers.push(t);

    engine.emit('gpi-trigger', { id: 'c1', type: 'gpi', data: { channel: 2, trigger_type: 'on' } });
    expect(triggers).toHaveLength(1);
    expect((triggers[0] as { channel: number }).channel).toBe(2);
  });

  it('nie wysyła gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    const triggers: unknown[] = [];
    sender.onTrigger = (t) => triggers.push(t);

    engine.emit('gpi-trigger', { id: 'c1', type: 'gpi', data: { channel: 1 } });
    expect(triggers).toHaveLength(0);
  });

  it('isSerialAvailable zwraca false gdy brak modułu', () => {
    expect(sender.isSerialAvailable()).toBe(false);
  });

  it('testSend działa nawet bez otwartego portu (fallback)', () => {
    const result = sender.testSend();
    expect(result.ok).toBe(true);
  });

  it('listPorts zwraca pustą tablicę bez modułu serialport', async () => {
    const ports = await sender.listPorts();
    expect(ports).toEqual([]);
  });

  it('openPort zwraca błąd bez ścieżki portu', () => {
    const result = sender.openPort('', 9600);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Nie podano');
  });
});
