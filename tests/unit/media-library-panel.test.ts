import { describe, it, expect } from 'vitest';

/**
 * Testy logiki pomocniczej z MediaLibraryPanel (Faza 23).
 * Funkcje wyekstrahowane do testowania:
 * - formatDuration(durationFrames, fps) → "MM:SS"
 * - detectMediaType(fileName) → 'audio' | 'video'
 */

// Reimplementacja logiki (identyczna jak w MediaLibraryPanel) — testujemy izolowaną logikę
function formatDuration(durationFrames: number, fps: number = 25): string {
  if (durationFrames <= 0 || fps <= 0) return '—';
  const totalSeconds = Math.round(durationFrames / fps);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function detectMediaType(fileName: string): 'audio' | 'video' {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];
  return audioExts.includes(ext) ? 'audio' : 'video';
}

describe('MediaLibraryPanel — logika pomocnicza (Faza 23)', () => {
  // ── formatDuration ──────────────────────────────────────────

  describe('formatDuration()', () => {
    it('powinno sformatować 0 frames jako "—"', () => {
      expect(formatDuration(0)).toBe('—');
    });

    it('powinno sformatować ujemne frames jako "—"', () => {
      expect(formatDuration(-100)).toBe('—');
    });

    it('powinno sformatować 25fps × 60s = 1500 frames jako "01:00"', () => {
      expect(formatDuration(1500, 25)).toBe('01:00');
    });

    it('powinno sformatować 25fps × 90s = 2250 frames jako "01:30"', () => {
      expect(formatDuration(2250, 25)).toBe('01:30');
    });

    it('powinno sformatować 30fps × 5s = 150 frames jako "00:05"', () => {
      expect(formatDuration(150, 30)).toBe('00:05');
    });

    it('powinno obsłużyć fps=0 jako "—"', () => {
      expect(formatDuration(1000, 0)).toBe('—');
    });

    it('powinno domyślnie użyć 25fps', () => {
      expect(formatDuration(750)).toBe('00:30'); // 750/25 = 30s
    });
  });

  // ── detectMediaType ─────────────────────────────────────────

  describe('detectMediaType()', () => {
    it('powinno wykryć mp3 jako audio', () => {
      expect(detectMediaType('song.mp3')).toBe('audio');
    });

    it('powinno wykryć wav jako audio', () => {
      expect(detectMediaType('sound.wav')).toBe('audio');
    });

    it('powinno wykryć flac jako audio', () => {
      expect(detectMediaType('music.flac')).toBe('audio');
    });

    it('powinno wykryć mp4 jako video', () => {
      expect(detectMediaType('clip.mp4')).toBe('video');
    });

    it('powinno wykryć mkv jako video', () => {
      expect(detectMediaType('movie.mkv')).toBe('video');
    });

    it('powinno wykryć nieznane rozszerzenie jako video (fallback)', () => {
      expect(detectMediaType('file.xyz')).toBe('video');
    });

    it('powinno obsłużyć brak rozszerzenia jako video', () => {
      expect(detectMediaType('noextension')).toBe('video');
    });
  });
});
