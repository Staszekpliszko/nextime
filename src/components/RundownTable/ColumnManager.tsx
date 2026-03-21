import { useState, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import type { ColumnInfo } from '@/store/playback.store';

interface ColumnManagerProps {
  rundownId: string;
  onClose: () => void;
}

type ColumnType = 'richtext' | 'dropdown' | 'script';

interface ColumnFormData {
  name: string;
  type: ColumnType;
  width_px: number;
  dropdown_options: string;
  is_script: boolean;
}

const DEFAULT_FORM: ColumnFormData = {
  name: '',
  type: 'richtext',
  width_px: 200,
  dropdown_options: '',
  is_script: false,
};

/**
 * Dialog zarządzania kolumnami rundownu.
 * Dodawanie, edycja, usuwanie kolumn.
 */
export function ColumnManager({ rundownId, onClose }: ColumnManagerProps) {
  const columns = usePlaybackStore(s => s.columns);
  const setColumns = usePlaybackStore(s => s.setColumns);
  const addColumn = usePlaybackStore(s => s.addColumn);
  const removeColumn = usePlaybackStore(s => s.removeColumn);
  const updateColumnInStore = usePlaybackStore(s => s.updateColumnInStore);
  const hiddenColumnIds = usePlaybackStore(s => s.hiddenColumnIds);
  const toggleColumnVisibility = usePlaybackStore(s => s.toggleColumnVisibility);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ColumnFormData>(DEFAULT_FORM);
  const [isAdding, setIsAdding] = useState(false);

  // Rozpocznij edycję istniejącej kolumny
  const startEdit = useCallback((col: ColumnInfo) => {
    setEditingId(col.id);
    setForm({
      name: col.name,
      type: col.type,
      width_px: col.width_px,
      dropdown_options: col.dropdown_options?.join('\n') ?? '',
      is_script: col.is_script,
    });
    setIsAdding(false);
  }, []);

  // Rozpocznij dodawanie nowej kolumny
  const startAdd = useCallback(() => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setIsAdding(true);
  }, []);

  // Zapisz (dodaj lub edytuj)
  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return;

    const dropdownOpts = form.type === 'dropdown'
      ? form.dropdown_options.split('\n').map(o => o.trim()).filter(Boolean)
      : undefined;

    if (isAdding) {
      // Nowa kolumna
      try {
        const created = await window.nextime.createColumn({
          rundown_id: rundownId,
          name: form.name.trim(),
          type: form.type,
          sort_order: columns.length,
          width_px: form.width_px,
          dropdown_options: dropdownOpts,
          is_script: form.is_script,
        });
        if (created) {
          addColumn({
            id: created.id,
            rundown_id: created.rundown_id,
            name: created.name,
            type: created.type,
            sort_order: created.sort_order,
            width_px: created.width_px,
            dropdown_options: created.dropdown_options,
            is_script: created.is_script,
          });
        }
      } catch (err) {
        console.error('[ColumnManager] Błąd tworzenia kolumny:', err);
      }
    } else if (editingId) {
      // Edycja istniejącej
      try {
        const updated = await window.nextime.updateColumn(editingId, {
          name: form.name.trim(),
          type: form.type,
          width_px: form.width_px,
          dropdown_options: dropdownOpts,
          is_script: form.is_script,
        });
        if (updated) {
          updateColumnInStore(editingId, {
            name: updated.name,
            type: updated.type,
            width_px: updated.width_px,
            dropdown_options: updated.dropdown_options,
            is_script: updated.is_script,
          });
        }
      } catch (err) {
        console.error('[ColumnManager] Błąd aktualizacji kolumny:', err);
      }
    }

    setIsAdding(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
  }, [form, isAdding, editingId, rundownId, columns.length, addColumn, updateColumnInStore]);

  // Usuń kolumnę
  const handleDelete = useCallback(async (id: string) => {
    try {
      const deleted = await window.nextime.deleteColumn(id);
      if (deleted) {
        removeColumn(id);
      }
    } catch (err) {
      console.error('[ColumnManager] Błąd usuwania kolumny:', err);
    }
  }, [removeColumn]);

  // Zmiana kolejności — przesuń w górę/dół
  const handleMove = useCallback(async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= columns.length) return;

    const newColumns = [...columns];
    const [moved] = newColumns.splice(index, 1);
    newColumns.splice(newIndex, 0, moved!);
    const reordered = newColumns.map((c, i) => ({ ...c, sort_order: i }));
    setColumns(reordered);

    try {
      await window.nextime.reorderColumns(rundownId, reordered.map(c => c.id));
    } catch (err) {
      console.error('[ColumnManager] Błąd reorderu:', err);
    }
  }, [columns, rundownId, setColumns]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg shadow-xl border border-slate-700 w-[520px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Nagłówek */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-bold text-slate-200">Zarządzaj kolumnami</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg">&times;</button>
        </div>

        {/* Lista kolumn */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {columns.length === 0 && (
            <p className="text-sm text-slate-500 py-4 text-center">Brak kolumn — dodaj pierwszą</p>
          )}
          {columns.map((col, i) => (
            <div
              key={col.id}
              className={`flex items-center gap-2 py-2 border-b border-slate-700/50 ${
                editingId === col.id ? 'bg-slate-700/30 rounded px-2 -mx-2' : ''
              }`}
            >
              {/* Przyciski góra/dół */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => handleMove(i, -1)}
                  disabled={i === 0}
                  className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-30 leading-none"
                >&#9650;</button>
                <button
                  onClick={() => handleMove(i, 1)}
                  disabled={i === columns.length - 1}
                  className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-30 leading-none"
                >&#9660;</button>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-200 truncate">{col.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                    {col.type === 'richtext' ? 'Tekst' : col.type === 'dropdown' ? 'Wybór' : 'Skrypt'}
                  </span>
                  {col.is_script && <span className="text-xs" title="Kolumna skryptu (prompter)">&#127908;</span>}
                </div>
              </div>

              {/* Widoczność (Faza 13) */}
              <label className="flex items-center gap-1 cursor-pointer" title={hiddenColumnIds.has(col.id) ? 'Kolumna ukryta' : 'Kolumna widoczna'}>
                <input
                  type="checkbox"
                  checked={!hiddenColumnIds.has(col.id)}
                  onChange={async () => {
                    const newHidden = !hiddenColumnIds.has(col.id);
                    toggleColumnVisibility(col.id);
                    try {
                      await window.nextime.setColumnVisibility(col.id, newHidden);
                    } catch (err) {
                      console.error('[ColumnManager] Błąd widoczności:', err);
                      // Cofnij w razie błędu
                      toggleColumnVisibility(col.id);
                    }
                  }}
                  className="accent-blue-500"
                />
                <span className="text-[10px] text-slate-400">Widoczna</span>
              </label>

              {/* Przyciski akcji */}
              <button
                onClick={() => startEdit(col)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >Edytuj</button>
              <button
                onClick={() => handleDelete(col.id)}
                className="text-xs text-red-400 hover:text-red-300"
              >Usuń</button>
            </div>
          ))}
        </div>

        {/* Formularz dodawania/edycji */}
        {(isAdding || editingId) && (
          <div className="px-4 py-3 border-t border-slate-700 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nazwa kolumny"
                className="flex-1 px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200 focus:border-blue-500 outline-none"
                autoFocus
              />
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as ColumnType }))}
                className="px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200"
              >
                <option value="richtext">Tekst</option>
                <option value="dropdown">Wybór (lista)</option>
                <option value="script">Skrypt</option>
              </select>
            </div>

            <div className="flex gap-2 items-center">
              <label className="text-xs text-slate-400">Szerokość (px):</label>
              <input
                type="number"
                value={form.width_px}
                onChange={e => setForm(f => ({ ...f, width_px: Number(e.target.value) || 200 }))}
                min={80}
                max={600}
                className="w-20 px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200"
              />
              <label className="flex items-center gap-1 text-xs text-slate-400 ml-2">
                <input
                  type="checkbox"
                  checked={form.is_script}
                  onChange={e => setForm(f => ({ ...f, is_script: e.target.checked }))}
                  className="accent-cyan-500"
                />
                Prompter
              </label>
            </div>

            {form.type === 'dropdown' && (
              <div>
                <label className="text-xs text-slate-400">Opcje (jedna na linię):</label>
                <textarea
                  value={form.dropdown_options}
                  onChange={e => setForm(f => ({ ...f, dropdown_options: e.target.value }))}
                  rows={3}
                  className="w-full px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200 mt-1"
                />
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setIsAdding(false); setEditingId(null); setForm(DEFAULT_FORM); }}
                className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
              >Anuluj</button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim()}
                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
              >{isAdding ? 'Dodaj' : 'Zapisz'}</button>
            </div>
          </div>
        )}

        {/* Przycisk dodaj */}
        {!isAdding && !editingId && (
          <div className="px-4 py-3 border-t border-slate-700">
            <button
              onClick={startAdd}
              className="w-full py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700 rounded transition-colors"
            >+ Dodaj kolumnę</button>
          </div>
        )}
      </div>
    </div>
  );
}
