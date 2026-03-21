import { useState, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import type { TextVariableInfo } from '@/store/playback.store';

interface TextVariablePanelProps {
  rundownId: string;
  onClose: () => void;
}

const KEY_REGEX = /^[a-z0-9-]+$/;

export function TextVariablePanel({ rundownId, onClose }: TextVariablePanelProps) {
  const textVariables = usePlaybackStore(s => s.textVariables);
  const addTextVariable = usePlaybackStore(s => s.addTextVariable);
  const updateTextVariable = usePlaybackStore(s => s.updateTextVariable);
  const removeTextVariable = usePlaybackStore(s => s.removeTextVariable);

  // Formularz dodawania
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [error, setError] = useState('');

  // Edycja inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleCreate = useCallback(async () => {
    setError('');
    const key = newKey.trim();
    if (!key) { setError('Klucz jest wymagany'); return; }
    if (!KEY_REGEX.test(key)) { setError('Klucz: tylko małe litery, cyfry i myślniki'); return; }
    if (textVariables.some(v => v.key === key)) { setError('Zmienna o tym kluczu już istnieje'); return; }

    try {
      const variable = await window.nextime.createTextVariable({
        rundown_id: rundownId,
        key,
        value: newValue,
        description: newDesc || undefined,
      });
      if (variable) {
        addTextVariable(variable as TextVariableInfo);
        setNewKey('');
        setNewValue('');
        setNewDesc('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd tworzenia zmiennej');
    }
  }, [rundownId, newKey, newValue, newDesc, textVariables, addTextVariable]);

  const handleUpdate = useCallback(async (id: string) => {
    try {
      const updated = await window.nextime.updateTextVariable(id, { value: editValue });
      if (updated) {
        updateTextVariable(id, { value: editValue });
      }
      setEditingId(null);
    } catch (err) {
      console.error('[TextVariablePanel] Błąd aktualizacji:', err);
    }
  }, [editValue, updateTextVariable]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const deleted = await window.nextime.deleteTextVariable(id);
      if (deleted) {
        removeTextVariable(id);
      }
    } catch (err) {
      console.error('[TextVariablePanel] Błąd usuwania:', err);
    }
  }, [removeTextVariable]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg shadow-2xl w-[500px] max-h-[80vh] flex flex-col border border-slate-600"
        onClick={e => e.stopPropagation()}
      >
        {/* Naglowek */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Zmienne tekstowe
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg">&times;</button>
        </div>

        {/* Lista zmiennych */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {textVariables.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-8">
              Brak zmiennych. Dodaj pierwszą poniżej.
            </div>
          ) : (
            textVariables.map(v => (
              <div
                key={v.id}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded group"
              >
                <span className="text-cyan-400 text-xs font-mono font-bold min-w-[100px] truncate">
                  ${v.key}
                </span>

                {editingId === v.id ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleUpdate(v.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={() => handleUpdate(v.id)}
                    className="flex-1 bg-slate-600 text-white text-xs px-2 py-1 rounded border border-slate-500 focus:border-blue-500 outline-none"
                    autoFocus
                  />
                ) : (
                  <span
                    className="flex-1 text-slate-300 text-xs truncate cursor-pointer hover:text-white"
                    onClick={() => { setEditingId(v.id); setEditValue(v.value); }}
                    title={`${v.description ? v.description + ' | ' : ''}Kliknij, aby edytować`}
                  >
                    {v.value || '(pusta)'}
                  </span>
                )}

                {v.description && (
                  <span className="text-slate-500 text-[10px] truncate max-w-[80px]" title={v.description}>
                    {v.description}
                  </span>
                )}

                <button
                  onClick={() => handleDelete(v.id)}
                  className="text-slate-500 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Usuń"
                >
                  &times;
                </button>
              </div>
            ))
          )}
        </div>

        {/* Formularz dodawania */}
        <div className="border-t border-slate-700 p-4 space-y-2">
          <div className="text-xs text-slate-400 font-semibold uppercase mb-2">Dodaj zmienną</div>

          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded">{error}</div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="klucz (np. host-name)"
              value={newKey}
              onChange={e => setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="flex-1 bg-slate-700 text-white text-xs px-2 py-1.5 rounded border border-slate-600 focus:border-blue-500 outline-none font-mono"
            />
            <input
              type="text"
              placeholder="wartość"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              className="flex-1 bg-slate-700 text-white text-xs px-2 py-1.5 rounded border border-slate-600 focus:border-blue-500 outline-none"
            />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="opis (opcjonalny)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              className="flex-1 bg-slate-700 text-white text-xs px-2 py-1.5 rounded border border-slate-600 focus:border-blue-500 outline-none"
            />
            <button
              onClick={handleCreate}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
            >
              Dodaj
            </button>
          </div>

          <div className="text-[10px] text-slate-500 mt-1">
            Użyj $klucz w tytułach i podtytułach cue'ów, np. <span className="text-cyan-400 font-mono">$host-name</span>
          </div>
        </div>
      </div>
    </div>
  );
}
