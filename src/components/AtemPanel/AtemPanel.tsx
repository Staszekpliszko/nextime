import { useState, useEffect, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';

interface AtemPanelProps {
  onClose: () => void;
}

/** Panel konfiguracji ATEM — IP, ME, auto-switch, manual cut/preview */
export function AtemPanel({ onClose }: AtemPanelProps) {
  const atemConnected = usePlaybackStore(s => s.atemConnected);
  const atemProgramInput = usePlaybackStore(s => s.atemProgramInput);
  const atemPreviewInput = usePlaybackStore(s => s.atemPreviewInput);
  const atemModelName = usePlaybackStore(s => s.atemModelName);

  const [ip, setIp] = useState('192.168.10.240');
  const [meIndex, setMeIndex] = useState(0);
  const [autoSwitch, setAutoSwitch] = useState(true);
  const [transitionType, setTransitionType] = useState<'cut' | 'mix'>('cut');
  const [saved, setSaved] = useState(false);

  // Załaduj aktualny config z main process
  useEffect(() => {
    window.nextime.atemGetStatus().then((status) => {
      setIp(status.ip);
      setMeIndex(status.meIndex);
      setAutoSwitch(status.autoSwitch);
    });
  }, []);

  const handleConnect = useCallback(async () => {
    await window.nextime.atemConfigure({ ip, meIndex, autoSwitch, transitionType });
    await window.nextime.atemConnect();
  }, [ip, meIndex, autoSwitch, transitionType]);

  const handleDisconnect = useCallback(async () => {
    await window.nextime.atemDisconnect();
  }, []);

  const handleSave = useCallback(async () => {
    await window.nextime.atemConfigure({ ip, meIndex, autoSwitch, transitionType });
    usePlaybackStore.getState().setAtemAutoSwitch(autoSwitch);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [ip, meIndex, autoSwitch, transitionType]);

  const handleManualCut = useCallback(async (input: number) => {
    await window.nextime.atemCut(input);
  }, []);

  const handleManualPreview = useCallback(async (input: number) => {
    await window.nextime.atemPreview(input);
  }, []);

  // Zamknij na Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-200">ATEM Switcher</h3>
            <div
              className={`w-2 h-2 rounded-full ${atemConnected ? 'bg-green-400' : 'bg-red-500'}`}
            />
            <span className="text-[10px] text-slate-400">
              {atemConnected ? atemModelName ?? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">&times;</button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4">
          {/* Status programu/podglądu */}
          {atemConnected && (
            <div className="flex gap-4 bg-slate-900 rounded p-3">
              <div className="flex-1 text-center">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Program</div>
                <div className="text-2xl font-bold text-red-400 font-mono">
                  {atemProgramInput ?? '—'}
                </div>
              </div>
              <div className="w-px bg-slate-700" />
              <div className="flex-1 text-center">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Preview</div>
                <div className="text-2xl font-bold text-green-400 font-mono">
                  {atemPreviewInput ?? '—'}
                </div>
              </div>
            </div>
          )}

          {/* Konfiguracja */}
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 block mb-0.5">IP Address</label>
                <input
                  value={ip}
                  onChange={e => setIp(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                  placeholder="192.168.10.240"
                />
              </div>
              <div className="w-24">
                <label className="text-[10px] text-slate-500 block mb-0.5">ME Bus</label>
                <select
                  value={meIndex}
                  onChange={e => setMeIndex(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  {[0, 1, 2, 3].map(n => (
                    <option key={n} value={n}>ME {n + 1}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 block mb-0.5">Transition</label>
                <select
                  value={transitionType}
                  onChange={e => setTransitionType(e.target.value as 'cut' | 'mix')}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="cut">Cut</option>
                  <option value="mix">Mix (Auto)</option>
                </select>
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoSwitch}
                    onChange={e => setAutoSwitch(e.target.checked)}
                    className="rounded"
                  />
                  Auto-switch
                </label>
              </div>
            </div>
          </div>

          {/* Przyciski połączenia */}
          <div className="flex gap-2">
            {atemConnected ? (
              <button
                onClick={handleDisconnect}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-1.5 rounded font-medium"
              >
                Rozłącz
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-1.5 rounded font-medium"
              >
                Połącz
              </button>
            )}
            <button
              onClick={handleSave}
              className={`flex-1 text-white text-xs py-1.5 rounded font-medium transition-colors ${
                saved ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {saved ? 'Zapisano!' : 'Zapisz'}
            </button>
          </div>

          {/* Manual override — siatka kamer */}
          {atemConnected && (
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-2">Manual Override</div>
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
                  <div key={n} className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleManualCut(n)}
                      className={`px-2 py-1.5 rounded text-[10px] font-bold transition-colors ${
                        atemProgramInput === n
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      PGM {n}
                    </button>
                    <button
                      onClick={() => handleManualPreview(n)}
                      className={`px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                        atemPreviewInput === n
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      PVW {n}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
