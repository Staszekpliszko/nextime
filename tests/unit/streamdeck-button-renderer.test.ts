import { describe, it, expect } from 'vitest';
import {
  renderTextButton,
  renderCountdownButton,
  renderTallyButton,
  renderInfoButton,
  renderNavButton,
  formatMmSs,
  formatHhMmSsFf,
} from '../../electron/streamdeck/streamdeck-button-renderer';

describe('StreamDeck Button Renderer', () => {
  // ── formatMmSs ──────────────────────────────────────

  it('formatMmSs formatuje ms na MM:SS', () => {
    expect(formatMmSs(0)).toBe('0:00');
    expect(formatMmSs(1000)).toBe('0:01');
    expect(formatMmSs(61000)).toBe('1:01');
    expect(formatMmSs(3600000)).toBe('60:00');
  });

  it('formatMmSs obsługuje ujemne wartości', () => {
    expect(formatMmSs(-5000)).toBe('-0:05');
  });

  // ── formatHhMmSsFf ─────────────────────────────────

  it('formatHhMmSsFf formatuje frames na HH:MM:SS:FF', () => {
    expect(formatHhMmSsFf(0, 25)).toBe('00:00:00:00');
    expect(formatHhMmSsFf(25, 25)).toBe('00:00:01:00');
    expect(formatHhMmSsFf(75, 25)).toBe('00:00:03:00');
    expect(formatHhMmSsFf(1525, 25)).toBe('00:01:01:00');
  });

  // ── renderTextButton ────────────────────────────────

  it('renderTextButton zwraca Buffer o odpowiednim rozmiarze (72x72 RGBA)', async () => {
    const buf = await renderTextButton({ text: 'Test', bgColor: '#FF0000', size: 72 });
    expect(buf).toBeInstanceOf(Buffer);
    // 72 * 72 * 4 (RGBA) = 20736
    expect(buf.length).toBe(72 * 72 * 4);
  });

  it('renderTextButton obsługuje rozmiar 96x96', async () => {
    const buf = await renderTextButton({ text: 'XL', bgColor: '#00FF00', size: 96 });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(96 * 96 * 4);
  });

  // ── renderCountdownButton ───────────────────────────

  it('renderCountdownButton zwraca Buffer (rozmiar 72x72 RGBA)', async () => {
    const buf = await renderCountdownButton({ remainingMs: 90000, totalMs: 120000, size: 72 });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(72 * 72 * 4);
  });

  it('renderCountdownButton działa z różnymi fazami (>60s, <60s, <30s, <10s)', async () => {
    // Każdy wariant powinien zwrócić poprawny bufor
    const buf1 = await renderCountdownButton({ remainingMs: 90000, totalMs: 120000, size: 72 }); // biały
    const buf2 = await renderCountdownButton({ remainingMs: 45000, totalMs: 120000, size: 72 }); // żółty
    const buf3 = await renderCountdownButton({ remainingMs: 15000, totalMs: 120000, size: 72 }); // czerwony
    const buf4 = await renderCountdownButton({ remainingMs: 5000, totalMs: 120000, blinkPhase: true, size: 72 }); // migający
    const buf5 = await renderCountdownButton({ remainingMs: -1000, totalMs: 120000, overtime: true, size: 72 }); // overtime

    for (const buf of [buf1, buf2, buf3, buf4, buf5]) {
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBe(72 * 72 * 4);
    }
  });

  // ── renderTallyButton ──────────────────────────────

  it('renderTallyButton PGM zwraca Buffer', async () => {
    const buf = await renderTallyButton({ cameraNumber: 1, pgm: true, pvw: false, size: 72 });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(72 * 72 * 4);
  });

  it('renderTallyButton PVW zwraca Buffer', async () => {
    const buf = await renderTallyButton({ cameraNumber: 2, pgm: false, pvw: true, size: 72 });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(72 * 72 * 4);
  });

  it('renderTallyButton inactive (szary) zwraca Buffer', async () => {
    const buf = await renderTallyButton({ cameraNumber: 3, pgm: false, pvw: false, size: 72 });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(72 * 72 * 4);
  });

  // ── renderInfoButton ───────────────────────────────

  it('renderInfoButton zwraca Buffer', async () => {
    const buf = await renderInfoButton({ label: 'TC', value: '00:01:30:00', size: 72 });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(72 * 72 * 4);
  });

  // ── renderNavButton ────────────────────────────────

  it('renderNavButton zwraca Buffer', async () => {
    const buf = await renderNavButton('Strona →', { size: 72 });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(72 * 72 * 4);
  });
});
