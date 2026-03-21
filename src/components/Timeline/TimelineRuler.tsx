import { useMemo } from 'react';
import { framesToTimecode } from '@/utils/timecode';
import type { FPS } from '@/utils/timecode';

interface TimelineRulerProps {
  durationFrames: number;
  fps: FPS;
  pixelsPerFrame: number;
  onRulerClick: (frames: number) => void;
}

/** Linijka z timecode na górze osi czasu */
export function TimelineRuler({ durationFrames, fps, pixelsPerFrame, onRulerClick }: TimelineRulerProps) {
  // Generuj znaczniki co sekundę (lub co 5/10s zależnie od zoomu)
  const markers = useMemo(() => {
    const pixelsPerSecond = pixelsPerFrame * fps;
    // Dobierz interwał znaczników w sekundach w zależności od zoomu
    let intervalSec: number;
    if (pixelsPerSecond >= 200) intervalSec = 1;
    else if (pixelsPerSecond >= 50) intervalSec = 5;
    else if (pixelsPerSecond >= 20) intervalSec = 10;
    else intervalSec = 30;

    const intervalFrames = intervalSec * fps;
    const result: Array<{ frame: number; label: string; major: boolean }> = [];

    for (let f = 0; f <= durationFrames; f += intervalFrames) {
      const tc = framesToTimecode(f, fps);
      // Major marker co 10 interwałów lub co minutę
      const seconds = f / fps;
      const isMajor = seconds % 60 === 0;
      result.push({ frame: f, label: tc, major: isMajor });
    }

    return result;
  }, [durationFrames, fps, pixelsPerFrame]);

  const totalWidth = durationFrames * pixelsPerFrame;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = Math.round(x / pixelsPerFrame);
    onRulerClick(Math.max(0, Math.min(frame, durationFrames)));
  };

  return (
    <div
      className="relative h-6 bg-slate-800 border-b border-slate-700 cursor-pointer select-none flex-shrink-0"
      style={{ width: `${totalWidth}px` }}
      onClick={handleClick}
    >
      {markers.map(({ frame, label, major }) => (
        <div
          key={frame}
          className="absolute top-0 h-full"
          style={{ left: `${frame * pixelsPerFrame}px` }}
        >
          <div className={`w-px ${major ? 'h-full bg-slate-500' : 'h-3 bg-slate-600'}`} />
          {major && (
            <span className="absolute top-0.5 left-1 text-[9px] text-slate-400 whitespace-nowrap">
              {label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
