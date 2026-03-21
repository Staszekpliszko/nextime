import { useState, useCallback, useRef } from 'react';
import type { FPS } from '@/utils/timecode';

/** Poziomy zoomu — pixelsPerFrame */
const ZOOM_LEVELS = [0.5, 1, 2, 4, 8, 16];
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
    scrollX,
    setScrollX,
    framesToPx,
    pxToFrames,
    containerRef,
  };
}
