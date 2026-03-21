import { useCallback, useEffect, useState } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import { useTimelinePlayhead } from '@/hooks/usePlayback';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrack, TRACK_TYPE_COLORS } from './TimelineTrack';
import { TimelinePlayhead } from './TimelinePlayhead';
import { useTimelineZoom } from './useTimelineZoom';
import { framesToTimecode } from '@/utils/timecode';
import type { TimelineCueSummary, TrackSummary } from '@/store/playback.store';

/** Domyślne nazwy per typ tracka */
const TRACK_DEFAULT_NAMES: Record<string, string> = {
  vision: 'Kamery',
  vision_fx: 'Efekty wizji',
  lyrics: 'Tekst',
  cues: 'Sygnały',
  media: 'Multimedia',
  osc: 'OSC',
  gpi: 'GPI',
  midi: 'MIDI',
  marker: 'Markery',
};

/** Typy tracków dostępne do dodania */
const TRACK_TYPES = ['vision', 'lyrics', 'cues', 'osc', 'midi', 'gpi', 'media'] as const;

interface TimelineProps {
  sendCommand: (event: string, payload?: Record<string, unknown>) => void;
  onCreateCue?: (trackId: string, tcInFrames: number) => void;
  onEditCue?: (cue: TimelineCueSummary) => void;
  onContextMenuCue?: (cue: TimelineCueSummary, x: number, y: number) => void;
}

/** Główny komponent osi czasu — Timeline (CuePilot-style) */
export function Timeline({ sendCommand, onCreateCue, onEditCue, onContextMenuCue }: TimelineProps) {
  const tracks = usePlaybackStore(s => s.tracks);
  const timelineCues = usePlaybackStore(s => s.timelineCues);
  const currentTcFrames = usePlaybackStore(s => s.currentTcFrames);
  const fps = usePlaybackStore(s => s.fps);
  const activeActId = usePlaybackStore(s => s.activeActId);
  const activeVisionCue = usePlaybackStore(s => s.activeVisionCue);
  const playback = usePlaybackStore(s => s.playback);
  const selectedTimelineCueId = usePlaybackStore(s => s.selectedTimelineCueId);
  const setSelectedTimelineCueId = usePlaybackStore(s => s.setSelectedTimelineCueId);
  const addTrack = usePlaybackStore(s => s.addTrack);
  const removeTrack = usePlaybackStore(s => s.removeTrack);

  // Faza 6: interpolowany playhead dla płynnego ruchu
  const interpolatedFrames = useTimelinePlayhead();

  const actDuration = playback?.tc_mode === 'timeline_frames'
    ? playback.tc.act_duration_frames
    : 7500; // fallback 5min @ 25fps

  const zoom = useTimelineZoom(fps);
  const { pixelsPerFrame, framesToPx, containerRef, zoomIn, zoomOut } = zoom;

  // Dropdown "+ Track"
  const [showTrackTypeMenu, setShowTrackTypeMenu] = useState(false);

  // Scrub po kliknięciu na ruler lub track
  const handleScrub = useCallback((frames: number) => {
    if (!activeActId) return;
    sendCommand('cmd:scrub', { act_id: activeActId, frames });
  }, [activeActId, sendCommand]);

  // Auto-scroll playhead do widoku (Faza 6: interpolowany playhead)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const phPx = framesToPx(interpolatedFrames);
    const scrollLeft = container.scrollLeft;
    const viewWidth = container.clientWidth;

    // Jeśli playhead wychodzi poza widok — scroll
    if (phPx < scrollLeft + 100 || phPx > scrollLeft + viewWidth - 100) {
      container.scrollLeft = phPx - viewWidth / 3;
    }
  }, [interpolatedFrames, framesToPx, containerRef]);

  // Zoom na Ctrl+scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }
  }, [zoomIn, zoomOut]);

  // Klawisz Delete — usuń zaznaczony cue
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedTimelineCueId) {
        window.nextime.deleteTimelineCue(selectedTimelineCueId).then(deleted => {
          if (deleted) {
            usePlaybackStore.getState().removeTimelineCue(selectedTimelineCueId);
            setSelectedTimelineCueId(null);
          }
        });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedTimelineCueId, setSelectedTimelineCueId]);

  // Grupuj cues per track
  const cuesByTrack = new Map<string, TimelineCueSummary[]>();
  for (const cue of timelineCues) {
    const arr = cuesByTrack.get(cue.track_id) ?? [];
    arr.push(cue);
    cuesByTrack.set(cue.track_id, arr);
  }

  // Kolor i etykieta cue
  const getCueColor = useCallback((cue: TimelineCueSummary): string => {
    if (cue.type === 'vision') {
      return (cue.data as { color?: string }).color ?? '#3b82f6';
    }
    if (cue.type === 'marker') {
      return (cue.data as { color?: string }).color ?? '#ef4444';
    }
    return '#6b7280';
  }, []);

  const getCueLabel = useCallback((cue: TimelineCueSummary): string => {
    if (cue.type === 'vision') {
      const d = cue.data as { camera_number?: number; shot_name?: string };
      return `CAM ${d.camera_number ?? '?'} — ${d.shot_name ?? ''}`;
    }
    if (cue.type === 'lyric') {
      return (cue.data as { text?: string }).text ?? '';
    }
    if (cue.type === 'marker') {
      return (cue.data as { label?: string }).label ?? 'Marker';
    }
    return cue.type;
  }, []);

  // Drag cue — aktualizacja pozycji
  const handleCueDrag = useCallback((cueId: string, newTcIn: number, newTcOut: number | undefined) => {
    window.nextime.updateTimelineCue(cueId, {
      tc_in_frames: newTcIn,
      tc_out_frames: newTcOut,
    });
  }, []);

  // Resize cue — zmiana tc_out_frames
  const handleCueResize = useCallback((cueId: string, newTcOut: number) => {
    window.nextime.updateTimelineCue(cueId, { tc_out_frames: newTcOut });
    usePlaybackStore.getState().updateTimelineCue(cueId, { tc_out_frames: newTcOut });
  }, []);

  // Selekcja cue
  const handleCueSelect = useCallback((cueId: string) => {
    setSelectedTimelineCueId(cueId);
  }, [setSelectedTimelineCueId]);

  // ── Zarządzanie trackami ─────────────────────────────────────

  const handleAddTrack = useCallback(async (type: string) => {
    if (!activeActId) return;
    setShowTrackTypeMenu(false);

    try {
      const newTrack = await window.nextime.createTrack({
        act_id: activeActId,
        type: type as 'vision' | 'vision_fx' | 'lyrics' | 'cues' | 'media' | 'osc' | 'gpi' | 'midi',
        name: TRACK_DEFAULT_NAMES[type] ?? type,
        sort_order: tracks.length,
      });

      if (newTrack) {
        addTrack({
          id: newTrack.id,
          act_id: newTrack.act_id,
          type: newTrack.type,
          name: newTrack.name,
          sort_order: newTrack.sort_order,
          enabled: newTrack.enabled,
          height_px: newTrack.height_px,
        });
      }
    } catch (err) {
      console.error('[Timeline] Błąd tworzenia tracku:', err);
    }
  }, [activeActId, tracks.length, addTrack]);

  const handleDeleteTrack = useCallback(async (trackId: string) => {
    try {
      const deleted = await window.nextime.deleteTrack(trackId);
      if (deleted) {
        removeTrack(trackId);
      }
    } catch (err) {
      console.error('[Timeline] Błąd usuwania tracku:', err);
    }
  }, [removeTrack]);

  const handleRenameTrack = useCallback(async (trackId: string, newName: string) => {
    try {
      await window.nextime.updateTrack(trackId, { name: newName });
    } catch (err) {
      console.error('[Timeline] Błąd zmiany nazwy tracku:', err);
    }
  }, []);

  // Double-click na pustym miejscu tracka → tworzenie cue
  const handleTrackDoubleClick = useCallback((trackId: string, tcInFrames: number) => {
    if (onCreateCue) {
      onCreateCue(trackId, tcInFrames);
    }
  }, [onCreateCue]);

  const playheadPx = framesToPx(interpolatedFrames);
  const totalWidth = actDuration * pixelsPerFrame;

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border-b border-slate-700">
        <span className="text-xs text-slate-400">TC:</span>
        <span className="text-sm font-mono text-emerald-400">
          {framesToTimecode(Math.floor(currentTcFrames), fps)}
        </span>

        <div className="flex-1" />

        <button
          onClick={zoomOut}
          className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
        >
          −
        </button>
        <span className="text-[10px] text-slate-500 w-12 text-center">
          {pixelsPerFrame}px/f
        </span>
        <button
          onClick={zoomIn}
          className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
        >
          +
        </button>
      </div>

      {/* Scrollable timeline area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
        onWheel={handleWheel}
      >
        {/* Ruler */}
        <div className="sticky top-0 z-40 flex">
          <div className="flex-shrink-0 w-32 bg-slate-800 border-b border-slate-700" />
          <TimelineRuler
            durationFrames={actDuration}
            fps={fps}
            pixelsPerFrame={pixelsPerFrame}
            onRulerClick={handleScrub}
          />
        </div>

        {/* Tracks */}
        <div className="relative">
          {tracks.map(track => (
            <TimelineTrack
              key={track.id}
              track={track}
              cues={cuesByTrack.get(track.id) ?? []}
              pixelsPerFrame={pixelsPerFrame}
              durationFrames={actDuration}
              activeCueId={activeVisionCue?.id}
              selectedCueId={selectedTimelineCueId ?? undefined}
              getCueColor={getCueColor}
              getCueLabel={getCueLabel}
              onCueDrag={handleCueDrag}
              onCueDoubleClick={onEditCue}
              onCueContextMenu={onContextMenuCue}
              onCueSelect={handleCueSelect}
              onCueResize={handleCueResize}
              onTrackDelete={handleDeleteTrack}
              onTrackRename={handleRenameTrack}
              onTrackDoubleClick={handleTrackDoubleClick}
            />
          ))}

          {/* Playhead — rozciąga się na wszystkie tracki */}
          <TimelinePlayhead positionPx={playheadPx + 128} />
        </div>

        {/* Pusty stan + przycisk "+ Track" */}
        {tracks.length === 0 && (
          <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
            {activeActId ? 'Brak tracków — dodaj track poniżej' : 'Załaduj akt, aby zobaczyć oś czasu'}
          </div>
        )}
      </div>

      {/* Przycisk + Track pod trackami */}
      {activeActId && (
        <div className="relative border-t border-slate-700 bg-slate-800">
          <button
            onClick={() => setShowTrackTypeMenu(!showTrackTypeMenu)}
            className="w-full px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors text-left"
          >
            + Dodaj track
          </button>

          {/* Dropdown z typami tracków */}
          {showTrackTypeMenu && (
            <div className="absolute bottom-full left-0 mb-1 bg-slate-700 border border-slate-600 rounded shadow-lg py-1 z-50 min-w-[160px]">
              {TRACK_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => handleAddTrack(type)}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600 flex items-center gap-2"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: TRACK_TYPE_COLORS[type] ?? '#6b7280' }}
                  />
                  <span>{TRACK_DEFAULT_NAMES[type] ?? type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
