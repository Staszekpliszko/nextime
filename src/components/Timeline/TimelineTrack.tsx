import { useState, useCallback, useRef, useEffect } from 'react';
import { TimelineCueBlock } from './TimelineCueBlock';
import type { TimelineCueSummary, TrackSummary } from '@/store/playback.store';

/** Kolory per typ tracka */
export const TRACK_TYPE_COLORS: Record<string, string> = {
  vision: '#3b82f6',     // blue
  vision_fx: '#8b5cf6',  // purple
  lyrics: '#06b6d4',     // cyan
  cues: '#f59e0b',       // amber
  media: '#6366f1',      // indigo
  osc: '#6b7280',        // gray
  gpi: '#f97316',        // orange
  midi: '#22c55e',       // green
  marker: '#ef4444',     // red
};

interface TimelineTrackProps {
  track: TrackSummary;
  cues: TimelineCueSummary[];
  pixelsPerFrame: number;
  durationFrames: number;
  activeCueId?: string;
  selectedCueId?: string;
  getCueColor: (cue: TimelineCueSummary) => string;
  getCueLabel: (cue: TimelineCueSummary) => string;
  onCueDrag?: (cueId: string, newTcIn: number, newTcOut: number | undefined) => void;
  onCueDoubleClick?: (cue: TimelineCueSummary) => void;
  onCueContextMenu?: (cue: TimelineCueSummary, x: number, y: number) => void;
  onCueSelect?: (cueId: string) => void;
  onCueResize?: (cueId: string, newTcOut: number) => void;
  onTrackDelete?: (trackId: string) => void;
  onTrackRename?: (trackId: string, newName: string) => void;
  onTrackDoubleClick?: (trackId: string, tcInFrames: number) => void;
}

/** Jeden pas osi czasu — track z cue blokami */
export function TimelineTrack({
  track,
  cues,
  pixelsPerFrame,
  durationFrames,
  activeCueId,
  selectedCueId,
  getCueColor,
  getCueLabel,
  onCueDrag,
  onCueDoubleClick,
  onCueContextMenu,
  onCueSelect,
  onCueResize,
  onTrackDelete,
  onTrackRename,
  onTrackDoubleClick,
}: TimelineTrackProps) {
  const totalWidth = durationFrames * pixelsPerFrame;
  const trackColor = TRACK_TYPE_COLORS[track.type] ?? '#6b7280';

  // Inline edit nazwy tracka
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(track.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  const handleNameSubmit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== track.name && onTrackRename) {
      onTrackRename(track.id, trimmed);
    }
    setIsEditingName(false);
  }, [editName, track.id, track.name, onTrackRename]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNameSubmit();
    if (e.key === 'Escape') { setEditName(track.name); setIsEditingName(false); }
  }, [handleNameSubmit, track.name]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onTrackDelete) return;
    const confirmed = window.confirm(`Usunąć track "${track.name}"? Wszystkie cue'y na tym tracku zostaną usunięte.`);
    if (confirmed) onTrackDelete(track.id);
  }, [onTrackDelete, track.id, track.name]);

  // Double-click na pustym miejscu tracku
  const handleTrackDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!onTrackDoubleClick) return;
    // Oblicz pozycję w klatkach na podstawie kliknięcia
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const tcInFrames = Math.max(0, Math.round(x / pixelsPerFrame));
    onTrackDoubleClick(track.id, tcInFrames);
  }, [onTrackDoubleClick, pixelsPerFrame, track.id]);

  return (
    <div className="flex border-b border-slate-700/50">
      {/* Etykieta tracka — stała po lewej */}
      <div
        className="group flex-shrink-0 w-32 px-2 py-1 bg-slate-800 border-r border-slate-700 flex items-center gap-1.5 relative"
        style={{ height: `${track.height_px}px` }}
      >
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: trackColor }}
        />

        {isEditingName ? (
          <input
            ref={nameInputRef}
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={handleNameKeyDown}
            onBlur={handleNameSubmit}
            className="flex-1 min-w-0 bg-slate-900 border border-slate-600 rounded px-1 text-xs text-slate-200 focus:outline-none"
          />
        ) : (
          <span
            className="text-xs text-slate-300 truncate cursor-default"
            onDoubleClick={() => { setEditName(track.name); setIsEditingName(true); }}
          >
            {track.name}
          </span>
        )}

        {/* Przycisk usuwania — widoczny on hover */}
        {onTrackDelete && (
          <button
            onClick={handleDeleteClick}
            className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 text-xs transition-opacity"
            title="Usuń track"
          >
            &times;
          </button>
        )}
      </div>

      {/* Zawartość tracka — scrollowalna */}
      <div
        className="relative flex-1 bg-slate-900/50"
        style={{
          width: `${totalWidth}px`,
          height: `${track.height_px}px`,
        }}
        onDoubleClick={handleTrackDoubleClick}
      >
        {cues.map(cue => (
          <TimelineCueBlock
            key={cue.id}
            cue={cue}
            pixelsPerFrame={pixelsPerFrame}
            color={getCueColor(cue)}
            label={getCueLabel(cue)}
            isActive={cue.id === activeCueId}
            isSelected={cue.id === selectedCueId}
            onDragEnd={onCueDrag}
            onDoubleClick={onCueDoubleClick}
            onContextMenu={onCueContextMenu}
            onSelect={onCueSelect}
            onResize={onCueResize}
          />
        ))}
      </div>
    </div>
  );
}
