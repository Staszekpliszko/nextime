import { useCallback, useState } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import { useToast } from '@/components/Toast/Toast';
import type { RundownSummary } from '@/store/playback.store';

interface ImportExportButtonsProps {
  onImportSuccess: (rundownId: string) => void;
}

export function ImportExportButtons({ onImportSuccess }: ImportExportButtonsProps) {
  const activeRundownId = usePlaybackStore(s => s.activeRundownId);
  const rundowns = usePlaybackStore(s => s.rundowns);
  const setRundowns = usePlaybackStore(s => s.setRundowns);
  const addToast = useToast();

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  // ── Eksport ─────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!activeRundownId) return;
    setExporting(true);
    try {
      const result = await window.nextime.exportRundown(activeRundownId);
      if (result.ok) {
        addToast('success', `Rundown wyeksportowany do: ${result.filePath ?? 'plik'}`);
      } else if (!result.canceled) {
        addToast('error', result.error ?? 'Błąd eksportu');
      }
    } catch (err) {
      addToast('error', 'Nieoczekiwany błąd eksportu');
      console.error('[ImportExport] Błąd eksportu:', err);
    } finally {
      setExporting(false);
    }
  }, [activeRundownId, addToast]);

  // ── Import ──────────────────────────────────────────
  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      const result = await window.nextime.importRundown();
      if (result.ok && result.rundownId) {
        // Odśwież listę rundownów
        const updatedList = await window.nextime.getRundowns();
        setRundowns(updatedList);
        addToast('success', 'Rundown zaimportowany pomyślnie');
        onImportSuccess(result.rundownId);
      } else if (!result.canceled) {
        addToast('error', result.error ?? 'Błąd importu');
      }
    } catch (err) {
      addToast('error', 'Nieoczekiwany błąd importu');
      console.error('[ImportExport] Błąd importu:', err);
    } finally {
      setImporting(false);
    }
  }, [setRundowns, addToast, onImportSuccess]);

  return (
    <div className="px-3 py-2 border-t border-slate-700 flex gap-2">
      <button
        onClick={handleExport}
        disabled={!activeRundownId || exporting}
        className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-300 text-xs py-1.5 rounded transition-colors"
        title={activeRundownId ? 'Eksportuj wybrany rundown' : 'Wybierz rundown do eksportu'}
      >
        <span className="text-sm">&#8595;</span>
        {exporting ? 'Eksport...' : 'Eksportuj'}
      </button>
      <button
        onClick={handleImport}
        disabled={importing}
        className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-300 text-xs py-1.5 rounded transition-colors"
        title="Importuj rundown z pliku"
      >
        <span className="text-sm">&#8593;</span>
        {importing ? 'Import...' : 'Importuj'}
      </button>
    </div>
  );
}
