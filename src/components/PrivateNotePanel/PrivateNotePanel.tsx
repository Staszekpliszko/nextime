import { useState, useEffect, useRef, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';

// ── Props ────────────────────────────────────────────────────

interface PrivateNotePanelProps {
  cueId: string;
  cueTitle: string;
}

// ── Komponent ────────────────────────────────────────────────

export function PrivateNotePanel({ cueId, cueTitle }: PrivateNotePanelProps) {
  const privateNotes = usePlaybackStore(s => s.privateNotes);
  const upsertInStore = usePlaybackStore(s => s.upsertPrivateNote);
  const removeFromStore = usePlaybackStore(s => s.removePrivateNote);

  const savedContent = privateNotes[cueId] ?? '';
  const [draft, setDraft] = useState(savedContent);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synchronizuj draft gdy zmieni się cue lub treść z zewnątrz
  useEffect(() => {
    setDraft(privateNotes[cueId] ?? '');
  }, [cueId, privateNotes]);

  // Opóźniony auto-zapis (500ms debounce)
  const saveNote = useCallback((content: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (content.trim() === '') {
        // Pusta notatka → usuń
        await window.nextime.deletePrivateNote(cueId);
        removeFromStore(cueId);
      } else {
        await window.nextime.upsertPrivateNote(cueId, content);
        upsertInStore(cueId, content);
      }
    }, 500);
  }, [cueId, upsertInStore, removeFromStore]);

  // Czyść timer przy odmontowaniu
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (value: string) => {
    setDraft(value);
    saveNote(value);
  };

  const handleDelete = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDraft('');
    await window.nextime.deletePrivateNote(cueId);
    removeFromStore(cueId);
  };

  return (
    <div className="border-t border-slate-700 mt-3 pt-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Prywatna notatka
        </h4>
        {draft.trim() !== '' && (
          <button
            onClick={handleDelete}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
            title="Usuń notatkę"
          >
            Usuń
          </button>
        )}
      </div>
      <p className="text-[10px] text-slate-500 mb-1 truncate" title={cueTitle}>
        {cueTitle}
      </p>
      <textarea
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Wpisz prywatną notatkę..."
        className="w-full h-24 bg-slate-800 border border-slate-600 rounded px-2 py-1.5
          text-sm text-slate-200 placeholder:text-slate-500 resize-y
          focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500"
      />
    </div>
  );
}
