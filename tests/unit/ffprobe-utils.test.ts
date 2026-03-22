import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MediaProbeResult } from '../../electron/media/ffprobe-utils';

// ── Mockujemy fluent-ffmpeg, child_process, fs, @ffprobe-installer ──

const mockFfprobe = vi.fn();
const mockSetFfprobePath = vi.fn();

vi.mock('fluent-ffmpeg', () => ({
  default: {
    ffprobe: (...args: unknown[]) => mockFfprobe(...args),
    setFfprobePath: (...args: unknown[]) => mockSetFfprobePath(...args),
  },
}));

const mockExecSync = vi.fn();
const mockExecFile = vi.fn();

vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

const mockExistsSync = vi.fn();

vi.mock('fs', () => ({
  default: { existsSync: (...args: unknown[]) => mockExistsSync(...args) },
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

// Mock @ffprobe-installer/ffprobe — domyślnie niedostępny
vi.mock('@ffprobe-installer/ffprobe', () => {
  throw new Error('not installed');
});

// Importy po mockach
import { findFfprobePath, probeMediaFile, generateWaveform, resetFfprobePathCache } from '../../electron/media/ffprobe-utils';

describe('ffprobe-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFfprobePathCache();
  });

  // ── findFfprobePath ───────────────────────────────────────────

  describe('findFfprobePath()', () => {
    it('powinno zwrócić ścieżkę jeśli ffprobe jest w PATH', () => {
      mockExecSync.mockReturnValue('/usr/bin/ffprobe\n');
      const result = findFfprobePath();
      expect(result).toBe('/usr/bin/ffprobe');
    });

    it('powinno zwrócić pierwszą linię na Windows (where zwraca wiele)', () => {
      mockExecSync.mockReturnValue('C:\\ffmpeg\\bin\\ffprobe.exe\nC:\\other\\ffprobe.exe\n');
      const result = findFfprobePath();
      expect(result).toBe('C:\\ffmpeg\\bin\\ffprobe.exe');
    });

    it('powinno zwrócić null jeśli ffprobe nie znaleziono', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not found'); });
      const result = findFfprobePath();
      expect(result).toBeNull();
    });

    it('powinno zwrócić null dla pustego wyniku', () => {
      mockExecSync.mockReturnValue('');
      const result = findFfprobePath();
      // Pusty wynik z where/which + brak bundlowanego = null
      expect(result).toBeNull();
    });

    it('powinno cache-ować wynik między wywołaniami', () => {
      mockExecSync.mockReturnValue('/usr/bin/ffprobe\n');
      const r1 = findFfprobePath();
      const r2 = findFfprobePath();
      expect(r1).toBe(r2);
      // execSync wywołany tylko raz (drugie z cache)
      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });
  });

  // ── probeMediaFile ────────────────────────────────────────────

  describe('probeMediaFile()', () => {
    it('powinno zwrócić poprawny MediaProbeResult dla pliku video', async () => {
      mockExecSync.mockReturnValue('/usr/bin/ffprobe');

      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(null, {
          format: { duration: 120.5 },
          streams: [
            {
              codec_type: 'video',
              codec_name: 'h264',
              r_frame_rate: '30000/1001',
              width: 1920,
              height: 1080,
            },
            {
              codec_type: 'audio',
              codec_name: 'aac',
            },
          ],
        });
      });

      const result = await probeMediaFile('/test/video.mp4');
      expect(result).not.toBeNull();
      const r = result as MediaProbeResult;
      expect(r.durationMs).toBe(120500);
      expect(r.fps).toBeCloseTo(29.97, 1);
      expect(r.durationFrames).toBeGreaterThan(0);
      expect(r.codec).toBe('h264');
      expect(r.hasAudio).toBe(true);
      expect(r.hasVideo).toBe(true);
      expect(r.width).toBe(1920);
      expect(r.height).toBe(1080);
    });

    it('powinno zwrócić poprawny wynik dla pliku audio (bez video)', async () => {
      mockExecSync.mockReturnValue('/usr/bin/ffprobe');

      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(null, {
          format: { duration: 240.0 },
          streams: [
            {
              codec_type: 'audio',
              codec_name: 'mp3',
            },
          ],
        });
      });

      const result = await probeMediaFile('/test/audio.mp3');
      expect(result).not.toBeNull();
      const r = result as MediaProbeResult;
      expect(r.durationMs).toBe(240000);
      expect(r.fps).toBe(0);
      expect(r.durationFrames).toBe(0);
      expect(r.codec).toBe('mp3');
      expect(r.hasAudio).toBe(true);
      expect(r.hasVideo).toBe(false);
      expect(r.width).toBeUndefined();
      expect(r.height).toBeUndefined();
    });

    it('powinno zwrócić null przy błędzie ffprobe', async () => {
      mockExecSync.mockReturnValue('/usr/bin/ffprobe');

      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(new Error('Plik nie istnieje'), null);
      });

      const result = await probeMediaFile('/test/nonexistent.mp4');
      expect(result).toBeNull();
    });

    it('powinno obsłużyć plik bez strumieni', async () => {
      mockExecSync.mockReturnValue('/usr/bin/ffprobe');

      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(null, {
          format: { duration: 0 },
          streams: [],
        });
      });

      const result = await probeMediaFile('/test/empty.dat');
      expect(result).not.toBeNull();
      const r = result as MediaProbeResult;
      expect(r.durationMs).toBe(0);
      expect(r.hasAudio).toBe(false);
      expect(r.hasVideo).toBe(false);
      expect(r.codec).toBe('unknown');
    });

    it('powinno obsłużyć brak duration w formacie', async () => {
      mockExecSync.mockReturnValue('/usr/bin/ffprobe');

      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(null, {
          format: {},
          streams: [{ codec_type: 'audio', codec_name: 'flac' }],
        });
      });

      const result = await probeMediaFile('/test/noformat.flac');
      expect(result).not.toBeNull();
      expect(result!.durationMs).toBe(0);
      expect(result!.codec).toBe('flac');
    });
  });

  // ── generateWaveform ──────────────────────────────────────────

  describe('generateWaveform()', () => {
    it('powinno zwrócić pustą tablicę jeśli ffprobe niedostępny', async () => {
      mockExecSync.mockImplementation(() => { throw new Error('not found'); });
      const result = await generateWaveform('/test/audio.mp3');
      expect(result).toEqual([]);
    });

    it('powinno zwrócić pustą tablicę przy błędzie ffprobe metadata', async () => {
      mockExecSync.mockReturnValue('/usr/bin/ffprobe');
      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(new Error('read error'), null);
      });

      const result = await generateWaveform('/test/bad.mp3');
      expect(result).toEqual([]);
    });

    it('powinno zwrócić znormalizowane dane waveform', async () => {
      mockExecSync.mockReturnValue('/usr/bin/ffprobe');

      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(null, { format: { duration: 10.0 } });
      });

      mockExecFile.mockImplementation(
        (_bin: string, _args: string[], _opts: unknown, cb: (err: Error | null, stdout: string) => void) => {
          const lines = [
            '0.0,100', '1.0,200', '2.0,300', '3.0,400', '4.0,500',
            '5.0,600', '6.0,700', '7.0,800', '8.0,900', '9.0,1000',
          ].join('\n');
          cb(null, lines);
        },
      );

      const result = await generateWaveform('/test/audio.mp3', 10);
      expect(result).toHaveLength(10);
      expect(result[9]).toBe(1);
      expect(result[0]).toBe(0.1);
      for (const v of result) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('powinno zwrócić pustą tablicę jeśli execFile zwraca pusty output', async () => {
      mockExecSync.mockReturnValue('/usr/bin/ffprobe');
      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(null, { format: { duration: 10.0 } });
      });
      mockExecFile.mockImplementation(
        (_bin: string, _args: string[], _opts: unknown, cb: (err: Error | null, stdout: string) => void) => {
          cb(new Error('no audio'), '');
        },
      );

      const result = await generateWaveform('/test/video-only.mp4', 10);
      expect(result).toEqual([]);
    });
  });

  // ── MediaProbeResult — walidacja struktury ────────────────────

  describe('MediaProbeResult type', () => {
    it('powinno mieć wszystkie wymagane pola', async () => {
      mockExecSync.mockReturnValue('/usr/bin/ffprobe');
      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(null, {
          format: { duration: 60 },
          streams: [
            { codec_type: 'video', codec_name: 'hevc', r_frame_rate: '25/1', width: 3840, height: 2160 },
            { codec_type: 'audio', codec_name: 'opus' },
          ],
        });
      });

      const result = await probeMediaFile('/test/4k.mkv');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('durationFrames');
      expect(result).toHaveProperty('fps');
      expect(result).toHaveProperty('codec');
      expect(result).toHaveProperty('hasAudio');
      expect(result).toHaveProperty('hasVideo');
      expect(result).toHaveProperty('width');
      expect(result).toHaveProperty('height');
    });
  });
});
