/**
 * Faza 33C — Dialog eksportu PDF.
 * Modal z opcjami: typ eksportu, orientacja, rozmiar, wybór kolumn.
 */

import { useState, useEffect } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import { useToastStore } from '@/components/Toast/Toast';

interface ExportPdfDialogProps {
  onClose: () => void;
}

type ExportType = 'rundown' | 'timeline';
type Orientation = 'portrait' | 'landscape';
type PageSize = 'a4' | 'a3' | 'letter';

export function ExportPdfDialog({ onClose }: ExportPdfDialogProps) {
  const columns = usePlaybackStore(s => s.columns);
  const activeRundownId = usePlaybackStore(s => s.activeRundownId);
  const activeActId = usePlaybackStore(s => s.activeActId);
  const viewMode = usePlaybackStore(s => s.viewMode);

  const [exportType, setExportType] = useState<ExportType>(viewMode === 'timeline' ? 'timeline' : 'rundown');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [selectedColumnIds, setSelectedColumnIds] = useState<Set<string>>(new Set(columns.map(c => c.id)));
  const [includeGroups, setIncludeGroups] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Aktualizuj selekcję kolumn gdy się zmienią
  useEffect(() => {
    setSelectedColumnIds(new Set(columns.map(c => c.id)));
  }, [columns]);

  const toggleColumn = (colId: string) => {
    setSelectedColumnIds(prev => {
      const next = new Set(prev);
      if (next.has(colId)) {
        next.delete(colId);
      } else {
        next.add(colId);
      }
      return next;
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      if (exportType === 'rundown') {
        if (!activeRundownId) {
          useToastStore.getState().addToast('error', 'Brak aktywnego rundownu');
          return;
        }
        const result = await window.nextime.exportRundownPdf(activeRundownId, {
          orientation,
          pageSize,
          selectedColumnIds: Array.from(selectedColumnIds),
          includeGroups,
        });
        if (result.ok && result.filePath) {
          useToastStore.getState().addToast('success', `PDF zapisany: ${result.filePath}`);
          onClose();
        } else if (result.canceled) {
          // Anulowano dialog zapisu — nic nie rób
        } else if (result.error) {
          useToastStore.getState().addToast('error', `Błąd eksportu: ${result.error}`);
        }
      } else {
        if (!activeActId) {
          useToastStore.getState().addToast('error', 'Brak aktywnego aktu — wybierz akt na osi czasu');
          return;
        }
        const result = await window.nextime.exportTimelinePdf(activeActId, {
          orientation,
          pageSize,
        });
        if (result.ok && result.filePath) {
          useToastStore.getState().addToast('success', `PDF zapisany: ${result.filePath}`);
          onClose();
        } else if (result.canceled) {
          // Anulowano
        } else if (result.error) {
          useToastStore.getState().addToast('error', `Błąd eksportu: ${result.error}`);
        }
      }
    } catch (err) {
      useToastStore.getState().addToast('error', `Błąd eksportu PDF: ${String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg shadow-xl border border-slate-600 w-[420px] max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Nagłówek */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-200">Eksportuj do PDF</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Zawartość */}
        <div className="px-4 py-3 space-y-4">
          {/* Typ eksportu */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Typ eksportu</label>
            <div className="flex gap-2">
              <button
                onClick={() => setExportType('rundown')}
                className={`flex-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                  exportType === 'rundown'
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                }`}
              >
                Przebieg (rundown)
              </button>
              <button
                onClick={() => setExportType('timeline')}
                className={`flex-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                  exportType === 'timeline'
                    ? 'bg-purple-600 text-white border-purple-500'
                    : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                }`}
                disabled={!activeActId}
                title={!activeActId ? 'Wybierz akt na osi czasu' : ''}
              >
                Shotlist (oś czasu)
              </button>
            </div>
          </div>

          {/* Orientacja */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Orientacja</label>
            <div className="flex gap-2">
              <button
                onClick={() => setOrientation('portrait')}
                className={`flex-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                  orientation === 'portrait'
                    ? 'bg-slate-600 text-white border-slate-500'
                    : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                }`}
              >
                Pionowa
              </button>
              <button
                onClick={() => setOrientation('landscape')}
                className={`flex-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                  orientation === 'landscape'
                    ? 'bg-slate-600 text-white border-slate-500'
                    : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                }`}
              >
                Pozioma
              </button>
            </div>
          </div>

          {/* Rozmiar papieru */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Rozmiar papieru</label>
            <select
              value={pageSize}
              onChange={e => setPageSize(e.target.value as PageSize)}
              className="w-full px-3 py-1.5 text-xs rounded border bg-slate-700 text-slate-200 border-slate-600 focus:outline-none focus:border-blue-500"
            >
              <option value="a4">A4 (210 × 297 mm)</option>
              <option value="a3">A3 (297 × 420 mm)</option>
              <option value="letter">Letter (216 × 279 mm)</option>
            </select>
          </div>

          {/* Grupowanie cue'ów (tylko rundown) */}
          {exportType === 'rundown' && (
            <div>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeGroups}
                  onChange={e => setIncludeGroups(e.target.checked)}
                  className="accent-blue-500"
                />
                Uwzględnij grupy cue'ów
              </label>
            </div>
          )}

          {/* Wybór kolumn (tylko rundown) */}
          {exportType === 'rundown' && columns.length > 0 && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Kolumny do eksportu ({selectedColumnIds.size} z {columns.length})
              </label>
              <div className="max-h-[120px] overflow-y-auto bg-slate-900 rounded border border-slate-700 p-2 space-y-1">
                {columns
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map(col => (
                    <label key={col.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedColumnIds.has(col.id)}
                        onChange={() => toggleColumn(col.id)}
                        className="accent-blue-500"
                      />
                      {col.name}
                    </label>
                  ))}
              </div>
            </div>
          )}

          {/* Info o braku aktu */}
          {exportType === 'timeline' && !activeActId && (
            <div className="text-xs text-amber-400 bg-amber-900/20 px-3 py-2 rounded border border-amber-700/30">
              Aby eksportować shotlist, przejdź do widoku "Oś czasu" i wybierz akt.
            </div>
          )}
        </div>

        {/* Stopka */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
          >
            Anuluj
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || (exportType === 'rundown' && !activeRundownId) || (exportType === 'timeline' && !activeActId)}
            className="px-4 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? 'Eksportuję...' : 'Eksportuj PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
