import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { LtcReader } from '../../electron/senders/ltc-reader';

describe('LtcReader', () => {
  let reader: LtcReader;
  let engine: EventEmitter;

  beforeEach(() => {
    reader = new LtcReader({ enabled: true, source: 'internal' });
    engine = new EventEmitter();
  });

  afterEach(() => {
    reader.destroy();
  });

  // ── Status ─────────────────────────────────────────────

  it('powinno zwracać domyślny status', () => {
    const status = reader.getStatus();
    expect(status.source).toBe('internal');
    expect(status.connected).toBe(false);
    expect(status.lastTcFrames).toBeNull();
    expect(status.lastReceivedAt).toBeNull();
  });

  it('powinno podpinać się do engine bez błędów', () => {
    expect(() => reader.attach(engine)).not.toThrow();
  });

  // ── Source ─────────────────────────────────────────────

  it('powinno zmieniać source', () => {
    reader.setSource('ltc');
    expect(reader.getStatus().source).toBe('ltc');
  });

  it('powinno emitować source-changed', () => {
    const spy = vi.fn();
    reader.on('source-changed', spy);
    reader.setSource('mtc');
    expect(spy).toHaveBeenCalledWith('mtc');
  });

  it('powinno rozłączyć przy zmianie source (gdy connected)', () => {
    reader.setSource('ltc');
    reader.connect();
    expect(reader.getStatus().connected).toBe(true);

    reader.setSource('manual');
    expect(reader.getStatus().connected).toBe(false);
  });

  // ── Connect / Disconnect ───────────────────────────────

  it('powinno połączyć w trybie ltc', () => {
    reader.setSource('ltc');
    reader.connect();
    expect(reader.getStatus().connected).toBe(true);
  });

  it('powinno nie łączyć w trybie internal', () => {
    reader.connect(); // source = internal
    expect(reader.getStatus().connected).toBe(false);
  });

  it('powinno nie łączyć w trybie manual', () => {
    reader.setSource('manual');
    reader.connect();
    expect(reader.getStatus().connected).toBe(false);
  });

  it('powinno nie łączyć gdy disabled', () => {
    reader.updateConfig({ enabled: false });
    reader.setSource('ltc');
    reader.connect();
    expect(reader.getStatus().connected).toBe(false);
  });

  it('powinno rozłączyć', () => {
    reader.setSource('ltc');
    reader.connect();
    reader.disconnect();
    expect(reader.getStatus().connected).toBe(false);
    expect(reader.getStatus().lastTcFrames).toBeNull();
  });

  // ── Feed TC ────────────────────────────────────────────

  it('powinno emitować tc-received przy feedTc', () => {
    const spy = vi.fn();
    reader.on('tc-received', spy);
    reader.feedTc(100);
    expect(spy).toHaveBeenCalledWith(100);
  });

  it('powinno aktualizować lastTcFrames', () => {
    reader.feedTc(250);
    expect(reader.getStatus().lastTcFrames).toBe(250);
    expect(reader.getStatus().lastReceivedAt).toBeGreaterThan(0);
  });

  it('powinno wywoływać onTcReceived callback', () => {
    const spy = vi.fn();
    reader.onTcReceived = spy;
    reader.feedTc(42);
    expect(spy).toHaveBeenCalledWith(42);
  });

  it('powinno ignorować feedTc gdy disabled', () => {
    reader.updateConfig({ enabled: false });
    const spy = vi.fn();
    reader.on('tc-received', spy);
    reader.feedTc(100);
    expect(spy).not.toHaveBeenCalled();
  });

  // ── Config ─────────────────────────────────────────────

  it('powinno zwracać konfigurację', () => {
    const config = reader.getConfig();
    expect(config.source).toBe('internal');
    expect(config.enabled).toBe(true);
  });

  it('powinno aktualizować konfigurację (source → ltc)', () => {
    reader.updateConfig({ source: 'ltc' });
    expect(reader.getConfig().source).toBe('ltc');
  });

  // ── Destroy ────────────────────────────────────────────

  it('powinno poprawnie zniszczyć reader', () => {
    reader.setSource('ltc');
    reader.connect();
    reader.destroy();
    expect(reader.getStatus().connected).toBe(false);
    expect(reader.onTcReceived).toBeNull();
  });

  // ── LTC Audio (Faza 41) ──────────────────────────────

  it('connectLtcAudio ustawia connected i emituje ltc-audio-start', () => {
    const spy = vi.fn();
    reader.on('ltc-audio-start', spy);
    reader.connectLtcAudio('device-1');
    expect(reader.getStatus().connected).toBe(true);
    expect(reader.isLtcAudioActive()).toBe(true);
    expect(spy).toHaveBeenCalledWith('device-1');
  });

  it('connectLtcAudio bez deviceId wysyła null', () => {
    const spy = vi.fn();
    reader.on('ltc-audio-start', spy);
    reader.connectLtcAudio();
    expect(spy).toHaveBeenCalledWith(null);
  });

  it('disconnectLtcAudio rozłącza i emituje ltc-audio-stop', () => {
    reader.setSource('ltc');
    reader.connectLtcAudio();
    const spy = vi.fn();
    reader.on('ltc-audio-stop', spy);
    reader.disconnectLtcAudio();
    expect(reader.getStatus().connected).toBe(false);
    expect(reader.isLtcAudioActive()).toBe(false);
    expect(spy).toHaveBeenCalled();
  });

  it('feedTc formatuje TC i aktualizuje lastTcFormatted', () => {
    reader.feedTc(93079); // 1*3600*25 + 2*60*25 + 3*25 + 4 = 93079
    const status = reader.getStatus();
    expect(status.lastTcFrames).toBe(93079);
    expect(status.lastTcFormatted).toBe('01:02:03:04');
  });

  it('formatFrames poprawnie formatuje klatki', () => {
    expect(LtcReader.formatFrames(0, 25)).toBe('00:00:00:00');
    expect(LtcReader.formatFrames(25, 25)).toBe('00:00:01:00');
    expect(LtcReader.formatFrames(93079, 25)).toBe('01:02:03:04');
    expect(LtcReader.formatFrames(2700000, 30)).toBe('25:00:00:00');
  });

  it('tc-lost emitowany po 2s bez feedTc (fake timers)', () => {
    vi.useFakeTimers();
    const ltcReader = new LtcReader({ enabled: true, source: 'ltc' });
    const spy = vi.fn();
    ltcReader.on('tc-lost', spy);
    ltcReader.connectLtcAudio();

    // Advance 1.9s — nie powinno emitować
    vi.advanceTimersByTime(1900);
    expect(spy).not.toHaveBeenCalled();

    // Advance do 2.1s — powinno emitować
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledTimes(1);

    ltcReader.destroy();
    vi.useRealTimers();
  });

  it('feedTc resetuje timer tc-lost', () => {
    vi.useFakeTimers();
    const ltcReader = new LtcReader({ enabled: true, source: 'ltc' });
    const spy = vi.fn();
    ltcReader.on('tc-lost', spy);
    ltcReader.connectLtcAudio();

    // Advance 1.5s, potem feedTc — reset timera
    vi.advanceTimersByTime(1500);
    ltcReader.feedTc(100);

    // Advance kolejne 1.5s (łącznie 3s od startu, ale 1.5s od feedTc)
    vi.advanceTimersByTime(1500);
    expect(spy).not.toHaveBeenCalled();

    // Advance do 2.1s od feedTc
    vi.advanceTimersByTime(600);
    expect(spy).toHaveBeenCalledTimes(1);

    ltcReader.destroy();
    vi.useRealTimers();
  });
});
