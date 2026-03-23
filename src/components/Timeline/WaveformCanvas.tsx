import { useRef, useEffect, useMemo } from 'react';

export interface WaveformCanvasProps {
  /** Tablica wartości amplitudy (0–1) z ffprobe */
  waveformData: number[];
  /** Szerokość canvasa w pikselach */
  width: number;
  /** Wysokość canvasa w pikselach */
  height: number;
  /** Znormalizowana pozycja playhead (0–1), undefined = brak playhead */
  playheadPosition?: number;
  /** Kolor waveformu (domyślnie rgba(255,255,255,0.5)) */
  color?: string;
}

/**
 * Normalizuje tablicę waveform do zadanej szerokości (downsampling/interpolacja).
 * Zwraca tablicę o długości targetLength z wartościami 0–1.
 */
export function normalizeWaveformPoints(
  data: number[],
  targetLength: number,
): number[] {
  if (data.length === 0 || targetLength <= 0) return [];

  const result: number[] = new Array(targetLength);
  const ratio = data.length / targetLength;

  for (let i = 0; i < targetLength; i++) {
    const srcStart = i * ratio;
    const srcEnd = (i + 1) * ratio;

    // Uśredniamy wartości w zakresie (downsampling) lub bierzemy interpolację
    const startIdx = Math.floor(srcStart);
    const endIdx = Math.min(Math.ceil(srcEnd), data.length);

    if (startIdx >= endIdx) {
      result[i] = data[Math.min(startIdx, data.length - 1)] ?? 0;
    } else {
      let sum = 0;
      let count = 0;
      for (let j = startIdx; j < endIdx; j++) {
        sum += data[j] ?? 0;
        count++;
      }
      result[i] = count > 0 ? sum / count : 0;
    }
  }

  return result;
}

/**
 * Ogranicza wartość do zakresu [min, max].
 */
export function clampPlayheadPosition(position: number): number {
  return Math.max(0, Math.min(1, position));
}

/** Canvas z wizualizacją waveformu i opcjonalnym playhead overlay */
export function WaveformCanvas({
  waveformData,
  width,
  height,
  playheadPosition,
  color = 'rgba(255,255,255,0.5)',
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Przelicz punkty waveformu do szerokości canvasa
  const points = useMemo(
    () => normalizeWaveformPoints(waveformData, Math.floor(width)),
    [waveformData, width],
  );

  // Rysuj waveform na canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = Math.floor(width);
    const h = Math.floor(height);
    if (w <= 0 || h <= 0) return;

    // Ustaw wymiary canvasa (czyści automatycznie)
    canvas.width = w;
    canvas.height = h;

    if (points.length === 0) return;

    const midY = h / 2;

    // Rysuj symetryczny waveform (góra/dół od środka)
    ctx.fillStyle = color;
    ctx.beginPath();

    // Górna połowa (od lewej do prawej)
    ctx.moveTo(0, midY);
    for (let i = 0; i < points.length; i++) {
      const amplitude = (points[i] ?? 0) * midY;
      ctx.lineTo(i, midY - amplitude);
    }

    // Dolna połowa (od prawej do lewej — zamykamy kształt)
    for (let i = points.length - 1; i >= 0; i--) {
      const amplitude = (points[i] ?? 0) * midY;
      ctx.lineTo(i, midY + amplitude);
    }

    ctx.closePath();
    ctx.fill();

    // Playhead — pionowa linia
    if (playheadPosition !== undefined) {
      const clampedPos = clampPlayheadPosition(playheadPosition);
      const phX = clampedPos * w;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX, h);
      ctx.stroke();
    }
  }, [points, width, height, color, playheadPosition]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}
