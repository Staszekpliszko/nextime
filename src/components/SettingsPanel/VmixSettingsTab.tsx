import { useState, useEffect, useCallback } from 'react';
import type { VmixSettings } from '../../../electron/settings-manager';
import type { VmixStatus } from '../../../electron/senders/vmix-sender';
import type { VmixInput } from '../../../electron/senders/vmix-xml-parser';

// ── Typy ────────────────────────────────────────────────

interface VmixSettingsTabProps {
  settings: VmixSettings;
  onSave: (values: Partial<VmixSettings>) => void | Promise<void>;
}

/** Dostępne typy przejść vMix */
const TRANSITION_TYPES = [
  { value: 'Cut', label: 'Cut (natychmiastowe)' },
  { value: 'Fade', label: 'Fade (przenikanie)' },
  { value: 'Merge', label: 'Merge' },
  { value: 'Wipe', label: 'Wipe (kurtyna)' },
  { value: 'Zoom', label: 'Zoom' },
  { value: 'Stinger1', label: 'Stinger 1' },
  { value: 'Stinger2', label: 'Stinger 2' },
] as const;

// ── Komponent ───────────────────────────────────────────

export function VmixSettingsTab({ settings, onSave }: VmixSettingsTabProps) {
  const [ip, setIp] = useState(settings.ip);
  const [port, setPort] = useState(settings.port);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [autoSwitch, setAutoSwitch] = useState(settings.autoSwitch);
  const [inputMap, setInputMap] = useState<Record<number, number>>({ ...settings.inputMap });
  const [transitionType, setTransitionType] = useState(settings.transitionType);
  const [transitionDuration, setTransitionDuration] = useState(settings.transitionDuration);
  const [status, setStatus] = useState<VmixStatus | null>(null);
  const [inputs, setInputs] = useState<VmixInput[]>([]);
  const [connectMsg, setConnectMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Polling statusu vMix co 2s
  useEffect(() => {
    const refresh = () => {
      window.nextime.vmixGetStatus()
        .then(s => {
          const vmixStatus = s as VmixStatus;
          setStatus(vmixStatus);
          if (vmixStatus.inputs.length > 0) {
            setInputs(vmixStatus.inputs);
          }
        })
        .catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = useCallback(async () => {
    setSaveMsg(null);
    try {
      await onSave({ ip, port, enabled, autoSwitch, inputMap, transitionType, transitionDuration });
      setSaveMsg('Zapisano');
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg(`Błąd: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [ip, port, enabled, autoSwitch, inputMap, transitionType, transitionDuration, onSave]);

  const handleConnect = async () => {
    setConnectMsg(null);
    try {
      // Zapisz ustawienia przed połączeniem
      await window.nextime.updateSettings('vmix', { ip, port, enabled: true, autoSwitch, inputMap, transitionType, transitionDuration });
      const result = await window.nextime.vmixConnect();
      if (result.ok) {
        setConnectMsg('Połączono');
        setEnabled(true);
        // Odśwież inputy po połączeniu
        setTimeout(async () => {
          const refreshed = await window.nextime.vmixRefreshInputs();
          setInputs(refreshed as VmixInput[]);
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
      await window.nextime.vmixDisconnect();
      setConnectMsg('Rozłączono');
      setInputs([]);
    } catch (err) {
      setConnectMsg(`Błąd: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRefreshInputs = async () => {
    try {
      const refreshed = await window.nextime.vmixRefreshInputs();
      setInputs(refreshed as VmixInput[]);
    } catch {
      // Ignoruj — prawdopodobnie nie połączony
    }
  };

  // Aktualizacja mappingu camera_number → input vMix
  const updateInputMapping = (camNum: number, vmixInput: number | '') => {
    setInputMap(prev => {
      const next = { ...prev };
      if (vmixInput === '') {
        delete next[camNum];
      } else {
        next[camNum] = vmixInput;
      }
      return next;
    });
  };

  // Dodaj nowy mapping
  const addMapping = () => {
    const existing = Object.keys(inputMap).map(Number);
    const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    setInputMap(prev => ({ ...prev, [nextNum]: 1 }));
  };

  // Usuń mapping
  const removeMapping = (camNum: number) => {
    setInputMap(prev => {
      const next = { ...prev };
      delete next[camNum];
      return next;
    });
  };

  const isConnected = status?.connected ?? false;

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-300 mb-3">vMix (HTTP API)</h3>

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

      {/* Typ przejścia */}
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-slate-400 w-[140px] flex-shrink-0">Przejście</label>
        <div className="flex-1">
          <select
            value={transitionType}
            onChange={e => setTransitionType(e.target.value as VmixSettings['transitionType'])}
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          >
            {TRANSITION_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Czas przejścia */}
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-slate-400 w-[140px] flex-shrink-0">Czas przejścia (ms)</label>
        <div className="flex-1">
          <input
            type="number"
            value={transitionDuration}
            onChange={e => setTransitionDuration(Number(e.target.value))}
            min={0}
            max={10000}
            step={100}
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-slate-500 mt-1">0 = natychmiastowe (dotyczy Fade/Merge/Wipe/Zoom)</p>
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
              {status?.version ? ` (v${status.version})` : ''}
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

      {/* Aktywny input */}
      {isConnected && status?.activeInput !== null && (
        <div className="flex items-center gap-3 mb-3">
          <label className="text-sm text-slate-400 w-[140px] flex-shrink-0">Aktywny input</label>
          <div className="flex-1">
            <span className="text-sm font-mono text-green-400 bg-slate-900 px-3 py-1.5 rounded inline-block">
              PGM: Input {status?.activeInput}
              {inputs.find(i => i.number === status?.activeInput)?.title
                ? ` (${inputs.find(i => i.number === status?.activeInput)!.title})`
                : ''}
            </span>
            {status?.previewInput !== null && (
              <span className="text-sm font-mono text-yellow-400 bg-slate-900 px-3 py-1.5 rounded inline-block ml-2">
                PRV: Input {status?.previewInput}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Lista inputów */}
      <div className="flex items-start gap-3 mb-3">
        <label className="text-sm text-slate-400 w-[140px] flex-shrink-0 pt-1">Inputy vMix</label>
        <div className="flex-1">
          {inputs.length > 0 ? (
            <div className="space-y-1 mb-2">
              {inputs.map(input => (
                <div
                  key={input.number}
                  className={`text-xs px-2 py-1 rounded ${
                    input.number === status?.activeInput
                      ? 'bg-red-600/30 text-red-300 border border-red-600/40'
                      : input.number === status?.previewInput
                        ? 'bg-green-600/20 text-green-300 border border-green-600/30'
                        : 'bg-slate-700/50 text-slate-400'
                  }`}
                >
                  <span className="font-mono">{input.number}</span>
                  <span className="mx-1">—</span>
                  <span>{input.title}</span>
                  <span className="text-slate-500 ml-1">({input.type})</span>
                  {input.number === status?.activeInput && ' (PGM)'}
                  {input.number === status?.previewInput && ' (PRV)'}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-500">
              {isConnected ? 'Brak inputów — odśwież' : 'Połącz z vMix, aby pobrać inputy'}
            </span>
          )}
          <button
            onClick={handleRefreshInputs}
            disabled={!isConnected}
            className="px-2 py-1 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-200 text-xs rounded transition-colors"
          >
            Odśwież inputy
          </button>
        </div>
      </div>

      {/* Input Map: camera_number → input vMix */}
      <div className="flex items-start gap-3 mb-3">
        <label className="text-sm text-slate-400 w-[140px] flex-shrink-0 pt-1">Mapping kamer</label>
        <div className="flex-1">
          <p className="text-xs text-slate-500 mb-2">
            Przypisz numer kamery (z vision cue) do numeru inputu vMix.
          </p>
          {Object.keys(inputMap).length > 0 ? (
            <div className="space-y-2 mb-2">
              {Object.entries(inputMap)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([camNumStr, vmixInputNum]) => {
                  const camNum = Number(camNumStr);
                  return (
                    <div key={camNum} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-16">Kamera {camNum}</span>
                      <span className="text-xs text-slate-500">→</span>
                      {inputs.length > 0 ? (
                        <select
                          value={vmixInputNum}
                          onChange={e => updateInputMapping(camNum, e.target.value === '' ? '' : Number(e.target.value))}
                          className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                        >
                          <option value="">-- brak --</option>
                          {inputs.map(inp => (
                            <option key={inp.number} value={inp.number}>
                              {inp.number} — {inp.title} ({inp.type})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          value={vmixInputNum}
                          onChange={e => updateInputMapping(camNum, e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="Nr inputu vMix"
                          min={1}
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

      {/* Status streaming/recording */}
      {isConnected && (
        <div className="flex items-center gap-3 mb-3">
          <label className="text-sm text-slate-400 w-[140px] flex-shrink-0">Status vMix</label>
          <div className="flex-1 flex items-center gap-3">
            <span className={`text-xs px-2 py-0.5 rounded ${status?.streaming ? 'bg-red-600/30 text-red-300' : 'bg-slate-700/50 text-slate-500'}`}>
              {status?.streaming ? 'Streaming aktywny' : 'Streaming nieaktywny'}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${status?.recording ? 'bg-red-600/30 text-red-300' : 'bg-slate-700/50 text-slate-500'}`}>
              {status?.recording ? 'Nagrywanie aktywne' : 'Nagrywanie nieaktywne'}
            </span>
          </div>
        </div>
      )}

      {/* Zapisz */}
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSave}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
        >
          Zapisz
        </button>
        {saveMsg && (
          <span className={`text-xs ${saveMsg.startsWith('Błąd') ? 'text-red-400' : 'text-green-400'}`}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}
