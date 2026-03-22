import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testy MediaPlayer — logika komend i feedbacku.
 *
 * Testujemy logikę wykrywania typu media i mapowania komend,
 * bez renderowania React (to wymaga jsdom + React Testing Library).
 */

// Funkcja detectType wyekstrahowana z komponentu do testowania
function detectType(filePath: string): 'audio' | 'video' {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];
  return audioExts.includes(ext) ? 'audio' : 'video';
}

// Funkcja konwersji ścieżki do file:// URL
function toFileUrl(filePath: string): string {
  if (filePath.startsWith('file://')) return filePath;
  return `file:///${filePath.replace(/\\/g, '/')}`;
}

// Funkcja wyciągania nazwy pliku
function extractFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

describe('MediaPlayer — logika (Faza 24)', () => {
  // ── detectType ──────────────────────────────────────────

  describe('detectType', () => {
    it('powinno rozpoznać pliki audio', () => {
      expect(detectType('/path/music.mp3')).toBe('audio');
      expect(detectType('/path/sound.wav')).toBe('audio');
      expect(detectType('/path/track.ogg')).toBe('audio');
      expect(detectType('/path/lossless.flac')).toBe('audio');
      expect(detectType('/path/apple.aac')).toBe('audio');
      expect(detectType('/path/itunes.m4a')).toBe('audio');
      expect(detectType('/path/windows.wma')).toBe('audio');
      expect(detectType('/path/voice.opus')).toBe('audio');
    });

    it('powinno rozpoznać pliki video', () => {
      expect(detectType('/path/clip.mp4')).toBe('video');
      expect(detectType('/path/movie.mkv')).toBe('video');
      expect(detectType('/path/film.avi')).toBe('video');
      expect(detectType('/path/recording.mov')).toBe('video');
      expect(detectType('/path/stream.webm')).toBe('video');
    });

    it('powinno traktować nieznane rozszerzenie jako video', () => {
      expect(detectType('/path/file.xyz')).toBe('video');
      expect(detectType('/path/noext')).toBe('video');
    });
  });

  // ── toFileUrl ───────────────────────────────────────────

  describe('toFileUrl', () => {
    it('powinno konwertować ścieżkę Windows na file:// URL', () => {
      expect(toFileUrl('C:\\Users\\test\\music.mp3')).toBe('file:///C:/Users/test/music.mp3');
    });

    it('powinno konwertować ścieżkę Unix na file:// URL', () => {
      expect(toFileUrl('/home/user/music.mp3')).toBe('file:////home/user/music.mp3');
    });

    it('powinno przepuścić istniejący file:// URL bez zmian', () => {
      expect(toFileUrl('file:///C:/test.mp3')).toBe('file:///C:/test.mp3');
    });
  });

  // ── extractFileName ─────────────────────────────────────

  describe('extractFileName', () => {
    it('powinno wyciągnąć nazwę pliku z Windows path', () => {
      expect(extractFileName('C:\\Users\\test\\song.mp3')).toBe('song.mp3');
    });

    it('powinno wyciągnąć nazwę pliku z Unix path', () => {
      expect(extractFileName('/home/user/song.mp3')).toBe('song.mp3');
    });

    it('powinno zwrócić cały string jeśli brak separatora', () => {
      expect(extractFileName('song.mp3')).toBe('song.mp3');
    });
  });
});
