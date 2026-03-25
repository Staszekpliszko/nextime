import { useState, useCallback, useRef } from 'react';
import type { FPS } from '@/utils/timecode';

/** Poziomy zoomu — pixelsPerFrame */
export const ZOOM_LEVELS = [0.5, 1, 2, 4, 8, 16];
const DEFAULT_ZOOM_INDEX = 2; // 2px/frame

export interface TimelineZoom {
  /** Piksele na klatkę */
  pixelsPerFrame: number;
  /** Piksele na sekundę (pixelsPerFrame * fps) */
  pixelsPerSecond: number;
  /** Indeks aktualnego poziomu zoomu */
  zoomIndex: number;
  /** Przybliż */
  zoomIn: () => void;
  /** Oddal */
  zoomOut: () => void;
  /** Faza 39-E: Dopasuj zoom do zawartości */
  zoomToFit: (contentFrames: number) => void;
  /** Scroll X position */
  scrollX: number;
  /** Ustaw scroll */
  setScrollX: (x: number) => void;
  /** Konwersja frames → px */
  framesToPx: (frames: number) => number;
  /** Konwersja px → frames */
  pxToFrames: (px: number) => number;
  /** Ref do kontenera scroll */
  containerRef: React.RefObject<HTMLDivElement>;
}

export function useTimelineZoom(fps: FPS): TimelineZoom {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [scrollX, setScrollX] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const pixelsPerFrame = ZOOM_LEVELS[zoomIndex]!;
  const pixelsPerSecond = pixelsPerFrame * fps;

  const zoomIn = useCallback(() => {
    setZoomIndex(prev => Math.min(prev + 1, ZOOM_LEVELS.length - 1));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomIndex(prev => Math.max(prev - 1, 0));
  }, []);

  /** Faza 39-E: Dopasuj zoom żeby cała zawartość mieściła się w viewport */
  const zoomToFit = useCallback((contentFrames: number) => {
    const container = containerRef.current;
    if (!container || contentFrames <= 0) return;
    // Odejmij 132px na etykiety tracków (w-32 = 128px + margines)
    const availableWidth = container.clientWidth - 140;
    if (availableWidth <= 0) return;
    const idealPxPerFrame = availableWidth / contentFrames;
    // Znajdź najbliższy ZOOM_LEVELS index (równy lub mniejszy)
    let bestIdx = 0;
    for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
      if (ZOOM_LEVELS[i]! <= idealPxPerFrame) {
        bestIdx = i;
        break;
      }
    }
    setZoomIndex(bestIdx);
  }, [containerRef]);

  const framesToPx = useCallback((frames: number) => {
    return frames * pixelsPerFrame;
  }, [pixelsPerFrame]);

  const pxToFrames = useCallback((px: number) => {
    return Math.round(px / pixelsPerFrame);
  }, [pixelsPerFrame]);

  return {
    pixelsPerFrame,
    pixelsPerSecond,
    zoomIndex,
    zoomIn,
    zoomOut,
    zoomToFit,
    scrollX,
    setScrollX,
    framesToPx,
    pxToFrames,
    containerRef,
  };
}
