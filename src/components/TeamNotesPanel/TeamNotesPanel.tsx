import { useState, useEffect, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import { TeamNoteItem } from './TeamNoteItem';
import type { TeamNote } from '../../../electron/db/repositories/team-note.repo';

interface TeamNotesPanelProps {
  rundownId: string;
  onClose: () => void;
}

type FilterMode = 'all' | 'cue';

export function TeamNotesPanel({ rundownId, onClose }: TeamNotesPanelProps) {
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [newContent, setNewContent] = useState('');
  const [authorName, setAuthorName] = useState(() => {
    // Zapamiętaj imię autora w localStorage
    return localStorage.getItem('nextime_team_note_author') || 'Reżyser';
  });
  const [loading, setLoading] = useState(true);

  const selectedCueId = usePlaybackStore(s => s.selectedCueId);

  // Ładowanie notatek z bazy
  const loadNotes = useCallback(async () => {
    try {
      const list = await window.nextime.getTeamNotes(rundownId);
      setNotes(list);
    } catch (err) {
      console.error('[TeamNotesPanel] Błąd ładowania notatek:', err);
    } finally {
      setLoading(false);
    }
  }, [rundownId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Filtrowane notatki
  const filteredNotes = filter === 'cue' && selectedCueId
    ? notes.filter(n => n.cue_id === selectedCueId)
    : notes;

  // Liczba nierozwiązanych
  const unresolvedCount = notes.filter(n => !n.resolved).length;

  // Dodaj notatkę
  const handleAdd = useCallback(async () => {
    const content = newContent.trim();
    if (!content) return;

    // Zapisz imię autora
    localStorage.setItem('nextime_team_note_author', authorName);

    try {
      const note = await window.nextime.createTeamNote({
        rundown_id: rundownId,
        cue_id: filter === 'cue' && selectedCueId ? selectedCueId : undefined,
        author_name: authorName,
        content,
      });
      if (note) {
        setNotes(prev => [note, ...prev]);
        setNewContent('');
      }
    } catch (err) {
      console.error('[TeamNotesPanel] Błąd tworzenia notatki:', err);
    }
  }, [rundownId, newContent, authorName, filter, selectedCueId]);

  // Oznacz jako rozwiązane / otwórz ponownie
  const handleResolve = useCallback(async (id: string, resolved: boolean) => {
    try {
      const updated = await window.nextime.resolveTeamNote(id, resolved);
      if (updated) {
        setNotes(prev => prev.map(n => n.id === id ? updated : n));
      }
    } catch (err) {
      console.error('[TeamNotesPanel] Błąd zmiany statusu:', err);
    }
  }, []);

  // Usuń
  const handleDelete = useCallback(async (id: string) => {
    try {
      const deleted = await window.nextime.deleteTeamNote(id);
      if (deleted) {
        setNotes(prev => prev.filter(n => n.id !== id));
      }
    } catch (err) {
      console.error('[TeamNotesPanel] Błąd usuwania notatki:', err);
    }
  }, []);

  // Obsługa Enter w polu treści
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  }, [handleAdd]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg shadow-2xl w-[480px] max-h-[85vh] flex flex-col border border-slate-600"
        onClick={e => e.stopPropagation()}
      >
        {/* Nagłówek */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Notatki zespołu
            </h2>
            {unresolvedCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-full min-w-[18px] text-center">
                {unresolvedCount}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg">&times;</button>
        </div>

        {/* Filtry */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700/50">
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            Wszystkie ({notes.length})
          </button>
          <button
            onClick={() => setFilter('cue')}
            disabled={!selectedCueId}
            className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
              filter === 'cue'
                ? 'bg-blue-600 text-white'
                : selectedCueId
                  ? 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  : 'bg-slate-700/50 text-slate-600 cursor-not-allowed'
            }`}
          >
            Dla tego cue ({selectedCueId ? notes.filter(n => n.cue_id === selectedCueId).length : 0})
          </button>
        </div>

        {/* Lista notatek */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="text-center text-slate-500 text-sm py-8">Ładowanie…</div>
          ) : filteredNotes.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-8">
              {filter === 'cue' ? 'Brak notatek dla tego cue.' : 'Brak notatek. Dodaj pierwszą poniżej.'}
            </div>
          ) : (
            filteredNotes.map(note => (
              <TeamNoteItem
                key={note.id}
                note={note}
                onResolve={handleResolve}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>

        {/* Formularz dodawania */}
        <div className="border-t border-slate-700 p-3 space-y-2">
          {/* Autor */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider whitespace-nowrap">
              Autor:
            </label>
            <input
              type="text"
              value={authorName}
              onChange={e => setAuthorName(e.target.value)}
              className="flex-1 bg-slate-700 text-slate-200 text-xs px-2 py-1 rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
              placeholder="Twoje imię…"
            />
          </div>
          {/* Treść + przycisk */}
          <div className="flex items-end gap-2">
            <textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-slate-700 text-slate-200 text-xs px-2 py-1.5 rounded border border-slate-600 focus:border-blue-500 focus:outline-none resize-none"
              rows={2}
              placeholder="Napisz notatkę… (Enter = wyślij, Shift+Enter = nowa linia)"
            />
            <button
              onClick={handleAdd}
              disabled={!newContent.trim()}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Dodaj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
