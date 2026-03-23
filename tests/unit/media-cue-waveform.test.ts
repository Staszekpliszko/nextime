import { describe, it, expect } from 'vitest';

// ── Helpery do obliczania pozycji playhead w media cue ──────

/**
 * Oblicza znormalizowaną pozycję playhead (0–1) wewnątrz bloku media cue.
 * Logika identyczna jak w TimelineTrack.tsx (Faza 36).
 */
function computePlayheadPosition(
  currentTcFrames: number,
  tcInFrames: number,
  tcOutFrames: number | undefined,
): number | undefined {
  if (!tcOutFrames || tcOutFrames <= tcInFrames) return undefined;
  const duration = tcOutFrames - tcInFrames;
  const elapsed = currentTcFrames - tcInFrames;
  return Math.max(0, Math.min(1, elapsed / duration));
}

/**
 * Wyciąga waveform data z mapy na podstawie file_path lub media_file_id z cue.data.
 * Logika identyczna jak w TimelineTrack.tsx (Faza 36).
 */
function getWaveformForCue(
  cueData: Record<string, unknown>,
  cueType: string,
  waveformMap: Map<string, number[]>,
): number[] | undefined {
  if (cueType !== 'media') return undefined;
  const filePath = cueData.file_path as string | undefined;
  const mediaFileId = cueData.media_file_id as string | undefined;
  if (filePath) {
    const result = waveformMap.get(filePath);
    if (result) return result;
  }
  if (mediaFileId) {
    return waveformMap.get(mediaFileId);
  }
  return undefined;
}

// ── Testy ────────────────────────────────────────────────────

describe('computePlayheadPosition', () => {
  it('zwraca undefined gdy brak tc_out_frames', () => {
    expect(computePlayheadPosition(100, 50, undefined)).toBeUndefined();
  });

  it('zwraca undefined gdy tc_out <= tc_in (zerowy lub ujemny czas trwania)', () => {
    expect(computePlayheadPosition(100, 100, 100)).toBeUndefined();
    expect(computePlayheadPosition(100, 200, 100)).toBeUndefined();
  });

  it('oblicza pozycję 0 gdy playhead na początku cue', () => {
    expect(computePlayheadPosition(100, 100, 200)).toBe(0);
  });

  it('oblicza pozycję 0.5 gdy playhead w środku cue', () => {
    expect(computePlayheadPosition(150, 100, 200)).toBe(0.5);
  });

  it('oblicza pozycję 1 gdy playhead na końcu cue', () => {
    expect(computePlayheadPosition(200, 100, 200)).toBe(1);
  });

  it('ogranicza do 0 gdy playhead przed cue', () => {
    expect(computePlayheadPosition(50, 100, 200)).toBe(0);
  });

  it('ogranicza do 1 gdy playhead za cue', () => {
    expect(computePlayheadPosition(250, 100, 200)).toBe(1);
  });
});

describe('getWaveformForCue', () => {
  const waveformMap = new Map<string, number[]>([
    ['/media/song.mp3', [0.1, 0.5, 0.9, 0.3]],
    ['mf-2', [0.2, 0.8]],
  ]);

  it('zwraca waveform data dla media cue z poprawnym file_path', () => {
    const data = { file_path: '/media/song.mp3', volume: 100, offset_frames: 0 };
    expect(getWaveformForCue(data, 'media', waveformMap)).toEqual([0.1, 0.5, 0.9, 0.3]);
  });

  it('zwraca waveform data dla media cue z media_file_id (fallback)', () => {
    const data = { media_file_id: 'mf-2', volume: 100 };
    expect(getWaveformForCue(data, 'media', waveformMap)).toEqual([0.2, 0.8]);
  });

  it('preferuje file_path nad media_file_id', () => {
    const data = { file_path: '/media/song.mp3', media_file_id: 'mf-2' };
    expect(getWaveformForCue(data, 'media', waveformMap)).toEqual([0.1, 0.5, 0.9, 0.3]);
  });

  it('zwraca undefined dla media cue bez file_path i media_file_id', () => {
    const data = { offset_frames: 0, volume: 100 };
    expect(getWaveformForCue(data, 'media', waveformMap)).toBeUndefined();
  });

  it('zwraca undefined dla nie-media cue (np. vision)', () => {
    const data = { file_path: '/media/song.mp3', camera_number: 1 };
    expect(getWaveformForCue(data, 'vision', waveformMap)).toBeUndefined();
  });

  it('zwraca undefined gdy waveformMap jest pusty', () => {
    const data = { file_path: '/media/song.mp3' };
    expect(getWaveformForCue(data, 'media', new Map())).toBeUndefined();
  });
});
