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
});
