import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// ── Mock dgram ─────────────────────────────────────────────

const mockSend = vi.fn((_msg: Buffer, _port: number, _host: string, cb?: (err: Error | null) => void) => {
  if (cb) cb(null);
});
const mockOn = vi.fn();
const mockClose = vi.fn();
const mockUnref = vi.fn();

vi.mock('dgram', () => ({
  default: {
    createSocket: vi.fn(() => ({
      send: mockSend,
      on: mockOn,
      close: mockClose,
      unref: mockUnref,
    })),
  },
  createSocket: vi.fn(() => ({
    send: mockSend,
    on: mockOn,
    close: mockClose,
    unref: mockUnref,
  })),
}));

import { OscSender, buildOscMessage, validateOscAddress } from '../../electron/senders/osc-sender';

// ── Testy walidacji ────────────────────────────────────────

describe('validateOscAddress', () => {
  it('powinno zaakceptować poprawny adres IPv4 i port', () => {
    const result = validateOscAddress('192.168.1.100', 8000);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('powinno zaakceptować localhost', () => {
    const result = validateOscAddress('127.0.0.1', 9000);
    expect(result.valid).toBe(true);
  });

  it('powinno odrzucić nieprawidłowy adres IPv4', () => {
    const result = validateOscAddress('999.999.999.999', 8000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('poza zakresem');
  });

  it('powinno odrzucić tekst jako adres', () => {
    const result = validateOscAddress('not-an-ip', 8000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Nieprawidłowy adres IPv4');
  });

  it('powinno odrzucić port poza zakresem (0)', () => {
    const result = validateOscAddress('127.0.0.1', 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Port musi być');
  });

  it('powinno odrzucić port poza zakresem (65536)', () => {
    const result = validateOscAddress('127.0.0.1', 65536);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Port musi być');
  });

  it('powinno zaakceptować skrajne porty (1 i 65535)', () => {
    expect(validateOscAddress('10.0.0.1', 1).valid).toBe(true);
    expect(validateOscAddress('10.0.0.1', 65535).valid).toBe(true);
  });
});

// ── Testy OscSender ────────────────────────────────────────

describe('OscSender — testSend()', () => {
  let sender: OscSender;

  beforeEach(() => {
    mockSend.mockClear();
    mockOn.mockClear();
    mockClose.mockClear();
    mockUnref.mockClear();
    mockSend.mockImplementation((_msg: Buffer, _port: number, _host: string, cb?: (err: Error | null) => void) => {
      if (cb) cb(null);
    });
    sender = new OscSender({ enabled: true, host: '127.0.0.1', port: 9000 });
  });

  afterEach(() => {
    sender.destroy();
  });

  it('testSend() powinno zwrócić { ok: true } przy udanym wysłaniu', async () => {
    const result = await sender.testSend();
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('testSend() powinno zwrócić { ok: false } gdy sender wyłączony', async () => {
    sender.updateConfig({ enabled: false });
    const result = await sender.testSend();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('wyłączony');
  });

  it('testSend() powinno zwrócić { ok: false } przy błędzie wysyłania', async () => {
    mockSend.mockImplementation(
      (_msg: Buffer, _port: number, _host: string, cb?: (err: Error | null) => void) => {
        if (cb) cb(new Error('Network unreachable'));
      }
    );

    const result = await sender.testSend();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Network unreachable');
  });

  it('testSend() powinno wysłać pakiet /nextime/ping', async () => {
    await sender.testSend();

    const sentPacket = mockSend.mock.calls[0]![0] as Buffer;
    expect(sentPacket).toBeInstanceOf(Buffer);
    expect(sentPacket.toString('ascii')).toContain('/nextime/ping');
  });

  it('testSend() powinno zwrócić error przy nieprawidłowym adresie', async () => {
    const badSender = new OscSender({ enabled: true, host: '127.0.0.1', port: 8000 });
    // Wymuszamy nieprawidłowy host przez bezpośredni dostęp (obejście walidacji w updateConfig)
    (badSender as unknown as { config: { host: string } }).config.host = 'invalid-host';
    const result = await badSender.testSend();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Nieprawidłowy adres IPv4');
    badSender.destroy();
  });
});

describe('OscSender — send() z callbackiem', () => {
  let sender: OscSender;
  let engine: EventEmitter;

  beforeEach(() => {
    mockSend.mockClear();
    mockOn.mockClear();
    mockClose.mockClear();
    mockUnref.mockClear();
    mockSend.mockImplementation((_msg: Buffer, _port: number, _host: string, cb?: (err: Error | null) => void) => {
      if (cb) cb(null);
    });
    sender = new OscSender({ enabled: true, host: '127.0.0.1', port: 9000 });
    engine = new EventEmitter();
  });

  afterEach(() => {
    sender.destroy();
  });

  it('send() powinno wywołać socket.send() z callbackiem', () => {
    sender.attach(engine);

    engine.emit('osc-trigger', {
      id: 'osc-cue-1',
      type: 'osc',
      data: { address: '/test/go', args: [{ type: 'i', value: 1 }] },
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    // Czwarty argument to callback
    const call = mockSend.mock.calls[0]!;
    expect(typeof call[3]).toBe('function');
  });

  it('socket powinien mieć wywołany unref()', () => {
    sender.attach(engine);

    engine.emit('osc-trigger', {
      id: 'osc-cue-2',
      type: 'osc',
      data: { address: '/test', args: [] },
    });

    expect(mockUnref).toHaveBeenCalled();
  });
});

describe('OscSender — updateConfig z walidacją', () => {
  let sender: OscSender;

  beforeEach(() => {
    sender = new OscSender({ enabled: true, host: '127.0.0.1', port: 9000 });
  });

  afterEach(() => {
    sender.destroy();
  });

  it('powinno odrzucić nieprawidłowy port', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sender.updateConfig({ port: 99999 });
    expect(sender.getConfig().port).toBe(9000);
    warnSpy.mockRestore();
  });

  it('powinno odrzucić nieprawidłowy host', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sender.updateConfig({ host: 'bad-host' });
    expect(sender.getConfig().host).toBe('127.0.0.1');
    warnSpy.mockRestore();
  });

  it('powinno zaakceptować poprawną konfigurację', () => {
    sender.updateConfig({ host: '10.0.0.5', port: 53000 });
    expect(sender.getConfig().host).toBe('10.0.0.5');
    expect(sender.getConfig().port).toBe(53000);
  });

  it('powinno pozwolić zmienić enabled bez walidacji adresu', () => {
    sender.updateConfig({ enabled: false });
    expect(sender.getConfig().enabled).toBe(false);
  });
});
