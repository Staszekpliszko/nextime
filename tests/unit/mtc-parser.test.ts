import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MtcParser } from '../../electron/senders/mtc-parser';
import type { MtcTimecode } from '../../electron/senders/mtc-parser';
import { LtcReader } from '../../electron/senders/ltc-reader';
import type { MidiInputPort, MidiInputConstructor } from '../../electron/senders/ltc-reader';

// ── Testy MtcParser ─────────────────────────────────────

describe('MtcParser', () => {
  let parser: MtcParser;
  let receivedTc: MtcTimecode[];
  let receivedFrames: number[];

  beforeEach(() => {
    parser = new MtcParser();
    receivedTc = [];
    receivedFrames = [];
    parser.onTimecode = (tc, frames) => {
      receivedTc.push(tc);
      receivedFrames.push(frames);
    };
  });

  it('dekoduje 8 Quarter Frame messages → pełny TC', () => {
    // TC: 01:02:03:04 @ 25fps
    // Pole 0: frames low (4) = 0x04
    // Pole 1: frames high (0) = 0x00
    // Pole 2: seconds low (3) = 0x03
    // Pole 3: seconds high (0) = 0x00
    // Pole 4: minutes low (2) = 0x02
    // Pole 5: minutes high (0) = 0x00
    // Pole 6: hours low (1) = 0x01
    // Pole 7: hours high + rate (25fps = rate code 1 → bit1=1 → 0x02)
    const qfMessages = [
      0x04, // pole 0: 0000_0100 — frames low nibble = 4
      0x10, // pole 1: 0001_0000 — frames high nibble = 0
      0x23, // pole 2: 0010_0011 — seconds low nibble = 3
      0x30, // pole 3: 0011_0000 — seconds high nibble = 0
      0x42, // pole 4: 0100_0010 — minutes low nibble = 2
      0x50, // pole 5: 0101_0000 — minutes high nibble = 0
      0x61, // pole 6: 0110_0001 — hours low nibble = 1
      0x72, // pole 7: 0111_0010 — hours high nibble: rate_code=1 (25fps), hour_hi=0
    ];

    for (const qf of qfMessages) {
      parser.feedQuarterFrame(qf);
    }

    expect(receivedTc).toHaveLength(1);
    expect(receivedTc[0]!.hours).toBe(1);
    expect(receivedTc[0]!.minutes).toBe(2);
    expect(receivedTc[0]!.seconds).toBe(3);
    expect(receivedTc[0]!.frames).toBe(4);
    expect(receivedTc[0]!.frameRate).toBe(25);
  });

  it('obsługuje 24fps (rate code 0)', () => {
    // TC: 00:00:00:10 @ 24fps
    const qfMessages = [
      0x0A, // pole 0: frames low = 10 (0xA)
      0x10, // pole 1: frames high = 0
      0x20, // pole 2: seconds low = 0
      0x30, // pole 3: seconds high = 0
      0x40, // pole 4: minutes low = 0
      0x50, // pole 5: minutes high = 0
      0x60, // pole 6: hours low = 0
      0x70, // pole 7: rate code 0 (24fps)
    ];

    for (const qf of qfMessages) {
      parser.feedQuarterFrame(qf);
    }

    expect(receivedTc).toHaveLength(1);
    expect(receivedTc[0]!.frames).toBe(10);
    expect(receivedTc[0]!.frameRate).toBe(24);
  });

  it('obsługuje 30fps (rate code 3)', () => {
    // TC: 00:00:01:00 @ 30fps
    const qfMessages = [
      0x00, // pole 0: frames low = 0
      0x10, // pole 1: frames high = 0
      0x21, // pole 2: seconds low = 1
      0x30, // pole 3: seconds high = 0
      0x40, // pole 4: minutes low = 0
      0x50, // pole 5: minutes high = 0
      0x60, // pole 6: hours low = 0
      0x76, // pole 7: rate code 3 (30fps) → bits 1-2 = 11 = 0x06
    ];

    for (const qf of qfMessages) {
      parser.feedQuarterFrame(qf);
    }

    expect(receivedTc).toHaveLength(1);
    expect(receivedTc[0]!.seconds).toBe(1);
    expect(receivedTc[0]!.frameRate).toBe(30);
    // 30 klatek (1 sekunda × 30fps)
    expect(receivedFrames[0]).toBe(30);
  });

  it('nie emituje TC przy przerwanej sekwencji QF', () => {
    // Podajemy tylko 4 QF, potem skok
    parser.feedQuarterFrame(0x00); // pole 0
    parser.feedQuarterFrame(0x10); // pole 1
    parser.feedQuarterFrame(0x20); // pole 2
    // Przerwij — skok do pola 5 (powinno zresetować)
    parser.feedQuarterFrame(0x50); // pole 5

    expect(receivedTc).toHaveLength(0);
  });

  it('feedFullFrame emituje natychmiast pełny TC', () => {
    // 01:30:15:12 @ 25fps — hr = 0x21 (rate_code=1 w bitach 5-6, hours=1)
    parser.feedFullFrame(0x21, 30, 15, 12);

    expect(receivedTc).toHaveLength(1);
    expect(receivedTc[0]!.hours).toBe(1);
    expect(receivedTc[0]!.minutes).toBe(30);
    expect(receivedTc[0]!.seconds).toBe(15);
    expect(receivedTc[0]!.frames).toBe(12);
    expect(receivedTc[0]!.frameRate).toBe(25);
  });

  it('reset zeruje stan', () => {
    parser.feedQuarterFrame(0x00);
    parser.feedQuarterFrame(0x10);
    parser.reset();
    // Kontynuujemy od pola 2 — nie powinno emitować
    parser.feedQuarterFrame(0x20);
    parser.feedQuarterFrame(0x30);
    parser.feedQuarterFrame(0x40);
    parser.feedQuarterFrame(0x50);
    parser.feedQuarterFrame(0x60);
    parser.feedQuarterFrame(0x70);

    expect(receivedTc).toHaveLength(0);
  });

  it('formatTc wyświetla poprawnie', () => {
    const tc: MtcTimecode = { hours: 1, minutes: 2, seconds: 3, frames: 4, frameRate: 25 };
    expect(MtcParser.formatTc(tc)).toBe('01:02:03:04');
  });
});

// ── Mock MidiInput ──────────────────────────────────────

function createMockMidiInputClass(): { cls: MidiInputConstructor; triggerMessage: (msg: number[]) => void } {
  let messageListener: ((...args: unknown[]) => void) | null = null;

  class MockMidiInput implements MidiInputPort {
    private _open = false;

    getPortCount() { return 2; }
    getPortName(index: number) { return `Mock MIDI In ${index}`; }
    openPort(_index: number) { this._open = true; }
    closePort() { this._open = false; }
    isPortOpen() { return this._open; }
    ignoreTypes(_s: boolean, _t: boolean, _a: boolean) {}
    on(_event: string, listener: (...args: unknown[]) => void) {
      if (_event === 'message') {
        messageListener = listener;
      }
      return this;
    }
  }

  return {
    cls: MockMidiInput as unknown as MidiInputConstructor,
    triggerMessage: (msg: number[]) => {
      if (messageListener) messageListener(0, msg);
    },
  };
}

// ── Testy LtcReader MTC ────────────────────────────────

describe('LtcReader MTC', () => {
  it('isMidiAvailable zwraca false bez modułu', () => {
    const reader = new LtcReader({}, null);
    expect(reader.isMidiAvailable()).toBe(false);
    reader.destroy();
  });

  it('listMtcPorts zwraca porty z mock', () => {
    const { cls } = createMockMidiInputClass();
    const reader = new LtcReader({}, cls);
    const ports = reader.listMtcPorts();
    expect(ports).toHaveLength(2);
    expect(ports[0]!.name).toBe('Mock MIDI In 0');
    reader.destroy();
  });

  it('connectMtc otwiera port i ustawia connected', () => {
    const { cls } = createMockMidiInputClass();
    const reader = new LtcReader({ source: 'mtc' }, cls);

    const result = reader.connectMtc(0);
    expect(result.ok).toBe(true);

    const status = reader.getStatus();
    expect(status.connected).toBe(true);

    reader.destroy();
  });

  it('connectMtc odmawia gdy brak modułu', () => {
    const reader = new LtcReader({ source: 'mtc' }, null);
    const result = reader.connectMtc(0);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('niedostępny');
    reader.destroy();
  });

  it('odbiera MTC Quarter Frames i emituje tc-received', () => {
    const { cls, triggerMessage } = createMockMidiInputClass();
    const reader = new LtcReader({ source: 'mtc' }, cls);

    const receivedFrames: number[] = [];
    reader.onTcReceived = (f) => receivedFrames.push(f);

    reader.connectMtc(0);

    // Wyślij 8 QF messages: TC 00:00:00:10 @ 25fps
    const qf = [0x0A, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x72];
    for (const q of qf) {
      triggerMessage([0xF1, q]);
    }

    expect(receivedFrames).toHaveLength(1);
    expect(receivedFrames[0]).toBe(10);

    const status = reader.getStatus();
    expect(status.lastTcFrames).toBe(10);
    expect(status.lastTcFormatted).toBe('00:00:00:10');

    reader.destroy();
  });

  it('feedTc działa niezależnie od trybu (manual)', () => {
    const reader = new LtcReader({ source: 'manual' }, null);
    const received: number[] = [];
    reader.onTcReceived = (f) => received.push(f);

    reader.feedTc(1000);
    expect(received).toEqual([1000]);
    expect(reader.getStatus().lastTcFrames).toBe(1000);
    reader.destroy();
  });
});
