/**
 * AudioLevelMeter — wizualny peak meter dla sygnału LTC audio.
 *
 * Canvas 200×24px, AnalyserNode → getByteFrequencyData → bar.
 * Kolory: zielony (do -12dB), żółty (-12 do -6dB), czerwony (>-6dB).
 */

import { useRef, useEffect } from 'react';

interface AudioLevelMeterProps {
  /** AnalyserNode z AudioContext (lub null jeśli brak) */
  analyserNode: AnalyserNode | null;
  /** Szerokość w pikselach */
  width?: number;
  /** Wysokość w pikselach */
  height?: number;
}

/** Progi dB → kolory */
const DB_THRESHOLD_YELLOW = -12; // dB
const DB_THRESHOLD_RED = -6;     // dB

export function AudioLevelMeter({ analyserNode, width = 200, height = 24 }: AudioLevelMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!analyserNode || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Bufor danych frequency
    const bufferLength = analyserNode.frequencyBinCount;
    dataRef.current = new Uint8Array(bufferLength);

    const draw = () => {
      if (!dataRef.current || !ctx) return;

      analyserNode.getByteFrequencyData(dataRef.current as Uint8Array<ArrayBuffer>);

      // Oblicz peak (max z frequency bins)
      let peak = 0;
      for (let i = 0; i < dataRef.current.length; i++) {
        if (dataRef.current[i]! > peak) peak = dataRef.current[i]!;
      }

      // Normalizuj do 0-1
      const level = peak / 255;

      // Wyczyść canvas
      ctx.fillStyle = '#1e293b'; // slate-800
      ctx.fillRect(0, 0, width, height);

      // Rysuj bar
      const barWidth = Math.round(level * width);

      if (barWidth > 0) {
        // Gradient: zielony → żółty → czerwony
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#22c55e');     // zielony
        gradient.addColorStop(0.5, '#22c55e');   // zielony do połowy
        gradient.addColorStop(0.75, '#eab308');  // żółty
        gradient.addColorStop(1, '#ef4444');     // czerwony

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 2, barWidth, height - 4);
      }

      // Rysuj znaczniki dB
      ctx.strokeStyle = '#475569'; // slate-600
      ctx.lineWidth = 1;

      // -12dB marker (25% = 10^(-12/20) ≈ 0.25)
      const marker12 = Math.round(0.25 * width);
      ctx.beginPath();
      ctx.moveTo(marker12, 0);
      ctx.lineTo(marker12, height);
      ctx.stroke();

      // -6dB marker (50% = 10^(-6/20) ≈ 0.5)
      const marker6 = Math.round(0.5 * width);
      ctx.beginPath();
      ctx.moveTo(marker6, 0);
      ctx.lineTo(marker6, height);
      ctx.stroke();

      // 0dB marker
      const marker0 = Math.round(0.9 * width);
      ctx.beginPath();
      ctx.moveTo(marker0, 0);
      ctx.lineTo(marker0, height);
      ctx.stroke();

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyserNode, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded border border-slate-600"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}
