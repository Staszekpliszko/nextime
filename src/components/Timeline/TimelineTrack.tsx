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
  /** Mapa file_path/id → { waveform, durationFrames } (Faza 36: waveform preview) */
  waveformMap?: Map<string, { waveform: number[]; durationFrames: number }>;
  /** Aktualna pozycja playhead w klatkach (Faza 36: waveform playhead) */
  currentTcFrames?: number;
  getCueColor: (cue: TimelineCueSummary) => string;
  getCueLabel: (cue: TimelineCueSummary) => string;
  onCueDrag?: (cueId: string, newTcIn: number, newTcOut: number | undefined) => void;
  onCueDoubleClick?: (cue: TimelineCueSummary) => void;
  onCueContextMenu?: (cue: TimelineCueSummary, x: number, y: number) => void;
  onCueSelect?: (cueId: string) => void;
  onCueResize?: (cueId: string, newTcOut: number) => void;
  /** Faza 40-C: resize z lewej strony */
  onCueResizeLeft?: (cueId: string, newTcIn: number) => void;
  onTrackDelete?: (trackId: string) => void;
  onTrackRename?: (trackId: string, newName: string) => void;
  onTrackDoubleClick?: (trackId: string, tcInFrames: number) => void;
  /** Faza 36: callback zmiany wysokości tracku */
  onTrackResize?: (trackId: string, newHeightPx: number) => void;
}

/** Jeden pas osi czasu — track z cue blokami */
export function TimelineTrack({
  track,
  cues,
  pixelsPerFrame,
  durationFrames,
  activeCueId,
  selectedCueId,
  waveformMap,
  currentTcFrames,
  getCueColor,
  getCueLabel,
  onCueDrag,
  onCueDoubleClick,
  onCueContextMenu,
  onCueSelect,
  onCueResize,
  onCueResizeLeft,
  onTrackDelete,
  onTrackRename,
  onTrackDoubleClick,
  onTrackResize,
}: TimelineTrackProps) {
  const totalWidth = durationFrames * pixelsPerFrame;
  const trackColor = TRACK_TYPE_COLORS[track.type] ?? '#6b7280';
  const [localHeight, setLocalHeight] = useState(track.height_px);

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

  // Faza 36: resize wysokości tracku (drag na dolnej krawędzi)
  const handleTrackHeightResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = localHeight;

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const newHeight = Math.max(32, Math.min(200, startHeight + delta));
      setLocalHeight(newHeight);
    };

    const handleMouseUp = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const newHeight = Math.max(32, Math.min(200, startHeight + delta));
      setLocalHeight(newHeight);
      if (onTrackResize) {
        onTrackResize(track.id, newHeight);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [localHeight, onTrackResize, track.id]);

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
    <div className="flex border-b border-slate-700/50 relative">
      {/* Etykieta tracka — stała po lewej */}
      <div
        className="group flex-shrink-0 w-32 px-2 py-1 bg-slate-800 border-r border-slate-700 flex items-center gap-1.5 relative"
        style={{ height: `${localHeight}px` }}
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
          height: `${localHeight}px`,
        }}
        onDoubleClick={handleTrackDoubleClick}
      >
        {cues.map(cue => {
          // Faza 36: waveform data i playhead position dla media cues
          let cueWaveformData: number[] | undefined;
          let cuePlayheadPosition: number | undefined;

          if (cue.type === 'media' && waveformMap) {
            // Szukaj waveform po file_path lub media_file_id
            const cueData = cue.data as { file_path?: string; media_file_id?: string; offset_frames?: number };
            const filePath = cueData.file_path;
            const mediaFileId = cueData.media_file_id;
            let entry: { waveform: number[]; durationFrames: number } | undefined;
            if (filePath) entry = waveformMap.get(filePath);
            if (!entry && mediaFileId) entry = waveformMap.get(mediaFileId);

            if (entry && entry.waveform.length > 0 && entry.durationFrames > 0) {
              const totalSamples = entry.waveform.length;
              const offsetFrames = cueData.offset_frames ?? 0;
              const cueDuration = cue.tc_out_frames
                ? cue.tc_out_frames - cue.tc_in_frames
                : entry.durationFrames;

              // Wytnij fragment waveformu odpowiadający widocznemu zakresowi cue
              const startRatio = offsetFrames / entry.durationFrames;
              const endRatio = (offsetFrames + cueDuration) / entry.durationFrames;
              const startSample = Math.floor(startRatio * totalSamples);
              const endSample = Math.min(Math.ceil(endRatio * totalSamples), totalSamples);
              cueWaveformData = entry.waveform.slice(startSample, endSample);
            }

            // Oblicz pozycję playhead wewnątrz bloku media cue
            if (currentTcFrames !== undefined && cue.tc_out_frames && cue.tc_out_frames > cue.tc_in_frames) {
              const duration = cue.tc_out_frames - cue.tc_in_frames;
              const elapsed = currentTcFrames - cue.tc_in_frames;
              cuePlayheadPosition = Math.max(0, Math.min(1, elapsed / duration));
            }
          }

          return (
            <TimelineCueBlock
              key={cue.id}
              cue={cue}
              pixelsPerFrame={pixelsPerFrame}
              color={getCueColor(cue)}
              label={getCueLabel(cue)}
              isActive={cue.id === activeCueId}
              isSelected={cue.id === selectedCueId}
              waveformData={cueWaveformData}
              playheadPosition={cuePlayheadPosition}
              onDragEnd={onCueDrag}
              onDoubleClick={onCueDoubleClick}
              onContextMenu={onCueContextMenu}
              onSelect={onCueSelect}
              onResize={onCueResize}
              onResizeLeft={onCueResizeLeft}
            />
          );
        })}
      </div>

      {/* Faza 36: resize handle na dolnej krawędzi — pogrubianie tracku */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[4px] cursor-ns-resize hover:bg-blue-500/40 z-10"
        onMouseDown={handleTrackHeightResize}
      />
    </div>
  );
}
