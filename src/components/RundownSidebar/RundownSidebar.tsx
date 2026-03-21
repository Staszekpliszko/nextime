import { useState, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import type { RundownSummary } from '@/store/playback.store';

interface RundownSidebarProps {
  onRundownSelect: (rundownId: string) => void;
}

export function RundownSidebar({ onRundownSelect }: RundownSidebarProps) {
  const rundowns = usePlaybackStore(s => s.rundowns);
  const activeRundownId = usePlaybackStore(s => s.activeRundownId);
  const setRundowns = usePlaybackStore(s => s.setRundowns);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRundownName, setNewRundownName] = useState('');
  const [creating, setCreating] = useState(false);

  // Tworzenie nowego rundownu
  const handleCreate = useCallback(async () => {
    if (!newRundownName.trim()) return;

    setCreating(true);
    try {
      // Pobierz projekty — użyj pierwszego jako domyślny
      const projects = await window.nextime.getProjects();
      if (projects.length === 0) {
        console.error('[RundownSidebar] Brak projektów w bazie');
        return;
      }

      const newRundown = await window.nextime.createRundown({
        project_id: projects[0]!.id,
        name: newRundownName.trim(),
      });

      if (newRundown) {
        const summary: RundownSummary = {
          id: newRundown.id,
          name: newRundown.name,
          status: newRundown.status,
          show_date: newRundown.show_date,
          show_time: newRundown.show_time,
        };
        setRundowns([...rundowns, summary]);
        setNewRundownName('');
        setShowCreateForm(false);
        onRundownSelect(newRundown.id);
      }
    } catch (err) {
      console.error('[RundownSidebar] Błąd tworzenia rundownu:', err);
    } finally {
      setCreating(false);
    }
  }, [newRundownName, rundowns, setRundowns, onRundownSelect]);

  // Usuwanie rundownu
  const handleDelete = useCallback(async (rundown: RundownSummary) => {
    const confirmed = window.confirm(`Usunąć rundown "${rundown.name}"? Wszystkie cue'y zostaną usunięte.`);
    if (!confirmed) return;

    try {
      const deleted = await window.nextime.deleteRundown(rundown.id);
      if (deleted) {
        const remaining = rundowns.filter(r => r.id !== rundown.id);
        setRundowns(remaining);

        // Jeśli usunięto aktywny — przełącz na pierwszy dostępny
        if (activeRundownId === rundown.id && remaining.length > 0) {
          onRundownSelect(remaining[0]!.id);
        }
      }
    } catch (err) {
      console.error('[RundownSidebar] Błąd usuwania:', err);
    }
  }, [rundowns, activeRundownId, setRundowns, onRundownSelect]);

  return (
    <div className="w-60 bg-slate-800 border-r border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-200">Rundowny</h3>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="text-slate-400 hover:text-slate-200 text-lg leading-none"
          title="Nowy rundown"
        >
          +
        </button>
      </div>

      {/* Formularz tworzenia */}
      {showCreateForm && (
        <div className="px-3 py-2 border-b border-slate-700 space-y-2">
          <input
            type="text"
            value={newRundownName}
            onChange={e => setNewRundownName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            placeholder="Nazwa rundownu"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newRundownName.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-xs py-1 rounded"
            >
              {creating ? '...' : 'Utwórz'}
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setNewRundownName(''); }}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-1 rounded"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* Lista rundownów */}
      <div className="flex-1 overflow-y-auto">
        {rundowns.length === 0 ? (
          <div className="px-4 py-6 text-center text-slate-500 text-xs">
            Brak rundownów
          </div>
        ) : (
          rundowns.map(rd => {
            const isActive = activeRundownId === rd.id;
            return (
              <div
                key={rd.id}
                className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors border-b border-slate-700/50 ${
                  isActive
                    ? 'bg-blue-900/30 text-blue-300'
                    : 'text-slate-300 hover:bg-slate-700/50'
                }`}
                onClick={() => onRundownSelect(rd.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {isActive && <span className="inline-block w-1.5 h-3 bg-blue-400 rounded-sm mr-2" />}
                    {rd.name}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {rd.status}
                    {rd.show_date && ` · ${rd.show_date}`}
                  </div>
                </div>

                {/* Przycisk usuwania — widoczny tylko on hover */}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(rd); }}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 text-xs ml-2 transition-opacity"
                  title="Usuń rundown"
                >
                  &times;
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
