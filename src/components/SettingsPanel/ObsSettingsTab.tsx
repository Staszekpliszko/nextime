import { useState, useEffect, useCallback } from 'react';
import type { ObsSettings } from '../../../electron/settings-manager';
import type { ObsStatus } from '../../../electron/senders/obs-sender';

// ── Typy ────────────────────────────────────────────────

interface ObsSettingsTabProps {
  settings: ObsSettings;
  onSave: (values: Partial<ObsSettings>) => void;
}

// ── Komponent ───────────────────────────────────────────

export function ObsSettingsTab({ settings, onSave }: ObsSettingsTabProps) {
  const [ip, setIp] = useState(settings.ip);
  const [port, setPort] = useState(settings.port);
  const [password, setPassword] = useState(settings.password);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [autoSwitch, setAutoSwitch] = useState(settings.autoSwitch);
  const [sceneMap, setSceneMap] = useState<Record<number, string>>({ ...settings.sceneMap });
  const [status, setStatus] = useState<ObsStatus | null>(null);
  const [scenes, setScenes] = useState<string[]>([]);
  const [connectMsg, setConnectMsg] = useState<string | null>(null);

  // Polling statusu OBS co 2s
  useEffect(() => {
    const refresh = () => {
      window.nextime.obsGetStatus()
        .then(s => {
          const obsStatus = s as ObsStatus;
          setStatus(obsStatus);
          if (obsStatus.scenes.length > 0) {
            setScenes(obsStatus.scenes);
          }
        })
        .catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = useCallback(() => {
    onSave({ ip, port, password, enabled, autoSwitch, sceneMap });
  }, [ip, port, password, enabled, autoSwitch, sceneMap, onSave]);

  const handleConnect = async () => {
    setConnectMsg(null);
    try {
      // Zapisz aktualne ustawienia przed połączeniem
      await window.nextime.updateSettings('obs', { ip, port, password, enabled: true, autoSwitch, sceneMap });
      const result = await window.nextime.obsConnect();
      if (result.ok) {
        setConnectMsg('Połączono');
        setEnabled(true);
        // Odśwież sceny po połączeniu
        setTimeout(async () => {
          const refreshed = await window.nextime.obsRefreshScenes();
          setScenes(refreshed);
        }, 500);
      } else {
        setConnectMsg(`Błąd: ${result.error ?? 'nieznany'}`);
      }
    } catch (err) {
      setConnectMsg(`Błąd: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.nextime.obsDisconnect();
      setConnectMsg('Rozłączono');
      setScenes([]);
    } catch (err) {
      setConnectMsg(`Błąd: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRefreshScenes = async () => {
    try {
      const refreshed = await window.nextime.obsRefreshScenes();
      setScenes(refreshed);
    } catch {
      // Ignoruj — prawdopodobnie nie połączony
    }
  };

  // Aktualizacja mappingu camera_number → scena
  const updateSceneMapping = (camNum: number, sceneName: string) => {
    setSceneMap(prev => {
      const next = { ...prev };
      if (sceneName === '') {
        delete next[camNum];
      } else {
        next[camNum] = sceneName;
      }
      return next;
    });
  };

  // Dodaj nowy mapping (następny wolny numer)
  const addMapping = () => {
    const existing = Object.keys(sceneMap).map(Number);
    const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    setSceneMap(prev => ({ ...prev, [nextNum]: '' }));
  };

  // Usuń mapping
  const removeMapping = (camNum: number) => {
    setSceneMap(prev => {
      const next = { ...prev };
      delete next[camNum];
      return next;
    });
  };

  const isConnected = status?.connected ?? false;

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-300 mb-3">OBS Studio (WebSocket)</h3>

      {/* Aktywny */}
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-slate-400 w-[140px] flex-shrink-0">Aktywny</label>
        <div className="flex-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setEnabled(!enabled)}
              className={`w-10 h-5 rounded-full transition-colors relative ${enabled ? 'bg-blue-600' : 'bg-slate-600'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-slate-300">{enabled ? 'Włączony' : 'Wyłączony'}</span>
          </label>
        </div>
      </div>

      {/* Adres IP */}
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-slate-400 w-[140px] flex-shrink-0">Adres IP</label>
        <div className="flex-1">
          <input
            type="text"
            value={ip}
            onChange={e => setIp(e.target.value)}
            placeholder="127.0.0.1"
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Port */}
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-slate-400 w-[140px] flex-shrink-0">Port</label>
        <div className="flex-1">
          <input
            type="number"
            value={port}
            onChange={e => setPort(Number(e.target.value))}
            min={1}
            max={65535}
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Hasło */}
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-slate-400 w-[140px] flex-shrink-0">Hasło</label>
        <div className="flex-1">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="(opcjonalne)"
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Auto-switch */}
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-slate-400 w-[140px] flex-shrink-0">Auto-switch</label>
        <div className="flex-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setAutoSwitch(!autoSwitch)}
              className={`w-10 h-5 rounded-full transition-colors relative ${autoSwitch ? 'bg-blue-600' : 'bg-slate-600'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${autoSwitch ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-slate-300">{autoSwitch ? 'Automatyczny' : 'Ręczny'}</span>
          </label>
        </div>
      </div>

      {/* Połączenie */}
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-slate-400 w-[140px] flex-shrink-0">Połączenie</label>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-xs text-slate-400">
              {isConnected ? 'Połączono' : 'Rozłączono'}
              {status?.studioMode ? ' (Studio Mode)' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleConnect}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded transition-colors"
            >
              Połącz
            </button>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
            >
              Rozłącz
            </button>
            {connectMsg && (
              <span className={`text-xs ${connectMsg.startsWith('Błąd') ? 'text-red-400' : 'text-green-400'}`}>
                {connectMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Aktywna scena */}
      {isConnected && status?.currentScene && (
        <div className="flex items-center gap-3 mb-3">
          <label className="text-sm text-slate-400 w-[140px] flex-shrink-0">Aktywna scena</label>
          <div className="flex-1">
            <span className="text-sm font-mono text-green-400 bg-slate-900 px-3 py-1.5 rounded inline-block">
              {status.currentScene}
            </span>
            {status.previewScene && (
              <span className="text-sm font-mono text-yellow-400 bg-slate-900 px-3 py-1.5 rounded inline-block ml-2">
                PRV: {status.previewScene}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Lista scen */}
      <div className="flex items-start gap-3 mb-3">
        <label className="text-sm text-slate-400 w-[140px] flex-shrink-0 pt-1">Sceny OBS</label>
        <div className="flex-1">
          {scenes.length > 0 ? (
            <div className="space-y-1 mb-2">
              {scenes.map(scene => (
                <div
                  key={scene}
                  className={`text-xs px-2 py-1 rounded ${
                    scene === status?.currentScene
                      ? 'bg-red-600/30 text-red-300 border border-red-600/40'
                      : scene === status?.previewScene
                        ? 'bg-green-600/20 text-green-300 border border-green-600/30'
                        : 'bg-slate-700/50 text-slate-400'
                  }`}
                >
                  {scene}
                  {scene === status?.currentScene && ' (PGM)'}
                  {scene === status?.previewScene && ' (PRV)'}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-500">
              {isConnected ? 'Brak scen — odśwież' : 'Połącz z OBS, aby pobrać sceny'}
            </span>
          )}
          <button
            onClick={handleRefreshScenes}
            disabled={!isConnected}
            className="px-2 py-1 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-200 text-xs rounded transition-colors"
          >
            Odśwież sceny
          </button>
        </div>
      </div>

      {/* Scene Map: camera_number → scena */}
      <div className="flex items-start gap-3 mb-3">
        <label className="text-sm text-slate-400 w-[140px] flex-shrink-0 pt-1">Mapping kamer</label>
        <div className="flex-1">
          <p className="text-xs text-slate-500 mb-2">
            Przypisz numer kamery (z vision cue) do sceny OBS.
          </p>
          {Object.keys(sceneMap).length > 0 ? (
            <div className="space-y-2 mb-2">
              {Object.entries(sceneMap)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([camNumStr, sceneName]) => {
                  const camNum = Number(camNumStr);
                  return (
                    <div key={camNum} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-16">Kamera {camNum}</span>
                      <span className="text-xs text-slate-500">→</span>
                      {scenes.length > 0 ? (
                        <select
                          value={sceneName}
                          onChange={e => updateSceneMapping(camNum, e.target.value)}
                          className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                        >
                          <option value="">-- brak --</option>
                          {scenes.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={sceneName}
                          onChange={e => updateSceneMapping(camNum, e.target.value)}
                          placeholder="Nazwa sceny OBS"
                          className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      )}
                      <button
                        onClick={() => removeMapping(camNum)}
                        className="text-red-400 hover:text-red-300 text-xs px-1"
                        title="Usuń mapping"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 mb-2">Brak przypisań — dodaj mapping.</p>
          )}
          <button
            onClick={addMapping}
            className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs rounded transition-colors"
          >
            + Dodaj mapping
          </button>
        </div>
      </div>

      {/* Zapisz */}
      <button
        onClick={handleSave}
        className="mt-4 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
      >
        Zapisz
      </button>
    </div>
  );
}
