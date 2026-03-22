import { useMemo, useState, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import { framesToTimecode, framesToShortTimecode } from '@/utils/timecode';
import { useSwitcherStatus } from '@/hooks/useSwitcherStatus';

interface ShotlistPanelProps {
  sendCommand: (event: string, payload?: Record<string, unknown>) => void;
}

/** Panel z listą vision cue'ów (ujęcia kamer) po prawej stronie */
export function ShotlistPanel({ sendCommand }: ShotlistPanelProps) {
  const timelineCues = usePlaybackStore(s => s.timelineCues);
  const tracks = usePlaybackStore(s => s.tracks);
  const fps = usePlaybackStore(s => s.fps);
  const activeVisionCue = usePlaybackStore(s => s.activeVisionCue);
  const nextVisionCue = usePlaybackStore(s => s.nextVisionCue);
  const activeActId = usePlaybackStore(s => s.activeActId);
  const currentTcFrames = usePlaybackStore(s => s.currentTcFrames);
  const holdMode = usePlaybackStore(s => s.holdMode);
  const addTimelineCue = usePlaybackStore(s => s.addTimelineCue);

  // Faza 29: tally z aktywnego switchera
  const switcherStatus = useSwitcherStatus(500);

  // Formularz dodawania vision cue
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCameraNumber, setNewCameraNumber] = useState(1);
  const [newShotName, setNewShotName] = useState('');
  const [creating, setCreating] = useState(false);

  // Znajdź track vision (do dodawania)
  const visionTrack = useMemo(() => {
    return tracks.find(t => t.type === 'vision');
  }, [tracks]);

  // Filtruj i sortuj vision cues
  const visionCues = useMemo(() => {
    return timelineCues
      .filter(c => c.type === 'vision')
      .sort((a, b) => a.tc_in_frames - b.tc_in_frames)
      .map(c => ({
        ...c,
        camera_number: (c.data as { camera_number?: number }).camera_number ?? 0,
        shot_name: (c.data as { shot_name?: string }).shot_name ?? '',
        color: (c.data as { color?: string }).color ?? '#3b82f6',
      }));
  }, [timelineCues]);

  const handleScrub = (frames: number) => {
    if (!activeActId) return;
    sendCommand('cmd:scrub', { act_id: activeActId, frames });
  };

  // Dodawanie nowego vision cue
  const handleAddVisionCue = useCallback(async () => {
    if (!activeActId || !visionTrack || !newShotName.trim()) return;

    setCreating(true);
    try {
      const tcIn = Math.floor(currentTcFrames);
      const tcOut = tcIn + 3 * fps; // domyślnie 3 sekundy

      const newCue = await window.nextime.createTimelineCue({
        track_id: visionTrack.id,
        act_id: activeActId,
        type: 'vision',
        tc_in_frames: tcIn,
        tc_out_frames: tcOut,
        data: {
          camera_number: newCameraNumber,
          shot_name: newShotName.trim(),
          shot_description: '',
          director_notes: '',
          operator_note: '',
          color: '#3b82f6',
        },
      });

      if (newCue) {
        addTimelineCue({
          id: newCue.id,
          track_id: newCue.track_id,
          act_id: newCue.act_id,
          type: newCue.type,
          tc_in_frames: newCue.tc_in_frames,
          tc_out_frames: newCue.tc_out_frames,
          z_order: newCue.z_order,
          data: newCue.data,
        });
        setNewShotName('');
        setShowAddForm(false);
      }
    } catch (err) {
      console.error('[ShotlistPanel] Błąd tworzenia vision cue:', err);
    } finally {
      setCreating(false);
    }
  }, [activeActId, visionTrack, newCameraNumber, newShotName, currentTcFrames, fps, addTimelineCue]);

  return (
    <div className="w-64 flex-shrink-0 bg-slate-800 border-l border-slate-700 flex flex-col">
      {/* Nagłówek */}
      <div className="px-3 py-2 border-b border-slate-700">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Shotlist
        </h2>
        <span className="text-[10px] text-slate-500">
          {visionCues.length} ujęć
        </span>
      </div>

      {/* Faza 6: Banner HOLD */}
      {holdMode && (
        <div className="px-3 py-1.5 bg-red-900/60 border-b border-red-700 text-center">
          <span className="text-[10px] font-bold text-red-300 uppercase tracking-wider">
            Camera HOLD
          </span>
        </div>
      )}

      {/* Lista vision cues */}
      <div className="flex-1 overflow-y-auto">
        {visionCues.map(cue => {
          const isActive = activeVisionCue?.id === cue.id;
          const isNext = nextVisionCue?.id === cue.id;

          // Faza 29: tally — sprawdź czy kamera jest na PGM/PRV switchera
          const isTallyPgm = switcherStatus.connected && switcherStatus.programNumber === cue.camera_number;
          const isTallyPrv = switcherStatus.connected && switcherStatus.previewNumber === cue.camera_number && !isTallyPgm;

          return (
            <button
              key={cue.id}
              onClick={() => handleScrub(cue.tc_in_frames)}
              className={`w-full text-left px-3 py-2 border-b border-slate-700/50 transition-colors
                ${isActive ? 'bg-emerald-900/40 border-l-2 border-l-emerald-400' : ''}
                ${isNext && !isActive ? 'bg-amber-900/20 border-l-2 border-l-amber-400' : ''}
                ${!isActive && !isNext ? 'hover:bg-slate-700/50 border-l-2 border-l-transparent' : ''}
                ${isTallyPgm ? 'ring-1 ring-inset ring-red-500/60 bg-red-900/20' : ''}
                ${isTallyPrv ? 'ring-1 ring-inset ring-green-500/60 bg-green-900/20' : ''}
              `}
            >
              <div className="flex items-center gap-2">
                {/* Badge kamery */}
                <div
                  className="flex-shrink-0 w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: cue.color }}
                >
                  {cue.camera_number}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-200 truncate">
                    {cue.shot_name || `Camera ${cue.camera_number}`}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {framesToShortTimecode(cue.tc_in_frames, fps)}
                    {cue.tc_out_frames && (
                      <> — {framesToShortTimecode(cue.tc_out_frames, fps)}</>
                    )}
                  </div>
                </div>

                {/* Faza 29: Tally badge */}
                {isTallyPgm && (
                  <span className="flex-shrink-0 px-1 py-0.5 rounded text-[8px] font-bold bg-red-600 text-white">
                    PGM
                  </span>
                )}
                {isTallyPrv && (
                  <span className="flex-shrink-0 px-1 py-0.5 rounded text-[8px] font-bold bg-green-600 text-white">
                    PRV
                  </span>
                )}

                {/* Status badge */}
                {isActive && !isTallyPgm && !isTallyPrv && (
                  <span className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
                {isNext && !isTallyPgm && !isTallyPrv && (
                  <span className="flex-shrink-0 text-[9px] text-amber-400 font-semibold">
                    NEXT
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {visionCues.length === 0 && (
          <div className="px-3 py-8 text-center text-slate-500 text-xs">
            Brak ujęć vision
          </div>
        )}
      </div>

      {/* Formularz dodawania / przycisk + */}
      <div className="border-t border-slate-700">
        {showAddForm ? (
          <div className="px-3 py-2 space-y-2">
            <div className="flex gap-2">
              <select
                value={newCameraNumber}
                onChange={e => setNewCameraNumber(Number(e.target.value))}
                className="w-20 bg-slate-900 border border-slate-600 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none"
              >
                {Array.from({ length: 16 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>Cam {n}</option>
                ))}
              </select>
              <input
                value={newShotName}
                onChange={e => setNewShotName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddVisionCue();
                  if (e.key === 'Escape') setShowAddForm(false);
                }}
                className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                placeholder="Nazwa ujęcia"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddVisionCue}
                disabled={creating || !newShotName.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-xs py-1 rounded"
              >
                {creating ? '...' : 'Dodaj'}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewShotName(''); }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-1 rounded"
              >
                Anuluj
              </button>
            </div>
            <div className="text-[10px] text-slate-500">
              TC: {framesToTimecode(Math.floor(currentTcFrames), fps)} (pozycja playhead)
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            disabled={!visionTrack || !activeActId}
            className="w-full px-3 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={!visionTrack ? 'Brak tracku vision — dodaj track vision na timeline' : 'Dodaj ujęcie kamery'}
          >
            + Dodaj ujęcie
          </button>
        )}
      </div>
    </div>
  );
}
