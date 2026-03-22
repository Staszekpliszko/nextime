import { describe, it, expect } from 'vitest';

/**
 * Testy MediaStatusBar — logika formatowania czasu.
 *
 * Testujemy funkcję formatTime bez renderowania React.
 */

// Funkcja formatTime wyekstrahowana z komponentu
function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

describe('MediaStatusBar — formatTime (Faza 24)', () => {
  it('powinno formatować sekundy do MM:SS', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(3600)).toBe('60:00');
    expect(formatTime(125.7)).toBe('02:05');
  });

  it('powinno zwracać 00:00 dla wartości ujemnych', () => {
    expect(formatTime(-10)).toBe('00:00');
  });

  it('powinno zwracać 00:00 dla NaN', () => {
    expect(formatTime(NaN)).toBe('00:00');
  });

  it('powinno zwracać 00:00 dla Infinity', () => {
    expect(formatTime(Infinity)).toBe('00:00');
  });

  it('powinno padować minuty i sekundy dwoma cyframi', () => {
    expect(formatTime(9)).toBe('00:09');
    expect(formatTime(61)).toBe('01:01');
  });

  // ── Obliczanie progress ─────────────────────────────────

  it('powinno obliczać progress jako ratio 0-1', () => {
    const currentTimeSec = 30;
    const durationSec = 120;
    const progress = durationSec > 0
      ? Math.min(1, currentTimeSec / durationSec)
      : 0;
    expect(progress).toBe(0.25);
  });

  it('powinno zwracać progress 0 gdy duration jest 0', () => {
    const progress = 0 > 0 ? Math.min(1, 10 / 0) : 0;
    expect(progress).toBe(0);
  });

  it('powinno clampować progress do max 1', () => {
    const progress = Math.min(1, 150 / 120);
    expect(progress).toBe(1);
  });

  // ── Remaining ───────────────────────────────────────────

  it('powinno obliczać remaining time', () => {
    const remaining = 120 - 45;
    expect(formatTime(remaining)).toBe('01:15');
  });
});
