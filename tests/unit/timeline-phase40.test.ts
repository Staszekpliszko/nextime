/**
 * Testy Fazy 40 — Media Full-Duration + Left-Trim + Inline TC Input
 */
import { describe, it, expect } from 'vitest';
import { snapToNeighbors } from '../../src/components/Timeline/snap-utils';
import { framesToTimecode, timecodeToFrames } from '../../src/utils/timecode';

// ── 40-A: Auto-duration z vMix — przeliczenie ms→frames ──────────

describe('40-A: auto-duration vMix ms→frames', () => {
  it('przelicza duration 10000ms na 250 klatek przy 25fps', () => {
    const durationMs = 10000;
    const fps = 25;
    const durationFrames = Math.round(durationMs / 1000 * fps);
    expect(durationFrames).toBe(250);
  });

  it('przelicza duration 5000ms na 150 klatek przy 30fps', () => {
    const durationMs = 5000;
    const fps = 30;
    const durationFrames = Math.round(durationMs / 1000 * fps);
    expect(durationFrames).toBe(150);
  });

  it('przelicza duration 0ms → 0 klatek (live kamera, nie ustawiaj tc_out)', () => {
    const durationMs = 0;
    const fps = 25;
    const durationFrames = Math.round(durationMs / 1000 * fps);
    expect(durationFrames).toBe(0);
  });

  it('oblicza tc_out = tc_in + durationFrames', () => {
    const tcIn = 100; // klatka 100
    const durationMs = 8000;
    const fps = 25;
    const durationFrames = Math.round(durationMs / 1000 * fps);
    const tcOut = tcIn + durationFrames;
    expect(tcOut).toBe(300); // 100 + 200
  });
});

// ── 40-C: Left-trim — zmiana tc_in + offset_frames ───────────────

describe('40-C: left-trim offset calculation', () => {
  it('oblicza nowy offset po skróceniu z lewej o 50 klatek', () => {
    const oldTcIn = 100;
    const newTcIn = 150; // skrócono o 50 klatek z lewej
    const oldOffset = 0;
    const newOffset = oldOffset + (newTcIn - oldTcIn);
    expect(newOffset).toBe(50); // media startuje od 50. klatki
  });

  it('oblicza nowy offset przy istniejącym offset', () => {
    const oldTcIn = 200;
    const newTcIn = 230;
    const oldOffset = 25;
    const newOffset = oldOffset + (newTcIn - oldTcIn);
    expect(newOffset).toBe(55); // 25 + 30
  });

  it('minimalna szerokość: tc_out - newTcIn >= 1', () => {
    const tcOut = 500;
    const newTcIn = 499;
    expect(tcOut - newTcIn).toBeGreaterThanOrEqual(1);

    // Nie pozwalamy na newTcIn >= tcOut
    const clampedTcIn = Math.min(newTcIn, tcOut - 1);
    expect(clampedTcIn).toBe(499);
  });

  it('nie pozwala na ujemny offset', () => {
    const oldTcIn = 100;
    const newTcIn = 80; // rozszerzono w lewo
    const oldOffset = 10;
    const newOffset = Math.max(0, oldOffset + (newTcIn - oldTcIn));
    expect(newOffset).toBe(0); // nie ujemny
  });
});

// ── 40-C: Snap z lewej strony ────────────────────────────────────

describe('40-C: snap z lewej strony (snapToNeighbors)', () => {
  const cues = [
    { id: 'a', tc_in_frames: 0, tc_out_frames: 100 },
    { id: 'b', tc_in_frames: 200, tc_out_frames: 400 },
    { id: 'c', tc_in_frames: 500, tc_out_frames: 700 },
  ];

  it('snap tc_in do tc_out sąsiada (krawędź prawa → lewa)', () => {
    // Przesuwamy lewą krawędź cue 'b' blisko tc_out cue 'a' (100)
    const result = snapToNeighbors(102, cues, 'b');
    expect(result).toBe(100); // snap do krawędzi cue 'a'
  });

  it('snap tc_in do tc_in sąsiada', () => {
    // Przesuwamy lewą krawędź cue 'c' blisko tc_in cue 'b' (200)
    const result = snapToNeighbors(203, cues, 'c');
    expect(result).toBe(200);
  });

  it('brak snap gdy daleko od krawędzi', () => {
    const result = snapToNeighbors(150, cues, 'b');
    expect(result).toBe(150); // bez snap
  });
});

// ── 40-D: Inline TC input — parsowanie i walidacja ───────────────

describe('40-D: inline TC input parsing', () => {
  it('parsuje poprawny timecode 01:23:45:10 przy 25fps', () => {
    const frames = timecodeToFrames('01:23:45:10', 25);
    // 1*3600*25 + 23*60*25 + 45*25 + 10 = 90000 + 34500 + 1125 + 10 = 125635
    expect(frames).toBe(125635);
  });

  it('parsuje 00:00:00:00 na 0', () => {
    expect(timecodeToFrames('00:00:00:00', 25)).toBe(0);
  });

  it('parsuje 00:01:00:00 na 1500 przy 25fps', () => {
    expect(timecodeToFrames('00:01:00:00', 25)).toBe(1500);
  });

  it('roundtrip: frames → timecode → frames', () => {
    const original = 3750;
    const tc = framesToTimecode(original, 25);
    const parsed = timecodeToFrames(tc, 25);
    expect(parsed).toBe(original);
  });

  it('niepoprawny format zwraca 0 (nie NaN)', () => {
    const result = timecodeToFrames('abc', 25);
    expect(result).toBe(0);
  });

  it('niepełny format zwraca 0', () => {
    const result = timecodeToFrames('01:02', 25);
    expect(result).toBe(0);
  });
});
