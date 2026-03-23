import { useState, useEffect, useCallback } from 'react';
import type { StreamDeckIpcStatus } from '../../../electron/ipc/streamdeck-ipc';
import type { StreamDeckListEntry } from '../../../electron/streamdeck/streamdeck-manager';
import type { StreamDeckButtonConfig } from '../../../electron/streamdeck/streamdeck-actions';
import { ACTION_CATALOG } from '../../../electron/streamdeck/streamdeck-actions';
import type { StreamDeckActionType } from '../../../electron/streamdeck/streamdeck-actions';

// ── Domyślne kolory akcji (do podglądu w gridzie) ──────

const ACTION_COLORS: Record<string, string> = {
  play: '#006600', pause: '#665500', next: '#224477', prev: '#224477',
  goto: '#444444', step_next: '#553377', take_shot: '#774400', hold: '#664400',
  step_mode: '#443366', ftb: '#880000', cut: '#CC0000', auto_transition: '#BB5500',
  dsk: '#225555', macro: '#442266', media_play: '#005522', media_stop: '#552200',
  vol_up: '#224455', vol_down: '#224455', ptz_preset: '#335544', page_nav: '#1e3a5f',
  cam_pgm: '#333333', cam_pvw: '#333333', none: '#0a0a0a',
};

// ── StreamDeckTab ───────────────────────────────────────

export function StreamDeckTab() {
  const [status, setStatus] = useState<StreamDeckIpcStatus | null>(null);
  const [devices, setDevices] = useState<StreamDeckListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [brightness, setBrightness] = useState(70);
  const [editingButton, setEditingButton] = useState<{ page: number; key: number } | null>(null);
  const [newPageName, setNewPageName] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const s = await window.nextime.streamdeckGetStatus();
      setStatus(s);
    } catch (err) {
      console.error('[StreamDeckTab] Błąd:', err);
    }
    setLoading(false);
  }, []);

  const scanDevices = useCallback(async () => {
    try {
      const devs = await window.nextime.streamdeckListDevices();
      setDevices(devs);
    } catch (err) {
      console.error('[StreamDeckTab] Błąd skanowania:', err);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void scanDevices();
    const interval = setInterval(() => { void loadStatus(); }, 2500);
    return () => clearInterval(interval);
  }, [loadStatus, scanDevices]);

  // ── Akcje ───────────────────────────────────────────

  const handleConnect = async (path?: string) => {
    const result = await window.nextime.streamdeckOpen(path);
    if (!result.ok) console.error('[StreamDeckTab] Błąd:', result.error);
    await loadStatus();
  };

  const handleDisconnect = async () => {
    await window.nextime.streamdeckClose();
    await loadStatus();
  };

  const handleBrightnessChange = async (value: number) => {
    setBrightness(value);
    await window.nextime.streamdeckSetBrightness(value);
  };

  const handlePageChange = async (pageIndex: number) => {
    await window.nextime.streamdeckSetActivePage(pageIndex);
    setEditingButton(null);
    await loadStatus();
  };

  const handleAddPage = async () => {
    if (!newPageName.trim()) return;
    await window.nextime.streamdeckAddPage(newPageName.trim());
    setNewPageName('');
    await loadStatus();
  };

  const handleRemovePage = async (pageIndex: number) => {
    await window.nextime.streamdeckRemovePage(pageIndex);
    setEditingButton(null);
    await loadStatus();
  };

  const [resetOk, setResetOk] = useState(false);

  const handleResetDefaults = async () => {
    try {
      console.log('[StreamDeckTab] Resetuję do domyślnych...');
      const result = await window.nextime.streamdeckResetDefaults();
      console.log('[StreamDeckTab] Reset wynik:', result);
      setEditingButton(null);
      if (result.ok) {
        setResetOk(true);
        setTimeout(() => setResetOk(false), 2000);
      }
      await loadStatus();
    } catch (err) {
      console.error('[StreamDeckTab] Błąd resetu:', err);
    }
  };

  const handleSetButtonAction = async (
    pageIndex: number, keyIndex: number,
    action: StreamDeckActionType, params?: Record<string, unknown>, bgColor?: string,
  ) => {
    const entry = ACTION_CATALOG.find(a => a.type === action);
    const buttonConfig: StreamDeckButtonConfig = {
      action,
      label: entry?.label ?? action,
      params,
      bgColor: bgColor || undefined,
    };
    await window.nextime.streamdeckSetButtonAction(pageIndex, keyIndex, buttonConfig);
    setEditingButton(null);
    await loadStatus();
  };

  if (loading) return <div className="text-slate-400">Ładowanie...</div>;

  const activePage = status?.pagesConfig?.pages[status.pagesConfig.activePage];
  const editBtn = editingButton && activePage ? activePage.buttons[editingButton.key] : null;

  return (
    <div className="flex gap-4 h-full">
      {/* ── Lewa kolumna: grid + ustawienia ─────── */}
      <div className="flex-1 min-w-0 space-y-4 overflow-y-auto pr-1">
        {/* Połączenie */}
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-2">Połączenie StreamDeck</h3>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${status?.connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-slate-300">
              {status?.connected ? `${status.modelName} (S/N: ${status.serialNumber})` : 'Rozłączony'}
            </span>
          </div>

          {status?.connected && (
            <div className="text-xs text-slate-500 mb-2 flex flex-wrap gap-x-4 gap-y-0.5">
              <span>FW: {status.firmwareVersion}</span>
              <span>Ikony: {status.iconSize.width}×{status.iconSize.height}px</span>
              <span>Przyciski: {status.keyCount}</span>
              <span>Grid: {status.gridColumns}×{status.gridRows}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {!status?.connected ? (
              <>
                <button onClick={() => handleConnect()} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded">Połącz</button>
                <button onClick={scanDevices} className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm rounded">Skanuj</button>
              </>
            ) : (
              <button onClick={handleDisconnect} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-sm rounded">Rozłącz</button>
            )}
          </div>

          {!status?.connected && devices.length > 0 && (
            <div className="mt-2 bg-slate-800/50 rounded p-2">
              {devices.map((dev, i) => (
                <div key={i} className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-slate-400 flex-1">{String(dev.model)} — {dev.serialNumber ?? '?'}</span>
                  <button onClick={() => handleConnect(dev.path)} className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-xs text-white rounded">Połącz</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Jasność + Strony */}
        {status?.connected && status.pagesConfig && (
          <>
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">Jasność</h3>
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={100} value={brightness}
                  onChange={e => handleBrightnessChange(Number(e.target.value))} className="flex-1" />
                <span className="text-sm text-slate-400 w-10 text-right">{brightness}%</span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">Strony</h3>
              <div className="flex flex-wrap gap-1 mb-2">
                {status.pagesConfig.pages.map((page, i) => (
                  <div key={i} className="flex items-center">
                    <button onClick={() => handlePageChange(i)}
                      className={`px-2.5 py-1 text-xs rounded-l ${
                        i === status.pagesConfig.activePage ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}>{page.name}</button>
                    {status.pagesConfig.pages.length > 1 && (
                      <button onClick={() => handleRemovePage(i)}
                        className="px-1.5 py-1 text-xs bg-slate-700 hover:bg-red-700 text-slate-400 hover:text-white rounded-r border-l border-slate-600">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <input type="text" value={newPageName} onChange={e => setNewPageName(e.target.value)}
                  placeholder="Nowa strona..." onKeyDown={e => e.key === 'Enter' && handleAddPage()}
                  className="bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-xs text-slate-200 placeholder-slate-500 w-36" />
                <button onClick={handleAddPage} className="px-2 py-0.5 bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs rounded">Dodaj</button>
              </div>
            </div>

            {/* Grid przycisków */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                Przyciski — {activePage?.name}
                <span className="text-xs text-slate-500 ml-2">(kliknij przycisk aby edytować)</span>
              </h3>
              {activePage && (
                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${status.gridColumns || 8}, 1fr)` }}>
                  {Array.from({ length: (status.gridColumns || 8) * (status.gridRows || 4) }, (_, i) => {
                    const btn = activePage.buttons[i];
                    const isEditing = editingButton?.page === status.pagesConfig.activePage && editingButton?.key === i;
                    const bgColor = btn?.bgColor ?? ACTION_COLORS[btn?.action ?? 'none'] ?? '#111111';
                    const isEmpty = !btn || (btn.action === 'none' && !btn.label);

                    return (
                      <button key={i}
                        onClick={() => setEditingButton(isEditing ? null : { page: status.pagesConfig.activePage, key: i })}
                        className={`aspect-square rounded border-2 flex flex-col items-center justify-center p-0.5 transition-all hover:brightness-125 ${
                          isEditing ? 'border-blue-400 ring-1 ring-blue-400/60 scale-105' : 'border-transparent hover:border-slate-500'
                        }`}
                        style={{ backgroundColor: bgColor }}
                        title={btn ? `${btn.label} (${btn.action})` : 'Pusty'}
                      >
                        {!isEmpty && (
                          <>
                            <span className="text-white font-bold truncate w-full text-center leading-tight drop-shadow" style={{ fontSize: '9px' }}>
                              {btn?.label || '—'}
                            </span>
                            <span className="text-white/50 truncate w-full text-center leading-tight" style={{ fontSize: '7px' }}>
                              {btn?.action}
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reset */}
            <div className="border-t border-slate-700 pt-3 flex items-center gap-3">
              <button onClick={handleResetDefaults}
                className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${
                  resetOk
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-600 hover:bg-slate-500 text-slate-200'
                }`}>
                {resetOk ? 'Zresetowano!' : 'Resetuj do domyślnych'}
              </button>
              <span className="text-xs text-slate-500">Przywraca domyślne strony i przyciski.</span>
            </div>
          </>
        )}
      </div>

      {/* ── Prawa kolumna: edytor przycisku ─────── */}
      {editingButton && editBtn !== undefined && status?.connected && (
        <div className="w-[260px] flex-shrink-0 border-l border-slate-700 pl-4 overflow-y-auto">
          <ButtonEditorPanel
            pageIndex={editingButton.page}
            keyIndex={editingButton.key}
            currentConfig={editBtn ?? { action: 'none', label: '' }}
            onSetAction={handleSetButtonAction}
            onClose={() => setEditingButton(null)}
          />
        </div>
      )}
    </div>
  );
}

// ── ButtonEditorPanel — panel boczny edycji ─────────────

interface ButtonEditorPanelProps {
  pageIndex: number;
  keyIndex: number;
  currentConfig: StreamDeckButtonConfig;
  onSetAction: (pageIndex: number, keyIndex: number, action: StreamDeckActionType, params?: Record<string, unknown>, bgColor?: string) => Promise<void>;
  onClose: () => void;
}

function ButtonEditorPanel({ pageIndex, keyIndex, currentConfig, onSetAction, onClose }: ButtonEditorPanelProps) {
  const [selectedAction, setSelectedAction] = useState<StreamDeckActionType>(currentConfig.action);
  const [paramValue, setParamValue] = useState(
    currentConfig.params ? String(Object.values(currentConfig.params)[0] ?? '') : ''
  );
  const [bgColor, setBgColor] = useState(currentConfig.bgColor ?? '');

  // Reset stanu gdy zmieni się przycisk
  useEffect(() => {
    setSelectedAction(currentConfig.action);
    setParamValue(currentConfig.params ? String(Object.values(currentConfig.params)[0] ?? '') : '');
    setBgColor(currentConfig.bgColor ?? '');
  }, [currentConfig, keyIndex]);

  const entry = ACTION_CATALOG.find(a => a.type === selectedAction);
  const previewColor = bgColor || ACTION_COLORS[selectedAction] || '#333333';

  const handleSave = () => {
    let params: Record<string, unknown> | undefined;
    if (entry?.hasParams && paramValue) {
      if (selectedAction === 'cam_pgm' || selectedAction === 'cam_pvw') {
        params = { camera: Number(paramValue) };
      } else if (selectedAction === 'page_nav') {
        params = { page: Number(paramValue) };
      } else if (selectedAction === 'ptz_preset') {
        params = { camera: 1, preset: Number(paramValue) };
      } else if (selectedAction === 'goto') {
        params = { cueId: paramValue };
      } else {
        params = { index: Number(paramValue) };
      }
    }
    onSetAction(pageIndex, keyIndex, selectedAction, params, bgColor || undefined);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Edycja przycisku #{keyIndex + 1}</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
      </div>

      {/* Podgląd */}
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-lg flex flex-col items-center justify-center border border-slate-600"
          style={{ backgroundColor: previewColor }}>
          <span className="text-white text-xs font-bold text-center px-1 truncate w-full">{entry?.label ?? '—'}</span>
          <span className="text-white/50 text-[8px]">{selectedAction}</span>
        </div>
      </div>

      {/* Akcja */}
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Akcja</label>
        <select value={selectedAction} onChange={e => setSelectedAction(e.target.value as StreamDeckActionType)}
          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200">
          {ACTION_CATALOG.map(a => (
            <option key={a.type} value={a.type}>{a.label} — {a.description}</option>
          ))}
        </select>
      </div>

      {/* Parametr */}
      {entry?.hasParams && (
        <div>
          <label className="text-xs text-slate-400 mb-1 block">{entry.paramLabel ?? 'Wartość'}</label>
          <input type="text" value={paramValue} onChange={e => setParamValue(e.target.value)}
            placeholder={entry.paramLabel ?? 'Wartość'}
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200" />
        </div>
      )}

      {/* Kolor tła */}
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Kolor tła</label>
        <div className="flex items-center gap-2">
          <input type="color" value={bgColor || ACTION_COLORS[selectedAction] || '#333333'}
            onChange={e => setBgColor(e.target.value)}
            className="w-10 h-10 rounded cursor-pointer border border-slate-600 bg-transparent p-0.5" />
          <div className="flex-1">
            <input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)}
              placeholder="Domyślny"
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 mb-1" />
            {bgColor && (
              <button onClick={() => setBgColor('')} className="text-xs text-blue-400 hover:text-blue-300">
                Przywróć domyślny kolor
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Przyciski */}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave}
          className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium">
          Zapisz
        </button>
        <button onClick={onClose}
          className="flex-1 px-3 py-2 bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm rounded">
          Anuluj
        </button>
      </div>
    </div>
  );
}
