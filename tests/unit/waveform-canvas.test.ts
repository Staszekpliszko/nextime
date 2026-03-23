import { describe, it, expect } from 'vitest';
import {
  normalizeWaveformPoints,
  clampPlayheadPosition,
} from '../../src/components/Timeline/WaveformCanvas';

// ── Testy normalizacji waveform ──────────────────────────────

describe('normalizeWaveformPoints', () => {
  it('zwraca pustą tablicę dla pustych danych', () => {
    expect(normalizeWaveformPoints([], 100)).toEqual([]);
  });

  it('zwraca pustą tablicę dla targetLength <= 0', () => {
    expect(normalizeWaveformPoints([0.5, 0.8], 0)).toEqual([]);
    expect(normalizeWaveformPoints([0.5, 0.8], -1)).toEqual([]);
  });

  it('downsampluje dane do mniejszej szerokości', () => {
    // 8 próbek → 4 punkty (uśrednianie par)
    const data = [0.2, 0.4, 0.6, 0.8, 1.0, 0.8, 0.6, 0.4];
    const result = normalizeWaveformPoints(data, 4);

    expect(result).toHaveLength(4);
    // Każdy punkt to średnia 2 próbek
    expect(result[0]).toBeCloseTo(0.3, 1); // (0.2+0.4)/2
    expect(result[1]).toBeCloseTo(0.7, 1); // (0.6+0.8)/2
    expect(result[2]).toBeCloseTo(0.9, 1); // (1.0+0.8)/2
    expect(result[3]).toBeCloseTo(0.5, 1); // (0.6+0.4)/2
  });

  it('interpoluje dane do większej szerokości', () => {
    const data = [0.5, 1.0];
    const result = normalizeWaveformPoints(data, 4);

    expect(result).toHaveLength(4);
    // Wartości powinny być oparte na próbkach źródłowych
    for (const val of result) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('zachowuje dane gdy targetLength = data.length', () => {
    const data = [0.1, 0.5, 0.9, 0.3];
    const result = normalizeWaveformPoints(data, 4);

    expect(result).toHaveLength(4);
    expect(result[0]).toBeCloseTo(0.1, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.9, 1);
    expect(result[3]).toBeCloseTo(0.3, 1);
  });
});

// ── Testy clamping playhead ─────────────────────────────────

describe('clampPlayheadPosition', () => {
  it('ogranicza wartości ujemne do 0', () => {
    expect(clampPlayheadPosition(-0.5)).toBe(0);
    expect(clampPlayheadPosition(-1)).toBe(0);
  });

  it('ogranicza wartości > 1 do 1', () => {
    expect(clampPlayheadPosition(1.5)).toBe(1);
    expect(clampPlayheadPosition(2.0)).toBe(1);
  });

  it('przepuszcza wartości w zakresie 0–1', () => {
    expect(clampPlayheadPosition(0)).toBe(0);
    expect(clampPlayheadPosition(0.5)).toBe(0.5);
    expect(clampPlayheadPosition(1)).toBe(1);
  });
});
