import { useState, useCallback, useRef, useEffect } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import type { ActSummary } from '@/store/playback.store';
import { timecodeToFrames, framesToTimecode, type FPS } from '@/utils/timecode';

interface ActSelectorProps {
  onActSelect: (actId: string) => void;
  activeRundownId: string | null;
}

/** Predefiniowane kolory aktów */
const ACT_COLORS = [
  '#1E3A5F', '#2563EB', '#7C3AED', '#DB2777',
  '#DC2626', '#EA580C', '#16A34A', '#0891B2',
];

/** Opcje FPS z etykietami */
const FPS_OPTIONS: { value: FPS; label: string }[] = [
  { value: 24, label: '24' },
  { value: 25, label: '25' },
  { value: 29, label: '29.97' },
  { value: 30, label: '30' },
  { value: 50, label: '50' },
  { value: 60, label: '60' },
];

/** Dropdown/tabs do wyboru aktu (w trybie Timeline) z CRUD */
export function ActSelector({ onActSelect, activeRundownId }: ActSelectorProps) {
  const acts = usePlaybackStore(s => s.acts);
  const activeActId = usePlaybackStore(s => s.activeActId);
  const addAct = usePlaybackStore(s => s.addAct);
  const updateActInStore = usePlaybackStore(s => s.updateAct);
  const removeAct = usePlaybackStore(s => s.removeAct);

  // Formularz tworzenia
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Formularz edycji
  const [editingActId, setEditingActId] = useState<string | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ actId: string; x: number; y: number } | null>(null);

  // Zamknij context menu przy kliknięciu gdziekolwiek
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  // ── Tworzenie aktu ──────────────────────────────────────────

  const handleCreate = useCallback(async (formData: ActFormData) => {
    if (!activeRundownId || !formData.name.trim()) return;

    setCreating(true);
    try {
      const durationFrames = formData.durationTc
        ? timecodeToFrames(formData.durationTc, formData.fps)
        : 5 * 60 * formData.fps; // domyślnie 5 minut

      // Cast FPS: store FPS (timecode.ts) zawiera 59, repo FPS nie — ale UI oferuje tylko wspólne wartości
      const repoFps = formData.fps as 24 | 25 | 29 | 30 | 50 | 60;
      const newAct = await window.nextime.createAct({
        rundown_id: activeRundownId,
        name: formData.name.trim(),
        artist: formData.artist?.trim() || undefined,
        fps: repoFps,
        color: formData.color,
        duration_frames: durationFrames,
        sort_order: acts.length,
      });

      if (newAct) {
        addAct({
          id: newAct.id,
          name: newAct.name,
          artist: newAct.artist,
          duration_frames: newAct.duration_frames,
          fps: newAct.fps as FPS,
          status: newAct.status,
          color: newAct.color,
          sort_order: newAct.sort_order,
        });
        setShowCreateForm(false);
        onActSelect(newAct.id);
      }
    } catch (err) {
      console.error('[ActSelector] Błąd tworzenia aktu:', err);
    } finally {
      setCreating(false);
    }
  }, [activeRundownId, acts.length, addAct, onActSelect]);

  // ── Edycja aktu ─────────────────────────────────────────────

  const handleUpdate = useCallback(async (actId: string, formData: ActFormData) => {
    try {
      const durationFrames = formData.durationTc
        ? timecodeToFrames(formData.durationTc, formData.fps)
        : undefined;

      const repoFps = formData.fps as 24 | 25 | 29 | 30 | 50 | 60;
      const updated = await window.nextime.updateAct(actId, {
        name: formData.name.trim(),
        artist: formData.artist?.trim() || undefined,
        fps: repoFps,
        color: formData.color,
        ...(durationFrames !== undefined ? { duration_frames: durationFrames } : {}),
      });

      if (updated) {
        updateActInStore(actId, {
          name: updated.name,
          artist: updated.artist,
          fps: updated.fps as FPS,
          color: updated.color,
          duration_frames: updated.duration_frames,
        });
      }
      setEditingActId(null);
    } catch (err) {
      console.error('[ActSelector] Błąd edycji aktu:', err);
    }
  }, [updateActInStore]);

  // ── Usuwanie aktu ───────────────────────────────────────────

  const handleDelete = useCallback(async (actId: string) => {
    const act = acts.find(a => a.id === actId);
    if (!act) return;

    const confirmed = window.confirm(`Usunąć akt "${act.name}"? Wszystkie tracki i cue'y zostaną usunięte.`);
    if (!confirmed) return;

    try {
      const deleted = await window.nextime.deleteAct(actId);
      if (deleted) {
        removeAct(actId);
      }
    } catch (err) {
      console.error('[ActSelector] Błąd usuwania aktu:', err);
    }
  }, [acts, removeAct]);

  // ── Context menu ────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, actId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ actId, x: e.clientX, y: e.clientY });
  }, []);

  // Akt edytowany (jeśli jest)
  const editingAct = editingActId ? acts.find(a => a.id === editingActId) : null;

  return (
    <div className="bg-slate-800 border-b border-slate-700">
      {/* Zakładki aktów */}
      <div className="flex items-center gap-1 px-2 py-1 overflow-x-auto">
        {acts.map(act => (
          <button
            key={act.id}
            onClick={() => onActSelect(act.id)}
            onContextMenu={(e) => handleContextMenu(e, act.id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap
              ${act.id === activeActId
                ? 'bg-slate-600 text-white'
                : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }
            `}
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: act.color }}
            />
            <span>{act.name}</span>
            {act.artist && (
              <span className="text-slate-500">— {act.artist}</span>
            )}
          </button>
        ))}

        {/* Przycisk dodawania */}
        <button
          onClick={() => { setShowCreateForm(!showCreateForm); setEditingActId(null); }}
          disabled={!activeRundownId}
          className="px-2 py-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          title="Nowy akt"
        >
          +
        </button>

        {acts.length === 0 && !showCreateForm && (
          <span className="text-xs text-slate-500 px-2">
            Brak aktów — kliknij + aby dodać
          </span>
        )}
      </div>

      {/* Formularz tworzenia */}
      {showCreateForm && (
        <ActForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreateForm(false)}
          submitting={creating}
          submitLabel="Utwórz"
        />
      )}

      {/* Formularz edycji */}
      {editingAct && (
        <ActForm
          initialValues={{
            name: editingAct.name,
            artist: editingAct.artist,
            fps: editingAct.fps,
            color: editingAct.color,
            durationTc: framesToTimecode(editingAct.duration_frames, editingAct.fps),
          }}
          onSubmit={(data) => handleUpdate(editingAct.id, data)}
          onCancel={() => setEditingActId(null)}
          submitting={false}
          submitLabel="Zapisz"
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-slate-700 border border-slate-600 rounded shadow-lg py-1 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => { setEditingActId(contextMenu.actId); setShowCreateForm(false); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600"
          >
            Edytuj
          </button>
          <button
            onClick={() => { handleDelete(contextMenu.actId); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-slate-600"
          >
            Usuń
          </button>
        </div>
      )}
    </div>
  );
}

// ── Formularz aktu (reused: create + edit) ──────────────────

interface ActFormData {
  name: string;
  artist?: string;
  fps: FPS;
  color: string;
  durationTc?: string;
}

interface ActFormProps {
  initialValues?: ActFormData;
  onSubmit: (data: ActFormData) => void;
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
}

function ActForm({ initialValues, onSubmit, onCancel, submitting, submitLabel }: ActFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [artist, setArtist] = useState(initialValues?.artist ?? '');
  const [fps, setFps] = useState<FPS>(initialValues?.fps ?? 25);
  const [color, setColor] = useState(initialValues?.color ?? ACT_COLORS[0]!);
  const [durationTc, setDurationTc] = useState(initialValues?.durationTc ?? '00:05:00:00');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({ name, artist, fps, color, durationTc });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="px-3 py-2 border-t border-slate-700 space-y-2 bg-slate-800/80">
      <div className="flex gap-2">
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          placeholder="Nazwa aktu"
        />
        <input
          type="text"
          value={artist}
          onChange={e => setArtist(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          placeholder="Artysta (opcjonalnie)"
        />
      </div>

      <div className="flex items-center gap-3">
        {/* FPS */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500">FPS:</span>
          <select
            value={fps}
            onChange={e => setFps(Number(e.target.value) as FPS)}
            className="bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-xs text-slate-200 focus:outline-none"
          >
            {FPS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Czas trwania */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500">Czas:</span>
          <input
            type="text"
            value={durationTc}
            onChange={e => setDurationTc(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-24 bg-slate-900 border border-slate-600 rounded px-2 py-0.5 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
            placeholder="HH:MM:SS:FF"
          />
        </div>

        {/* Kolor */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500">Kolor:</span>
          <div className="flex gap-1">
            {ACT_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-4 h-4 rounded-sm transition-all ${
                  color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800 scale-110' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-xs py-1 rounded"
        >
          {submitting ? '...' : submitLabel}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-1 rounded"
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}
