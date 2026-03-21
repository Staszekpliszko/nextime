import { useState, useEffect, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import type { MediaFile } from '../../../electron/db/repositories/media-file.repo';

interface MediaLibraryPanelProps {
  onClose: () => void;
}

export function MediaLibraryPanel({ onClose }: MediaLibraryPanelProps) {
  const activeActId = usePlaybackStore(s => s.activeActId);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [mediaStatus, setMediaStatus] = useState<{ playing: boolean; currentFile: string | null; volume: number }>({
    playing: false, currentFile: null, volume: 100,
  });

  // Załaduj pliki media dla aktywnego aktu
  const loadFiles = useCallback(async () => {
    if (!activeActId) return;
    try {
      const list = await window.nextime.getMediaFiles(activeActId);
      setFiles(list);
    } catch (err) {
      console.error('[MediaLibraryPanel] Błąd ładowania:', err);
    }
  }, [activeActId]);

  const loadStatus = useCallback(async () => {
    try {
      const status = await window.nextime.getMediaStatus();
      setMediaStatus(status);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { loadFiles(); loadStatus(); }, [loadFiles, loadStatus]);

  // Dodaj plik (przez input file dialog — w Electron preload nie mamy dialog, więc używamy ręcznego input)
  const handleAddFile = useCallback(async () => {
    if (!activeActId) return;

    // Używamy standardowego file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,video/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        await window.nextime.createMediaFile({
          act_id: activeActId,
          file_name: file.name,
          file_path: file.path || file.name, // Electron udostępnia file.path
          media_type: file.type.startsWith('video') ? 'video' : 'audio',
          duration_frames: 0, // Placeholder — prawdziwa detekcja wymaga ffprobe
        });
        await loadFiles();
      } catch (err) {
        console.error('[MediaLibraryPanel] Błąd dodawania:', err);
      }
    };
    input.click();
  }, [activeActId, loadFiles]);

  // Usuń plik
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Usunąć ten plik media?')) return;
    try {
      await window.nextime.deleteMediaFile(id);
      await loadFiles();
    } catch (err) {
      console.error('[MediaLibraryPanel] Błąd usuwania:', err);
    }
  }, [loadFiles]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg shadow-xl border border-slate-700 w-[500px] max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-bold text-slate-200">Media Library</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none">&times;</button>
        </div>

        {/* Status */}
        {mediaStatus.playing && (
          <div className="px-4 py-2 bg-emerald-900/30 border-b border-emerald-800/50 text-xs text-emerald-400">
            Odtwarzanie: {mediaStatus.currentFile ?? '—'} | Vol: {mediaStatus.volume}%
          </div>
        )}

        {/* Lista plików */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {!activeActId && (
            <div className="text-center text-slate-500 text-sm py-8">
              Wybierz akt w Timeline, żeby zobaczyć pliki media
            </div>
          )}
          {activeActId && files.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-8">
              Brak plików media — kliknij &quot;Dodaj plik&quot;
            </div>
          )}

          {files.map(file => (
            <div key={file.id} className="flex items-center gap-3 bg-slate-750 rounded px-3 py-2 border border-slate-700">
              {/* Ikona typu */}
              <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold shrink-0 ${
                file.media_type === 'audio' ? 'bg-blue-600/20 text-blue-400' : 'bg-purple-600/20 text-purple-400'
              }`}>
                {file.media_type === 'audio' ? '♪' : '▶'}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-200 truncate">{file.file_name}</div>
                <div className="text-xs text-slate-500 truncate">{file.file_path}</div>
              </div>

              {/* Typ badge */}
              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${
                file.media_type === 'audio' ? 'bg-blue-600/20 text-blue-400' : 'bg-purple-600/20 text-purple-400'
              }`}>
                {file.media_type}
              </span>

              {/* Usuń */}
              <button
                onClick={() => handleDelete(file.id)}
                className="text-xs text-slate-400 hover:text-red-400 px-1"
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700 flex justify-between">
          <button
            onClick={handleAddFile}
            disabled={!activeActId}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Dodaj plik
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
