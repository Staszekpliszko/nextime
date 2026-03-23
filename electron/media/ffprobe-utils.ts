import ffmpeg from 'fluent-ffmpeg';
import { execSync, execFile } from 'child_process';
import fs from 'fs';

// ── Typy ────────────────────────────────────────────────────────

/** Wynik analizy pliku media przez ffprobe */
export interface MediaProbeResult {
  /** Czas trwania w milisekundach */
  durationMs: number;
  /** Czas trwania w klatkach (na podstawie fps) */
  durationFrames: number;
  /** Klatki na sekundę (0 jeśli brak video) */
  fps: number;
  /** Kodek głównego strumienia (np. 'h264', 'aac') */
  codec: string;
  /** Czy plik zawiera ścieżkę audio */
  hasAudio: boolean;
  /** Czy plik zawiera ścieżkę video */
  hasVideo: boolean;
  /** Szerokość video w pikselach (undefined jeśli brak video) */
  width?: number;
  /** Wysokość video w pikselach (undefined jeśli brak video) */
  height?: number;
}

// ── findFfprobePath ─────────────────────────────────────────────

/** Cache — szukamy ffprobe tylko raz na sesję */
let cachedFfprobePath: string | null | undefined;

/**
 * Szuka ffprobe w następującej kolejności:
 * 1. Bundlowany z @ffprobe-installer/ffprobe (zawsze dostępny po npm install)
 * 2. PATH systemowy (fallback — jeśli user ma zainstalowany ffmpeg)
 *
 * Zwraca pełną ścieżkę lub null jeśli nie znaleziono.
 */
export function findFfprobePath(): string | null {
  // Użyj cache — nie szukaj wielokrotnie
  if (cachedFfprobePath !== undefined) return cachedFfprobePath;

  // 1. Bundlowany ffprobe z @ffprobe-installer/ffprobe
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffprobeInstaller = require('@ffprobe-installer/ffprobe') as { path: string };
    if (ffprobeInstaller.path && fs.existsSync(ffprobeInstaller.path)) {
      cachedFfprobePath = ffprobeInstaller.path;
      console.log('[ffprobe-utils] Używam bundlowanego ffprobe:', cachedFfprobePath);
      return cachedFfprobePath;
    }
  } catch {
    // @ffprobe-installer nie zainstalowany — kontynuuj
  }

  // 2. Szukaj w PATH systemowym
  const command = process.platform === 'win32' ? 'where ffprobe' : 'which ffprobe';
  try {
    const result = execSync(command, { encoding: 'utf-8', timeout: 5000 }).trim();
    const firstLine = result.split('\n')[0]?.trim();
    cachedFfprobePath = firstLine || null;
    if (cachedFfprobePath) {
      console.log('[ffprobe-utils] Używam systemowego ffprobe:', cachedFfprobePath);
    }
    return cachedFfprobePath;
  } catch {
    cachedFfprobePath = null;
    console.warn('[ffprobe-utils] ffprobe nie znaleziono — ani bundlowany, ani w PATH');
    return null;
  }
}

/**
 * Resetuje cache ścieżki ffprobe (do testów).
 */
export function resetFfprobePathCache(): void {
  cachedFfprobePath = undefined;
}

// ── probeMediaFile ──────────────────────────────────────────────

/**
 * Analizuje plik media za pomocą ffprobe.
 * Zwraca MediaProbeResult lub null jeśli ffprobe niedostępny / plik niepoprawny.
 */
export function probeMediaFile(filePath: string): Promise<MediaProbeResult | null> {
  return new Promise((resolve) => {
    // Ustaw ścieżkę ffprobe jeśli znaleziono
    const probePath = findFfprobePath();
    if (probePath) {
      ffmpeg.setFfprobePath(probePath);
    }

    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.warn('[ffprobe-utils] Błąd analizy pliku:', filePath, err.message);
        resolve(null);
        return;
      }

      const durationSec = metadata.format?.duration ?? 0;
      const durationMs = Math.round(durationSec * 1000);

      // Szukaj strumieni audio i video
      const streams = metadata.streams ?? [];
      const videoStream = streams.find(s => s.codec_type === 'video');
      const audioStream = streams.find(s => s.codec_type === 'audio');

      const hasVideo = !!videoStream;
      const hasAudio = !!audioStream;

      // FPS — parsuj z r_frame_rate (np. "30000/1001" → 29.97)
      let fps = 0;
      const rFrameRate = videoStream?.r_frame_rate ?? '';
      if (rFrameRate) {
        const parts = rFrameRate.split('/');
        const num = parseInt(parts[0] ?? '0', 10);
        const den = parseInt(parts[1] ?? '0', 10);
        if (den > 0) {
          fps = Math.round((num / den) * 100) / 100;
        }
      }

      const durationFrames = fps > 0 ? Math.round(durationSec * fps) : 0;

      // Kodek — preferuj video, fallback na audio
      const codec = videoStream?.codec_name ?? audioStream?.codec_name ?? 'unknown';

      const result: MediaProbeResult = {
        durationMs,
        durationFrames,
        fps,
        codec,
        hasAudio,
        hasVideo,
        ...(hasVideo && videoStream?.width ? { width: videoStream.width } : {}),
        ...(hasVideo && videoStream?.height ? { height: videoStream.height } : {}),
      };

      resolve(result);
    });
  });
}

// ── generateWaveform ────────────────────────────────────────────

/**
 * Generuje tablicę amplitud audio (waveform) z pliku media.
 * Wykorzystuje ffprobe do pobrania peak levels w równych odcinkach.
 *
 * @param filePath Ścieżka do pliku
 * @param samples Liczba próbek (domyślnie 200)
 * @returns Tablica wartości 0–1 (normalizowane amplitudy) lub pusta tablica przy błędzie
 */
export function generateWaveform(filePath: string, samples: number = 200): Promise<number[]> {
  return new Promise((resolve) => {
    const probePath = findFfprobePath();
    if (!probePath) {
      console.warn('[ffprobe-utils] ffprobe niedostępny — nie można wygenerować waveform');
      resolve([]);
      return;
    }

    // Najpierw sprawdź czas trwania pliku
    ffmpeg.setFfprobePath(probePath);
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata.format?.duration) {
        console.warn('[ffprobe-utils] Nie można odczytać duration dla waveform:', err?.message);
        resolve([]);
        return;
      }

      const duration = metadata.format.duration;
      const segmentDuration = duration / samples;

      // Jedno wywołanie ffprobe — pobierz timestamp i pkt_size dla klatek audio
      // Używamy best_effort_timestamp_time zamiast pkt_pts_time (kompatybilność z różnymi wersjami ffprobe)
      const singlePassArgs = [
        '-v', 'error',
        '-select_streams', 'a:0',
        '-show_entries', 'frame=best_effort_timestamp_time,pkt_size',
        '-of', 'csv=p=0',
        filePath,
      ];

      execFile(probePath, singlePassArgs, { timeout: 30000, maxBuffer: 50 * 1024 * 1024 }, (execErr, stdout) => {
        if (execErr || !stdout.trim()) {
          console.warn('[ffprobe-utils] Waveform: brak danych audio lub błąd:', execErr?.message);
          resolve([]);
          return;
        }

        // Parsuj output: "pts_time,pkt_size" per linia
        const lines = stdout.trim().split('\n');
        const frames: Array<{ time: number; size: number }> = [];

        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length >= 2) {
            const time = parseFloat(parts[0] ?? '');
            const size = parseInt(parts[1] ?? '', 10);
            if (!isNaN(time) && !isNaN(size)) {
              frames.push({ time, size });
            }
          }
        }

        if (frames.length === 0) {
          resolve([]);
          return;
        }

        // Agreguj w segmenty — max pkt_size per segment jako proxy amplitudy
        const result: number[] = new Array(samples).fill(0);
        for (const frame of frames) {
          const segIndex = Math.min(Math.floor(frame.time / segmentDuration), samples - 1);
          if (segIndex >= 0) {
            result[segIndex] = Math.max(result[segIndex] ?? 0, frame.size);
          }
        }

        resolve(normalizeWaveform(result));
      });
    });
  });
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Normalizuje tablicę waveform do zakresu 0–1.
 */
function normalizeWaveform(data: number[]): number[] {
  const max = Math.max(...data);
  if (max <= 0) return data.map(() => 0);
  return data.map(v => Math.round((v / max) * 100) / 100);
}
