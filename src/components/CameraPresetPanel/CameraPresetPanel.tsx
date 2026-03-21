import { useState, useEffect, useCallback } from 'react';
import type { CameraPreset, CreateCameraPresetInput } from '../../../electron/db/repositories/camera-preset.repo';

interface CameraPresetPanelProps {
  projectId: string;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#2196F3', '#4CAF50', '#FF9800', '#E91E63',
  '#9C27B0', '#00BCD4', '#FF5722', '#607D8B',
  '#8BC34A', '#3F51B5', '#FFEB3B', '#795548',
  '#009688', '#F44336', '#CDDC39', '#9E9E9E',
];

const CHANNELS = ['PGM', 'ME1', 'ME2', 'AUX1', 'AUX2', 'AUX3'] as const;

export function CameraPresetPanel({ projectId, onClose }: CameraPresetPanelProps) {
  const [presets, setPresets] = useState<CameraPreset[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('#2196F3');
  const [editChannel, setEditChannel] = useState('PGM');
  const [editOperator, setEditOperator] = useState('');

  // Załaduj presety
  const loadPresets = useCallback(async () => {
    try {
      const list = await window.nextime.getCameraPresets(projectId);
      setPresets(list);
    } catch (err) {
      console.error('[CameraPresetPanel] Błąd ładowania:', err);
    }
  }, [projectId]);

  useEffect(() => { loadPresets(); }, [loadPresets]);

  // Dodaj preset
  const handleAdd = useCallback(async () => {
    const usedNumbers = new Set(presets.map(p => p.number));
    let nextNum = 1;
    while (usedNumbers.has(nextNum) && nextNum <= 16) nextNum++;
    if (nextNum > 16) return; // Maks 16 kamer

    const input: CreateCameraPresetInput = {
      project_id: projectId,
      number: nextNum,
      label: `Cam ${nextNum}`,
      color: PRESET_COLORS[(nextNum - 1) % PRESET_COLORS.length],
      default_channel: 'PGM',
    };

    try {
      await window.nextime.createCameraPreset(input);
      await loadPresets();
    } catch (err) {
      console.error('[CameraPresetPanel] Błąd tworzenia:', err);
    }
  }, [projectId, presets, loadPresets]);

  // Rozpocznij edycję
  const startEdit = useCallback((preset: CameraPreset) => {
    setEditingId(preset.id);
    setEditLabel(preset.label);
    setEditColor(preset.color);
    setEditChannel(preset.default_channel);
    setEditOperator(preset.operator_name ?? '');
  }, []);

  // Zapisz edycję
  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    try {
      await window.nextime.updateCameraPreset(editingId, {
        label: editLabel,
        color: editColor,
        default_channel: editChannel,
        operator_name: editOperator || undefined,
      });
      setEditingId(null);
      await loadPresets();
    } catch (err) {
      console.error('[CameraPresetPanel] Błąd zapisu:', err);
    }
  }, [editingId, editLabel, editColor, editChannel, editOperator, loadPresets]);

  // Usuń preset
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Usunąć tę kamerę?')) return;
    try {
      await window.nextime.deleteCameraPreset(id);
      if (editingId === id) setEditingId(null);
      await loadPresets();
    } catch (err) {
      console.error('[CameraPresetPanel] Błąd usuwania:', err);
    }
  }, [editingId, loadPresets]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg shadow-xl border border-slate-700 w-[600px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-bold text-slate-200">Kamery — Camera Presets</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none">&times;</button>
        </div>

        {/* Lista presetów */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {presets.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-8">
              Brak kamer — kliknij &quot;Dodaj kamerę&quot;
            </div>
          )}

          {presets.map(preset => (
            <div key={preset.id} className="flex items-center gap-3 bg-slate-750 rounded px-3 py-2 border border-slate-700">
              {/* Numer kamery + kolor */}
              <div
                className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: preset.color }}
              >
                {preset.number}
              </div>

              {editingId === preset.id ? (
                /* Tryb edycji */
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200"
                    placeholder="Label"
                  />
                  <input
                    value={editOperator}
                    onChange={e => setEditOperator(e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200"
                    placeholder="Operator"
                  />
                  <select
                    value={editChannel}
                    onChange={e => setEditChannel(e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200"
                  >
                    {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                  </select>
                  <div className="flex gap-1">
                    {PRESET_COLORS.slice(0, 8).map(c => (
                      <button
                        key={c}
                        onClick={() => setEditColor(c)}
                        className={`w-5 h-5 rounded border-2 ${editColor === c ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="col-span-2 flex gap-2 justify-end">
                    <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200">Anuluj</button>
                    <button onClick={saveEdit} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500">Zapisz</button>
                  </div>
                </div>
              ) : (
                /* Tryb widoku */
                <>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">{preset.label || `Cam ${preset.number}`}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {preset.default_channel}{preset.operator_name ? ` — ${preset.operator_name}` : ''}
                    </div>
                  </div>
                  <button onClick={() => startEdit(preset)} className="text-xs text-slate-400 hover:text-blue-400 px-2">Edytuj</button>
                  <button onClick={() => handleDelete(preset.id)} className="text-xs text-slate-400 hover:text-red-400 px-1">&times;</button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700 flex justify-between">
          <button
            onClick={handleAdd}
            disabled={presets.length >= 16}
            className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Dodaj kamerę
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
