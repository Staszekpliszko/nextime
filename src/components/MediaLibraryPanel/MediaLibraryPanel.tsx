import { useState, useEffect, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import { useToastStore } from '@/components/Toast/Toast';
import type { MediaFile } from '../../../electron/db/repositories/media-file.repo';

interface MediaLibraryPanelProps {
  onClose: () => void;
}

/** Konwertuje duration_frames na czytelny format MM:SS (przy założeniu fps z probe) */
function formatDuration(durationFrames: number, fps: number = 25): string {
  if (durationFrames <= 0 || fps <= 0) return '—';
  const totalSeconds = Math.round(durationFrames / fps);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Próbuje automatycznie wykryć typ media na podstawie rozszerzenia */
function detectMediaType(fileName: string): 'audio' | 'video' {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];
  return audioExts.includes(ext) ? 'audio' : 'video';
}

export function MediaLibraryPanel({ onClose }: MediaLibraryPanelProps) {
  const activeActId = usePlaybackStore(s => s.activeActId);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [probing, setProbing] = useState(false);
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

  // Dodaj plik przez Electron dialog + automatyczny probe ffprobe
  const handleAddFile = useCallback(async () => {
    if (!activeActId) return;

    try {
      // Otwórz natywny dialog Electron
      const selected = await window.nextime.selectMediaFile();
      if (!selected) return; // anulowano

      const { filePath, fileName } = selected;
      const mediaType = detectMediaType(fileName);

      setProbing(true);

      // Utwórz rekord w DB (na razie z duration 0)
      const created = await window.nextime.createMediaFile({
        act_id: activeActId,
        file_name: fileName,
        file_path: filePath,
        media_type: mediaType,
        duration_frames: 0,
      });

      // Automatyczny probe — wykryj duration i waveform
      const probeResult = await window.nextime.probeMediaFile(filePath);
      if (probeResult && created) {
        // Wykryj typ na podstawie probe (nadpisz jeśli się różni)
        const detectedType: 'audio' | 'video' = probeResult.hasVideo ? 'video' : 'audio';
        if (detectedType !== mediaType) {
          // Aktualizacja typu nie jest krytyczna — zostawiamy oryginalny
          console.log(`[MediaLibraryPanel] Wykryto typ: ${detectedType} (oryginalny: ${mediaType})`);
        }

        // Generuj waveform (tylko jeśli jest audio)
        let waveformData: number[] | undefined;
        if (probeResult.hasAudio) {
          waveformData = await window.nextime.generateWaveform(filePath, 200);
          if (waveformData.length === 0) waveformData = undefined;
        }

        // Aktualizuj duration i waveform w DB
        await window.nextime.updateMediaFileDuration(
          created.id,
          probeResult.durationFrames,
          waveformData,
        );
      }

      setProbing(false);
      await loadFiles();

      // Toast z potwierdzeniem
      const durationInfo = probeResult
        ? ` (${formatDuration(probeResult.durationFrames, probeResult.fps || 25)})`
        : '';
      useToastStore.getState().addToast('success', `Dodano: ${fileName}${durationInfo}`);
    } catch (err) {
      setProbing(false);
      console.error('[MediaLibraryPanel] Błąd dodawania:', err);
      useToastStore.getState().addToast('error', 'Błąd dodawania pliku media');
    }
  }, [activeActId, loadFiles]);

  // Usuń plik
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Usunąć ten plik media?')) return;
    try {
      await window.nextime.deleteMediaFile(id);
      await loadFiles();
      useToastStore.getState().addToast('info', 'Plik media usunięty');
    } catch (err) {
      console.error('[MediaLibraryPanel] Błąd usuwania:', err);
      useToastStore.getState().addToast('error', 'Błąd usuwania pliku media');
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
          <h2 className="text-sm font-bold text-slate-200">Biblioteka mediów</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none">&times;</button>
        </div>

        {/* Status */}
        {mediaStatus.playing && (
          <div className="px-4 py-2 bg-emerald-900/30 border-b border-emerald-800/50 text-xs text-emerald-400">
            Odtwarzanie: {mediaStatus.currentFile ?? '—'} | Vol: {mediaStatus.volume}%
          </div>
        )}

        {/* Wskaźnik analizy ffprobe */}
        {probing && (
          <div className="px-4 py-2 bg-blue-900/30 border-b border-blue-800/50 text-xs text-blue-400">
            Analizuję plik (ffprobe)...
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

              {/* Duration */}
              <span className="text-xs text-slate-400 font-mono shrink-0">
                {formatDuration(file.duration_frames)}
              </span>

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
            disabled={!activeActId || probing}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {probing ? 'Analizuję...' : '+ Dodaj plik'}
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
