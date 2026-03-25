import { useCallback, useRef, useState } from 'react';
import type { TimelineCueSummary } from '@/store/playback.store';
import { WaveformCanvas } from './WaveformCanvas';

interface TimelineCueBlockProps {
  cue: TimelineCueSummary;
  pixelsPerFrame: number;
  color: string;
  label: string;
  isActive: boolean;
  isSelected?: boolean;
  /** Dane waveformu (number[] z ffprobe) — tylko dla media cues */
  waveformData?: number[];
  /** Znormalizowana pozycja playhead wewnątrz bloku (0–1) */
  playheadPosition?: number;
  onDragEnd?: (cueId: string, newTcIn: number, newTcOut: number | undefined) => void;
  onDoubleClick?: (cue: TimelineCueSummary) => void;
  onContextMenu?: (cue: TimelineCueSummary, x: number, y: number) => void;
  onSelect?: (cueId: string) => void;
  onResize?: (cueId: string, newTcOut: number) => void;
  /** Faza 40-C: resize z lewej strony — zmiana tc_in */
  onResizeLeft?: (cueId: string, newTcIn: number) => void;
}

/** Blok cue na tracku — kolorowy, draggable, resizable */
export function TimelineCueBlock({
  cue,
  pixelsPerFrame,
  color,
  label,
  isActive,
  isSelected,
  waveformData,
  playheadPosition,
  onDragEnd,
  onDoubleClick,
  onContextMenu,
  onSelect,
  onResize,
  onResizeLeft,
}: TimelineCueBlockProps) {
  const left = cue.tc_in_frames * pixelsPerFrame;
  const width = cue.tc_out_frames
    ? (cue.tc_out_frames - cue.tc_in_frames) * pixelsPerFrame
    : 4; // Cue punktowy — 4px

  const isPoint = !cue.tc_out_frames;

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, origLeft: 0 });

  // Resize state
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Faza 40-C: sprawdź czy to resize z lewej (pierwsze 6px)
    if (!isPoint && cue.tc_out_frames && onResizeLeft) {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      if (relX < 6) {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        const startX = e.clientX;
        const origTcIn = cue.tc_in_frames;

        const handleMouseMove = (ev: MouseEvent) => {
          const delta = ev.clientX - startX;
          const newTcIn = Math.max(
            0,
            Math.min(cue.tc_out_frames! - 1, Math.round(origTcIn + delta / pixelsPerFrame)),
          );
          onResizeLeft(cue.id, newTcIn);
        };

        const handleMouseUp = () => {
          setIsResizing(false);
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return;
      }
    }

    // Sprawdź czy to resize z prawej (ostatnie 6px)
    if (!isPoint && cue.tc_out_frames && onResize) {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      if (relX > rect.width - 6) {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        const startX = e.clientX;
        const origTcOut = cue.tc_out_frames;

        const handleMouseMove = (ev: MouseEvent) => {
          const delta = ev.clientX - startX;
          const newTcOut = Math.max(
            cue.tc_in_frames + 1,
            Math.round(origTcOut + delta / pixelsPerFrame),
          );
          onResize(cue.id, newTcOut);
        };

        const handleMouseUp = () => {
          setIsResizing(false);
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return;
      }
    }

    // Selekcja
    if (onSelect) {
      onSelect(cue.id);
    }

    if (!onDragEnd) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = { mouseX: e.clientX, origLeft: left };

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - dragStartRef.current.mouseX;
      const newLeft = dragStartRef.current.origLeft + delta;
      const newTcIn = Math.max(0, Math.round(newLeft / pixelsPerFrame));
      const duration = cue.tc_out_frames ? cue.tc_out_frames - cue.tc_in_frames : undefined;
      const newTcOut = duration !== undefined ? newTcIn + duration : undefined;
      onDragEnd(cue.id, newTcIn, newTcOut);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [cue, left, pixelsPerFrame, onDragEnd, onSelect, onResize, onResizeLeft, isPoint]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDoubleClick) onDoubleClick(cue);
  }, [cue, onDoubleClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) onContextMenu(cue, e.clientX, e.clientY);
  }, [cue, onContextMenu]);

  // Kursor: resize na prawej krawędzi, grab na reszcie
  const cursorClass = isResizing ? 'cursor-ew-resize' : isDragging ? 'cursor-grabbing' : 'cursor-grab';

  return (
    <div
      className={`absolute top-1 h-[calc(100%-8px)] rounded-sm transition-shadow
        ${isActive ? 'ring-2 ring-white shadow-lg' : ''}
        ${isSelected && !isActive ? 'ring-2 ring-blue-400 shadow-md' : ''}
        ${!isActive && !isSelected ? 'hover:brightness-110' : ''}
        ${isDragging ? 'opacity-80' : ''}
        ${isPoint ? 'rounded-full' : ''}
        ${cursorClass}
      `}
      style={{
        left: `${left}px`,
        width: `${Math.max(width, 2)}px`,
        backgroundColor: color,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      title={label}
    >
      {/* Waveform overlay — cienki pasek wycentrowany w pionie */}
      {waveformData && waveformData.length > 0 && !isPoint && width > 10 && (
        <div className="absolute inset-0 flex items-center pointer-events-none">
          <WaveformCanvas
            waveformData={waveformData}
            width={Math.max(width, 2)}
            height={24}
            playheadPosition={playheadPosition}
            color="rgba(255,255,255,0.5)"
          />
        </div>
      )}

      {/* Etykieta widoczna przy szerszych blokach */}
      {width > 40 && !isPoint && (
        <span className="absolute inset-0 px-1 text-[10px] text-white truncate leading-6 pointer-events-none">
          {label}
        </span>
      )}

      {/* Faza 40-C: Resize handle na lewej krawędzi */}
      {!isPoint && width > 10 && (
        <div className="absolute left-0 top-0 w-[6px] h-full cursor-ew-resize" />
      )}

      {/* Resize handle na prawej krawędzi */}
      {!isPoint && width > 10 && (
        <div className="absolute right-0 top-0 w-[6px] h-full cursor-ew-resize" />
      )}
    </div>
  );
}
