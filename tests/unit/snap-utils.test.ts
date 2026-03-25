import { describe, it, expect } from 'vitest';
import { snapToNeighbors, SNAP_THRESHOLD_FRAMES } from '../../src/components/Timeline/snap-utils';

describe('Faza 39-D: snapToNeighbors()', () => {
  const cues = [
    { id: 'a', tc_in_frames: 100, tc_out_frames: 200 },
    { id: 'b', tc_in_frames: 300, tc_out_frames: 500 },
    { id: 'c', tc_in_frames: 600, tc_out_frames: undefined },
  ];

  it('snap do tc_in sąsiada (krawędź wejścia)', () => {
    // value=298, blisko tc_in=300 cue "b" (diff=2, < threshold=5)
    const result = snapToNeighbors(298, cues, 'a');
    expect(result).toBe(300);
  });

  it('snap do tc_out sąsiada (krawędź wyjścia)', () => {
    // value=197, blisko tc_out=200 cue "a" (diff=3, < threshold=5)
    const result = snapToNeighbors(197, cues, 'b');
    expect(result).toBe(200);
  });

  it('nie snapuje gdy za daleko od krawędzi', () => {
    // value=250, daleko od 200 i 300 (diff=50)
    const result = snapToNeighbors(250, cues, 'a');
    expect(result).toBe(250);
  });

  it('pomija self (excludeId) — nie snapuje do własnych krawędzi', () => {
    // value=102, blisko tc_in=100 cue "a", ale excludeId="a"
    // Najbliższe krawędzie to tc_in=300 i tc_out=200 (z b i a) — ale "a" wykluczone
    // Najbliższy: tc_out nie istnieje dla "c", tc_in=300 (diff=198), tc_in=600 (diff=498)
    // Od "b": tc_in=300 (diff=198), tc_out=500 (diff=398)
    // Od "c": tc_in=600 (diff=498)
    // Żaden nie jest w threshold=5, więc zwróci oryginalną
    const result = snapToNeighbors(102, cues, 'a');
    expect(result).toBe(102);
  });

  it('zwraca oryginalną wartość przy pustej liście cue', () => {
    const result = snapToNeighbors(150, [], 'x');
    expect(result).toBe(150);
  });

  it('snapuje z custom threshold', () => {
    // value=290, diff od 300 = 10 > default threshold 5, ale custom threshold=15
    const result = snapToNeighbors(290, cues, 'a', 15);
    expect(result).toBe(300);
  });

  it('SNAP_THRESHOLD_FRAMES jest eksportowane i wynosi 5', () => {
    expect(SNAP_THRESHOLD_FRAMES).toBe(5);
  });
});
