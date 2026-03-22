import { useEffect, useState, useCallback } from 'react';
import { TransportBar } from '@/components/TransportBar/TransportBar';
import { RundownTable } from '@/components/RundownTable/RundownTable';
import { RundownSidebar } from '@/components/RundownSidebar/RundownSidebar';
import { CueEditPanel } from '@/components/CueEditPanel/CueEditPanel';
import { Timeline } from '@/components/Timeline/Timeline';
import { TimelineCueDialog } from '@/components/Timeline/TimelineCueDialog';
import { ShotlistPanel } from '@/components/ShotlistPanel/ShotlistPanel';
import { ActSelector } from '@/components/ActSelector/ActSelector';
import { AtemPanel } from '@/components/AtemPanel/AtemPanel';
import { OutputPanel } from '@/components/OutputPanel/OutputPanel';
import { CameraPresetPanel } from '@/components/CameraPresetPanel/CameraPresetPanel';
import { MediaLibraryPanel } from '@/components/MediaLibraryPanel/MediaLibraryPanel';
import { MediaPlayer } from '@/components/MediaPlayer/MediaPlayer';
import type { MediaPlayerState } from '@/components/MediaPlayer/MediaPlayer';
import { MediaStatusBar } from '@/components/MediaPlayer/MediaStatusBar';
import { useRundownSocket } from '@/hooks/useRundownSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { usePlaybackStore } from '@/store/playback.store';
import { TextVariablePanel } from '@/components/TextVariablePanel/TextVariablePanel';
import { ToastContainer, useToastStore } from '@/components/Toast/Toast';
import { ShortcutHelp } from '@/components/ShortcutHelp/ShortcutHelp';
import { SettingsPanel } from '@/components/SettingsPanel/SettingsPanel';
import type { TimelineCueSummary, TextVariableInfo, CueGroupInfo } from '@/store/playback.store';
import type { FPS } from '@/utils/timecode';

// ── Stan dialogu timeline cue ─────────────────────────────────

interface CueDialogState {
  mode: 'create' | 'edit';
  trackId: string;
  trackType: string;
  existingCue?: TimelineCueSummary;
  defaultTcIn?: number;
  defaultTcOut?: number;
}

// ── Stan context menu timeline cue ────────────────────────────

interface CueContextMenuState {
  cue: TimelineCueSummary;
  x: number;
  y: number;
}

export default function App() {
  const [loading, setLoading] = useState(true);

  // WebSocket hook
  const { sendCommand, connected } = useRundownSocket();

  // Keyboard shortcuts (Faza 6)
  useKeyboardShortcuts({ sendCommand });

  // Store — globalny stan
  const cues = usePlaybackStore(s => s.cues);
  const activeRundownId = usePlaybackStore(s => s.activeRundownId);
  const selectedCueId = usePlaybackStore(s => s.selectedCueId);
  const viewMode = usePlaybackStore(s => s.viewMode);
  const setRundowns = usePlaybackStore(s => s.setRundowns);
  const setActiveRundownId = usePlaybackStore(s => s.setActiveRundownId);
  const setSelectedCueId = usePlaybackStore(s => s.setSelectedCueId);
  const setCues = usePlaybackStore(s => s.setCues);
  const setViewMode = usePlaybackStore(s => s.setViewMode);
  const setActs = usePlaybackStore(s => s.setActs);
  const setActiveActId = usePlaybackStore(s => s.setActiveActId);
  const setTracks = usePlaybackStore(s => s.setTracks);
  const setTimelineCues = usePlaybackStore(s => s.setTimelineCues);
  const setTextVariables = usePlaybackStore(s => s.setTextVariables);
  const setCueGroups = usePlaybackStore(s => s.setCueGroups);
  const setColumns = usePlaybackStore(s => s.setColumns);
  const setPrivateNotes = usePlaybackStore(s => s.setPrivateNotes);
  const setHiddenColumnIds = usePlaybackStore(s => s.setHiddenColumnIds);

  // Faza 8: ATEM panel
  const [showAtemPanel, setShowAtemPanel] = useState(false);
  // Faza 9: Output panel
  const [showOutputPanel, setShowOutputPanel] = useState(false);
  // Faza 10: Camera Preset + Media Library panel
  const [showCameraPanel, setShowCameraPanel] = useState(false);
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const [showVariablePanel, setShowVariablePanel] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const atemConnected = usePlaybackStore(s => s.atemConnected);

  // Faza 24: stan media playback
  const [mediaState, setMediaState] = useState<MediaPlayerState>({
    isPlaying: false, fileName: '', currentTimeSec: 0, durationSec: 0, volume: 100,
  });

  // Faza 24: callbacki media z UI
  const handleMediaSeek = useCallback((timeSec: number) => {
    window.nextime.mediaSeek(timeSec);
  }, []);

  const handleMediaStop = useCallback(() => {
    window.nextime.mediaStop();
  }, []);

  // Timeline CRUD dialog/context menu
  const [cueDialog, setCueDialog] = useState<CueDialogState | null>(null);
  const [cueContextMenu, setCueContextMenu] = useState<CueContextMenuState | null>(null);

  // Wybrany cue do edycji
  const selectedCue = selectedCueId
    ? cues.find(c => c.id === selectedCueId) ?? null
    : null;

  // Zamknij context menu przy kliknięciu
  useEffect(() => {
    if (!cueContextMenu) return;
    const close = () => setCueContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [cueContextMenu]);

  // Faza 11: toggle shortcut help via custom event
  useEffect(() => {
    const handler = () => setShowShortcutHelp(prev => !prev);
    document.addEventListener('nextime:toggle-shortcut-help', handler);
    return () => document.removeEventListener('nextime:toggle-shortcut-help', handler);
  }, []);

  // Faza 14: skrót Delete → usuwa zaznaczony cue
  useEffect(() => {
    const handler = async () => {
      const { selectedCueId: selId, cues: allCues } = usePlaybackStore.getState();
      if (!selId) return;
      const cue = allCues.find(c => c.id === selId);
      if (!cue) return;
      const confirmed = window.confirm(`Czy na pewno chcesz usunąć cue "${cue.title || '(bez tytułu)'}"?`);
      if (!confirmed) return;
      try {
        const deleted = await window.nextime.deleteCue(selId);
        if (deleted) usePlaybackStore.getState().removeCue(selId);
      } catch (err) {
        console.error('[App] Błąd usuwania cue (Delete):', err);
      }
    };
    document.addEventListener('nextime:delete-selected-cue', handler);
    return () => document.removeEventListener('nextime:delete-selected-cue', handler);
  }, []);

  // Faza 14: skrót Ctrl+D → duplikuj zaznaczony cue
  useEffect(() => {
    const handler = async () => {
      const { selectedCueId: selId, cues: allCues, activeRundownId: runId } = usePlaybackStore.getState();
      if (!selId || !runId) return;
      const cue = allCues.find(c => c.id === selId);
      if (!cue) return;
      try {
        const newCue = await window.nextime.createCue({
          rundown_id: runId,
          title: cue.title ? `${cue.title} (kopia)` : '',
          subtitle: cue.subtitle,
          duration_ms: cue.duration_ms,
          start_type: cue.start_type,
          auto_start: cue.auto_start,
          sort_order: cue.sort_order + 1,
        });
        if (newCue) {
          usePlaybackStore.getState().addCue({
            id: newCue.id, title: newCue.title, subtitle: newCue.subtitle,
            duration_ms: newCue.duration_ms, start_type: newCue.start_type,
            hard_start_datetime: newCue.start_type === 'hard' ? newCue.hard_start_datetime : undefined,
            auto_start: newCue.auto_start, locked: newCue.locked,
            background_color: newCue.background_color, status: newCue.status,
            group_id: newCue.group_id, sort_order: newCue.sort_order,
          });
          usePlaybackStore.getState().setSelectedCueId(newCue.id);
        }
      } catch (err) {
        console.error('[App] Błąd duplikacji cue (Ctrl+D):', err);
      }
    };
    document.addEventListener('nextime:duplicate-selected-cue', handler);
    return () => document.removeEventListener('nextime:duplicate-selected-cue', handler);
  }, []);

  // Faza 14: skrót Ctrl+Enter → wstaw nowy cue poniżej zaznaczonego
  useEffect(() => {
    const handler = async () => {
      const { selectedCueId: selId, cues: allCues, activeRundownId: runId } = usePlaybackStore.getState();
      if (!runId) return;
      const selectedIndex = selId ? allCues.findIndex(c => c.id === selId) : allCues.length - 1;
      const sortOrder = selectedIndex >= 0 ? selectedIndex + 1 : allCues.length;
      try {
        const newCue = await window.nextime.createCue({
          rundown_id: runId,
          title: '',
          subtitle: '',
          duration_ms: 60_000,
          start_type: 'soft',
          auto_start: false,
          sort_order: sortOrder,
        });
        if (newCue) {
          usePlaybackStore.getState().addCue({
            id: newCue.id, title: newCue.title, subtitle: newCue.subtitle,
            duration_ms: newCue.duration_ms, start_type: newCue.start_type,
            hard_start_datetime: newCue.start_type === 'hard' ? newCue.hard_start_datetime : undefined,
            auto_start: newCue.auto_start, locked: newCue.locked,
            background_color: newCue.background_color, status: newCue.status,
            group_id: newCue.group_id, sort_order: newCue.sort_order,
          });
          usePlaybackStore.getState().setSelectedCueId(newCue.id);
        }
      } catch (err) {
        console.error('[App] Błąd wstawiania cue (Ctrl+Enter):', err);
      }
    };
    document.addEventListener('nextime:insert-cue-below', handler);
    return () => document.removeEventListener('nextime:insert-cue-below', handler);
  }, []);

  // Faza 16: Undo/Redo handler — odświeża dane rundownu po cofnięciu/przywróceniu
  useEffect(() => {
    const refreshAfterUndoRedo = async () => {
      const rundownId = usePlaybackStore.getState().activeRundownId;
      if (!rundownId) return;
      // Odśwież cue'y
      const cueList = await window.nextime.getCues(rundownId);
      usePlaybackStore.getState().setCues(
        cueList.map(c => ({
          id: c.id, title: c.title, subtitle: c.subtitle,
          duration_ms: c.duration_ms, start_type: c.start_type,
          hard_start_datetime: c.hard_start_datetime,
          auto_start: c.auto_start, locked: c.locked,
          background_color: c.background_color,
          status: (c as unknown as Record<string, unknown>).status as 'ready' | 'standby' | 'done' | 'skipped' ?? 'ready',
          group_id: c.group_id, sort_order: c.sort_order,
        })),
      );
      // Odśwież kolumny
      const cols = await window.nextime.getColumns(rundownId);
      usePlaybackStore.getState().setColumns(cols.map(c => ({
        id: c.id, rundown_id: c.rundown_id, name: c.name,
        type: c.type, sort_order: c.sort_order, width_px: c.width_px,
        dropdown_options: c.dropdown_options, is_script: c.is_script,
      })));
      // Odśwież grupy
      const groups = await window.nextime.getCueGroups(rundownId);
      usePlaybackStore.getState().setCueGroups(groups.map(g => ({
        id: g.id, rundown_id: g.rundown_id, label: g.label,
        sort_order: g.sort_order, collapsed: g.collapsed, color: g.color,
      })));
      // Odśwież zmienne
      const vars = await window.nextime.getTextVariables(rundownId);
      usePlaybackStore.getState().setTextVariables(vars.map(v => ({
        id: v.id, rundown_id: v.rundown_id, key: v.key,
        value: v.value, description: v.description, updated_at: v.updated_at,
      })));
    };

    const undoHandler = async () => {
      try {
        const result = await window.nextime.undo();
        usePlaybackStore.getState().setUndoState({
          canUndo: result.canUndo, canRedo: result.canRedo,
          undoDescription: '', redoDescription: '',
        });
        if (result.ok) {
          useToastStore.getState().addToast('info', `Cofnięto: ${result.description}`);
          await refreshAfterUndoRedo();
        }
      } catch (err) {
        console.error('[App] Błąd undo:', err);
      }
    };

    const redoHandler = async () => {
      try {
        const result = await window.nextime.redo();
        usePlaybackStore.getState().setUndoState({
          canUndo: result.canUndo, canRedo: result.canRedo,
          undoDescription: '', redoDescription: '',
        });
        if (result.ok) {
          useToastStore.getState().addToast('info', `Przywrócono: ${result.description}`);
          await refreshAfterUndoRedo();
        }
      } catch (err) {
        console.error('[App] Błąd redo:', err);
      }
    };

    document.addEventListener('nextime:undo', undoHandler);
    document.addEventListener('nextime:redo', redoHandler);
    return () => {
      document.removeEventListener('nextime:undo', undoHandler);
      document.removeEventListener('nextime:redo', redoHandler);
    };
  }, []);

  // Ładowanie rundownu — pobierz cues i ustaw w store
  const loadRundown = useCallback(async (rundownId: string) => {
    try {
      await window.nextime.loadRundown(rundownId);
      setActiveRundownId(rundownId);

      const cueList = await window.nextime.getCues(rundownId);
      setCues(
        cueList.map(c => ({
          id: c.id,
          title: c.title,
          subtitle: c.subtitle,
          duration_ms: c.duration_ms,
          start_type: c.start_type,
          hard_start_datetime: c.hard_start_datetime,
          auto_start: c.auto_start,
          locked: c.locked,
          background_color: c.background_color,
          status: c.status,
          group_id: c.group_id,
          sort_order: c.sort_order,
        })),
      );
      setSelectedCueId(null);

      // Załaduj akty dla tego rundownu
      const actList = await window.nextime.getActs(rundownId);
      setActs(actList.map(a => ({
        id: a.id,
        name: a.name,
        artist: a.artist,
        duration_frames: a.duration_frames,
        fps: a.fps,
        status: a.status,
        color: a.color,
        sort_order: a.sort_order,
      })));

      // Faza 11+12: załaduj zmienne tekstowe, grupy cue'ów i kolumny
      try {
        const [vars, groups, cols] = await Promise.all([
          window.nextime.getTextVariables(rundownId),
          window.nextime.getCueGroups(rundownId),
          window.nextime.getColumns(rundownId),
        ]);
        setTextVariables(vars as TextVariableInfo[]);
        setCueGroups(groups as CueGroupInfo[]);
        setColumns(cols.map(c => ({
          id: c.id,
          rundown_id: c.rundown_id,
          name: c.name,
          type: c.type,
          sort_order: c.sort_order,
          width_px: c.width_px,
          dropdown_options: c.dropdown_options,
          is_script: c.is_script,
        })));
      } catch {
        // Ignoruj — nie blokuj ładowania rundownu
      }

      // Faza 13: załaduj prywatne notatki i widoczność kolumn
      try {
        const [notes, visibilities] = await Promise.all([
          window.nextime.getPrivateNotes(rundownId),
          window.nextime.getColumnVisibilities(rundownId),
        ]);
        // Konwertuj listę notatek na mapę cue_id → treść
        const notesMap: Record<string, string> = {};
        for (const note of notes) {
          notesMap[note.cue_id] = note.content;
        }
        setPrivateNotes(notesMap);
        // Konwertuj listę widoczności na zbiór ukrytych kolumn
        const hidden = new Set<string>();
        for (const v of visibilities) {
          if (v.hidden) hidden.add(v.column_id);
        }
        setHiddenColumnIds(hidden);
      } catch {
        // Ignoruj — nie blokuj ładowania rundownu
      }

    } catch (err) {
      console.error('[NextTime] Błąd ładowania rundownu:', err);
    }
  }, [setActiveRundownId, setCues, setSelectedCueId, setActs, setTextVariables, setCueGroups, setColumns, setPrivateNotes, setHiddenColumnIds]);

  // Ładowanie aktu — przełącz engine w tryb timeline_frames
  const loadAct = useCallback(async (actId: string) => {
    try {
      await window.nextime.loadAct(actId);
      setActiveActId(actId);

      // Pobierz tracki i timeline cues
      const [trackList, tlCueList] = await Promise.all([
        window.nextime.getTracks(actId),
        window.nextime.getTimelineCues(actId),
      ]);

      setTracks(trackList.map(t => ({
        id: t.id,
        act_id: t.act_id,
        type: t.type,
        name: t.name,
        sort_order: t.sort_order,
        enabled: t.enabled,
        height_px: t.height_px,
      })));

      setTimelineCues(tlCueList.map(c => ({
        id: c.id,
        track_id: c.track_id,
        act_id: c.act_id,
        type: c.type,
        tc_in_frames: c.tc_in_frames,
        tc_out_frames: c.tc_out_frames,
        z_order: c.z_order,
        data: c.data,
      })));
    } catch (err) {
      console.error('[NextTime] Błąd ładowania aktu:', err);
    }
  }, [setActiveActId, setTracks, setTimelineCues]);

  // Przełączanie rundownu z sidebar
  const handleRundownSelect = useCallback((rundownId: string) => {
    if (rundownId === activeRundownId) return;
    loadRundown(rundownId);
  }, [activeRundownId, loadRundown]);

  // ── Timeline CRUD callbacks ──────────────────────────────────

  // Double-click na pustym miejscu tracku → dialog tworzenia
  const handleCreateCue = useCallback((trackId: string, tcInFrames: number) => {
    const { tracks, fps, activeActId } = usePlaybackStore.getState();
    if (!activeActId) return;
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    setCueDialog({
      mode: 'create',
      trackId,
      trackType: track.type,
      defaultTcIn: tcInFrames,
      defaultTcOut: tcInFrames + 2 * fps, // domyślnie 2 sekundy
    });
  }, []);

  // Double-click na istniejącym cue → dialog edycji
  const handleEditCue = useCallback((cue: TimelineCueSummary) => {
    const { tracks } = usePlaybackStore.getState();
    const track = tracks.find(t => t.id === cue.track_id);
    if (!track) return;

    setCueDialog({
      mode: 'edit',
      trackId: cue.track_id,
      trackType: track.type,
      existingCue: cue,
    });
  }, []);

  // Right-click na cue → context menu
  const handleCueContextMenu = useCallback((cue: TimelineCueSummary, x: number, y: number) => {
    setCueContextMenu({ cue, x, y });
  }, []);

  // Submit dialogu — create lub edit
  const handleDialogSubmit = useCallback(async (data: { tc_in_frames: number; tc_out_frames?: number; data: Record<string, unknown> }) => {
    if (!cueDialog) return;
    const { activeActId, fps } = usePlaybackStore.getState();
    if (!activeActId) return;

    try {
      if (cueDialog.mode === 'create') {
        // Mapowanie typ tracka → typ cue
        const TRACK_TO_CUE: Record<string, string> = {
          vision: 'vision', vision_fx: 'vision_fx', lyrics: 'lyric',
          cues: 'marker', media: 'media', osc: 'osc', gpi: 'gpi', midi: 'midi', marker: 'marker',
        };
        const cueType = TRACK_TO_CUE[cueDialog.trackType] ?? 'marker';

        const newCue = await window.nextime.createTimelineCue({
          track_id: cueDialog.trackId,
          act_id: activeActId,
          type: cueType as 'vision' | 'vision_fx' | 'lyric' | 'marker' | 'media' | 'osc' | 'gpi' | 'midi',
          tc_in_frames: data.tc_in_frames,
          tc_out_frames: data.tc_out_frames,
          data: data.data,
        });

        if (newCue) {
          usePlaybackStore.getState().addTimelineCue({
            id: newCue.id,
            track_id: newCue.track_id,
            act_id: newCue.act_id,
            type: newCue.type,
            tc_in_frames: newCue.tc_in_frames,
            tc_out_frames: newCue.tc_out_frames,
            z_order: newCue.z_order,
            data: newCue.data,
          });
        }
      } else if (cueDialog.mode === 'edit' && cueDialog.existingCue) {
        const updated = await window.nextime.updateTimelineCue(cueDialog.existingCue.id, {
          tc_in_frames: data.tc_in_frames,
          tc_out_frames: data.tc_out_frames,
          data: data.data,
        });

        if (updated) {
          usePlaybackStore.getState().updateTimelineCue(updated.id, {
            tc_in_frames: updated.tc_in_frames,
            tc_out_frames: updated.tc_out_frames,
            data: updated.data,
          });
        }
      }
    } catch (err) {
      console.error('[App] Błąd zapisu timeline cue:', err);
    }

    setCueDialog(null);
  }, [cueDialog]);

  // Context menu: duplikuj cue
  const handleDuplicateCue = useCallback(async (cue: TimelineCueSummary) => {
    const { activeActId, fps } = usePlaybackStore.getState();
    if (!activeActId) return;

    const duration = cue.tc_out_frames ? cue.tc_out_frames - cue.tc_in_frames : fps * 2;
    const newTcIn = (cue.tc_out_frames ?? cue.tc_in_frames) + 1;

    try {
      const newCue = await window.nextime.createTimelineCue({
        track_id: cue.track_id,
        act_id: activeActId,
        type: cue.type as 'vision' | 'vision_fx' | 'lyric' | 'marker' | 'media' | 'osc' | 'gpi' | 'midi',
        tc_in_frames: newTcIn,
        tc_out_frames: cue.tc_out_frames ? newTcIn + duration : undefined,
        data: { ...cue.data },
      });

      if (newCue) {
        usePlaybackStore.getState().addTimelineCue({
          id: newCue.id,
          track_id: newCue.track_id,
          act_id: newCue.act_id,
          type: newCue.type,
          tc_in_frames: newCue.tc_in_frames,
          tc_out_frames: newCue.tc_out_frames,
          z_order: newCue.z_order,
          data: newCue.data,
        });
      }
    } catch (err) {
      console.error('[App] Błąd duplikacji cue:', err);
    }
    setCueContextMenu(null);
  }, []);

  // Context menu: usuń cue
  const handleDeleteCue = useCallback(async (cueId: string) => {
    try {
      const deleted = await window.nextime.deleteTimelineCue(cueId);
      if (deleted) {
        usePlaybackStore.getState().removeTimelineCue(cueId);
        const { selectedTimelineCueId } = usePlaybackStore.getState();
        if (selectedTimelineCueId === cueId) {
          usePlaybackStore.getState().setSelectedTimelineCueId(null);
        }
      }
    } catch (err) {
      console.error('[App] Błąd usuwania cue:', err);
    }
    setCueContextMenu(null);
  }, []);

  // Inicjalizacja: pobierz rundowny i załaduj pierwszy
  useEffect(() => {
    async function init() {
      try {
        // Pobierz pierwszy projekt (do CameraPresetPanel)
        const projects = await window.nextime.getProjects();
        if (projects.length > 0) {
          setActiveProjectId(projects[0]!.id);
        }

        const list = await window.nextime.getRundowns();
        setRundowns(list);

        if (list.length > 0) {
          await loadRundown(list[0]!.id);
        }
      } catch (err) {
        console.error('[NextTime] Inicjalizacja nie powiodła się:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-slate-400 text-lg">
        Ładowanie NextTime...
      </div>
    );
  }

  // FPS aktywnego aktu (dla dialogu)
  const currentFps = usePlaybackStore.getState().fps;

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      {/* Transport bar na górze */}
      <TransportBar sendCommand={sendCommand} connected={connected} />

      {/* Toggle Rundown / Timeline + ATEM button */}
      <div className="flex items-center gap-1 px-3 py-1 bg-slate-850 border-b border-slate-700">
        <button
          onClick={() => setViewMode('rundown')}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors
            ${viewMode === 'rundown'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:bg-slate-700'
            }
          `}
        >
          Przebieg
        </button>
        <button
          onClick={() => setViewMode('timeline')}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors
            ${viewMode === 'timeline'
              ? 'bg-purple-600 text-white'
              : 'text-slate-400 hover:bg-slate-700'
            }
          `}
        >
          Oś czasu
        </button>
        {/* Przycisk Outputs — dostępny w obu widokach */}
        <button
          onClick={() => setShowOutputPanel(true)}
          className="ml-2 px-3 py-1 rounded text-xs font-medium transition-colors bg-slate-700 text-slate-400 hover:bg-slate-600 border border-slate-600"
        >
          Wyjścia
        </button>
        {/* Faza 11: przycisk Zmienne */}
        <button
          onClick={() => setShowVariablePanel(true)}
          className="px-3 py-1 rounded text-xs font-medium transition-colors bg-slate-700 text-slate-400 hover:bg-slate-600 border border-slate-600"
        >
          Zmienne
        </button>
        {/* Faza 18: przycisk Ustawienia */}
        <button
          onClick={() => setShowSettingsPanel(true)}
          className="ml-auto px-3 py-1 rounded text-xs font-medium transition-colors bg-slate-700 text-slate-400 hover:bg-slate-600 border border-slate-600"
          title="Ustawienia"
        >
          ⚙ Ustawienia
        </button>
        {viewMode === 'timeline' && (
          <>
            <button
              onClick={() => setShowCameraPanel(true)}
              className="ml-2 px-3 py-1 rounded text-xs font-medium transition-colors bg-slate-700 text-slate-400 hover:bg-slate-600 border border-slate-600"
            >
              Kamery
            </button>
            <button
              onClick={() => setShowMediaPanel(true)}
              className="px-3 py-1 rounded text-xs font-medium transition-colors bg-slate-700 text-slate-400 hover:bg-slate-600 border border-slate-600"
            >
              Multimedia
            </button>
            <button
              onClick={() => setShowAtemPanel(true)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                atemConnected
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              ATEM {atemConnected ? 'ON' : 'OFF'}
            </button>
          </>
        )}
      </div>

      {/* Layout warunkowy */}
      {viewMode === 'rundown' ? (
        /* ── Rundown view ── */
        <div className="flex flex-1 overflow-hidden">
          <RundownSidebar onRundownSelect={handleRundownSelect} />
          <div className="flex-1 overflow-hidden">
            <RundownTable
              cues={cues}
              sendCommand={sendCommand}
              activeRundownId={activeRundownId}
            />
          </div>
          {selectedCue && (
            <CueEditPanel
              cue={selectedCue}
              onClose={() => setSelectedCueId(null)}
            />
          )}
        </div>
      ) : (
        /* ── Timeline view ── */
        <div className="flex flex-col flex-1 overflow-hidden">
          <ActSelector onActSelect={loadAct} activeRundownId={activeRundownId} />
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <Timeline
                sendCommand={sendCommand}
                onCreateCue={handleCreateCue}
                onEditCue={handleEditCue}
                onContextMenuCue={handleCueContextMenu}
              />
            </div>
            <ShotlistPanel sendCommand={sendCommand} />
          </div>
        </div>
      )}

      {/* Dialog tworzenia/edycji timeline cue */}
      {cueDialog && (
        <TimelineCueDialog
          mode={cueDialog.mode}
          trackType={cueDialog.trackType}
          fps={currentFps}
          existingCue={cueDialog.existingCue}
          defaultTcIn={cueDialog.defaultTcIn}
          defaultTcOut={cueDialog.defaultTcOut}
          onSubmit={handleDialogSubmit}
          onCancel={() => setCueDialog(null)}
        />
      )}

      {/* Context menu timeline cue */}
      {cueContextMenu && (
        <div
          className="fixed z-50 bg-slate-700 border border-slate-600 rounded shadow-lg py-1 min-w-[120px]"
          style={{ left: cueContextMenu.x, top: cueContextMenu.y }}
        >
          <button
            onClick={() => { handleEditCue(cueContextMenu.cue); setCueContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600"
          >
            Edytuj
          </button>
          <button
            onClick={() => handleDuplicateCue(cueContextMenu.cue)}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600"
          >
            Duplikuj
          </button>
          <button
            onClick={() => handleDeleteCue(cueContextMenu.cue.id)}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-slate-600"
          >
            Usuń
          </button>
        </div>
      )}

      {/* Faza 8: ATEM Panel dialog */}
      {showAtemPanel && <AtemPanel onClose={() => setShowAtemPanel(false)} />}

      {/* Faza 9: Output Panel dialog */}
      {showOutputPanel && <OutputPanel onClose={() => setShowOutputPanel(false)} />}

      {/* Faza 10: Camera Preset Panel */}
      {showCameraPanel && activeProjectId && (
        <CameraPresetPanel
          projectId={activeProjectId}
          onClose={() => setShowCameraPanel(false)}
        />
      )}

      {/* Faza 10: Media Library Panel */}
      {showMediaPanel && (
        <MediaLibraryPanel onClose={() => setShowMediaPanel(false)} />
      )}

      {/* Faza 11: Text Variable Panel */}
      {showVariablePanel && activeRundownId && (
        <TextVariablePanel
          rundownId={activeRundownId}
          onClose={() => setShowVariablePanel(false)}
        />
      )}

      {/* Faza 11: Shortcut Help overlay */}
      {showShortcutHelp && (
        <ShortcutHelp onClose={() => setShowShortcutHelp(false)} />
      )}

      {/* Faza 18: Settings Panel */}
      {showSettingsPanel && (
        <SettingsPanel onClose={() => setShowSettingsPanel(false)} />
      )}

      {/* Faza 24: Media Status Bar — widoczny gdy media jest odtwarzane */}
      <MediaStatusBar
        state={mediaState}
        onSeek={handleMediaSeek}
        onStop={handleMediaStop}
      />

      {/* Faza 24: Ukryty MediaPlayer — obsługuje odtwarzanie audio/video */}
      <MediaPlayer onStateChange={setMediaState} />

      {/* Faza 11: Toast notifications */}
      <ToastContainer />
    </div>
  );
}
