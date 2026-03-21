import { useState, useEffect, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import type { OutputConfigSummary } from '@/store/playback.store';
import type { DisplayInfo } from '../../../electron/window-manager';

// ── Typy ──────────────────────────────────────────────────────

interface ColumnInfo {
  id: string;
  name: string;
  type: string;
  is_script: boolean;
}

type OutputLayout = 'list' | 'single' | 'prompter';

interface OutputPanelProps {
  onClose: () => void;
}

// ── Komponent ─────────────────────────────────────────────────

export function OutputPanel({ onClose }: OutputPanelProps) {
  const activeRundownId = usePlaybackStore(s => s.activeRundownId);
  const outputConfigs = usePlaybackStore(s => s.outputConfigs);
  const setOutputConfigs = usePlaybackStore(s => s.setOutputConfigs);
  const addOutputConfig = usePlaybackStore(s => s.addOutputConfig);
  const updateOutputConfigStore = usePlaybackStore(s => s.updateOutputConfig);
  const removeOutputConfig = usePlaybackStore(s => s.removeOutputConfig);

  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [httpPort, setHttpPort] = useState(3142);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Formularz tworzenia
  const [newName, setNewName] = useState('');
  const [newLayout, setNewLayout] = useState<OutputLayout>('list');
  const [newColumnId, setNewColumnId] = useState('');

  // Formularz edycji ustawień
  const [editingId, setEditingId] = useState<string | null>(null);

  // Faza 19: monitory + wybór monitora dla promptera
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [prompterDisplayPicker, setPrompterDisplayPicker] = useState<string | null>(null);

  // Ładowanie danych — output configs + kolumny + httpPort + monitory
  useEffect(() => {
    if (!activeRundownId) return;

    async function load() {
      try {
        const [configs, cols, port, disps] = await Promise.all([
          window.nextime.getOutputConfigs(activeRundownId!),
          window.nextime.getColumns(activeRundownId!),
          window.nextime.getHttpPort(),
          window.nextime.getDisplays(),
        ]);

        setOutputConfigs(configs.map(c => ({
          id: c.id,
          rundown_id: c.rundown_id,
          name: c.name,
          layout: c.layout,
          column_id: c.column_id,
          share_token: c.share_token,
          settings: c.settings as Record<string, unknown>,
          created_at: c.created_at,
          updated_at: c.updated_at,
        })));

        setColumns(cols.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          is_script: c.is_script,
        })));

        setHttpPort(port);
        setDisplays(disps);
      } catch (err) {
        console.error('[OutputPanel] Błąd ładowania:', err);
      }
    }
    load();
  }, [activeRundownId, setOutputConfigs]);

  // Tworzenie nowego outputu
  const handleCreate = useCallback(async () => {
    if (!activeRundownId || !newName.trim()) return;

    try {
      const config = await window.nextime.createOutputConfig({
        rundown_id: activeRundownId,
        name: newName.trim(),
        layout: newLayout,
        column_id: newColumnId || undefined,
        settings: newLayout === 'prompter' ? {
          prompter_text_size: 48,
          prompter_margin: 40,
          prompter_indicator: 30,
          prompter_auto_scroll: true,
        } : {},
      });

      if (config) {
        addOutputConfig({
          id: config.id,
          rundown_id: config.rundown_id,
          name: config.name,
          layout: config.layout,
          column_id: config.column_id,
          share_token: config.share_token,
          settings: config.settings as Record<string, unknown>,
          created_at: config.created_at,
          updated_at: config.updated_at,
        });
      }

      // Reset formularza
      setNewName('');
      setNewLayout('list');
      setNewColumnId('');
      setShowCreateForm(false);
    } catch (err) {
      console.error('[OutputPanel] Błąd tworzenia:', err);
    }
  }, [activeRundownId, newName, newLayout, newColumnId, addOutputConfig]);

  // Usuwanie outputu
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Na pewno usunąć ten output?')) return;
    try {
      const deleted = await window.nextime.deleteOutputConfig(id);
      if (deleted) {
        removeOutputConfig(id);
      }
    } catch (err) {
      console.error('[OutputPanel] Błąd usuwania:', err);
    }
  }, [removeOutputConfig]);

  // Kopiowanie linku do schowka
  const handleCopyLink = useCallback((shareToken: string) => {
    const link = `http://localhost:${httpPort}/output/${shareToken}`;
    navigator.clipboard.writeText(link).catch(() => {
      // Fallback — pokaż w alercie
      prompt('Link do output:', link);
    });
  }, [httpPort]);

  // Otwieranie w przeglądarce
  const handleOpenInBrowser = useCallback((shareToken: string) => {
    const link = `http://localhost:${httpPort}/output/${shareToken}`;
    window.open(link, '_blank');
  }, [httpPort]);

  // Aktualizacja ustawień
  const handleUpdateSettings = useCallback(async (id: string, settings: Record<string, unknown>) => {
    try {
      const updated = await window.nextime.updateOutputConfig(id, { settings: settings as Record<string, unknown> });
      if (updated) {
        updateOutputConfigStore(id, { settings: updated.settings as Record<string, unknown> });
      }
    } catch (err) {
      console.error('[OutputPanel] Błąd aktualizacji:', err);
    }
  }, [updateOutputConfigStore]);

  // Faza 19: otwieranie w osobnym oknie Electron
  const handleOpenInWindow = useCallback(async (config: OutputConfigSummary) => {
    try {
      if (config.layout === 'prompter') {
        // Pokaż picker monitora jeśli jest >1 monitor
        if (displays.length > 1) {
          setPrompterDisplayPicker(config.share_token);
          return;
        }
        // Jeden monitor — otwórz od razu
        await window.nextime.openPrompterWindow(config.share_token);
      } else {
        await window.nextime.openOutputWindow(config.share_token, config.name);
      }
    } catch (err) {
      console.error('[OutputPanel] Błąd otwierania okna:', err);
    }
  }, [displays.length]);

  // Faza 19: otwieranie promptera na wybranym monitorze
  const handleOpenPrompterOnDisplay = useCallback(async (shareToken: string, displayId: number) => {
    try {
      await window.nextime.openPrompterWindow(shareToken, displayId);
      setPrompterDisplayPicker(null);
    } catch (err) {
      console.error('[OutputPanel] Błąd otwierania promptera:', err);
    }
  }, []);

  // Ikona layoutu
  const layoutIcon = (layout: OutputLayout): string => {
    switch (layout) {
      case 'list': return 'LIST';
      case 'single': return 'SINGLE';
      case 'prompter': return 'PROMPT';
    }
  };

  const layoutColor = (layout: OutputLayout): string => {
    switch (layout) {
      case 'list': return 'bg-blue-600/20 text-blue-400 border-blue-600/30';
      case 'single': return 'bg-green-600/20 text-green-400 border-green-600/30';
      case 'prompter': return 'bg-purple-600/20 text-purple-400 border-purple-600/30';
    }
  };

  if (!activeRundownId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-slate-800 rounded-lg p-6 shadow-xl max-w-lg w-full mx-4">
          <p className="text-slate-400">Wybierz rundown, aby zarządzać wyjściami.</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-700 text-slate-200 rounded hover:bg-slate-600">
            Zamknij
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nagłówek */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">Wyjścia</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">&times;</button>
        </div>

        {/* Lista outputów */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {outputConfigs.length === 0 && !showCreateForm && (
            <p className="text-slate-500 text-sm py-4">Brak skonfigurowanych wyjść. Kliknij "Dodaj" aby utworzyć.</p>
          )}

          {outputConfigs.map(config => (
            <div key={config.id} className="bg-slate-750 rounded-lg p-4 mb-3 border border-slate-700">
              <div className="flex items-center gap-3">
                {/* Badge layout */}
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${layoutColor(config.layout)}`}>
                  {layoutIcon(config.layout)}
                </span>

                {/* Nazwa */}
                <span className="text-sm font-medium text-slate-200 flex-1">{config.name}</span>

                {/* Przyciski akcji */}
                <button
                  onClick={() => handleCopyLink(config.share_token)}
                  className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-700 rounded hover:bg-slate-600"
                  title="Kopiuj link"
                >
                  Kopiuj
                </button>
                <button
                  onClick={() => handleOpenInBrowser(config.share_token)}
                  className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-700 rounded hover:bg-slate-600"
                  title="Otwórz w przeglądarce"
                >
                  Otwórz
                </button>
                <button
                  onClick={() => handleOpenInWindow(config)}
                  className="px-2 py-1 text-[11px] text-emerald-400 hover:text-emerald-300 bg-slate-700 rounded hover:bg-emerald-900/30"
                  title={config.layout === 'prompter' ? 'Otwórz w oknie promptera' : 'Otwórz w nowym oknie'}
                >
                  Okno
                </button>
                <button
                  onClick={() => setEditingId(editingId === config.id ? null : config.id)}
                  className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-700 rounded hover:bg-slate-600"
                >
                  {editingId === config.id ? 'Zwiń' : 'Ustaw.'}
                </button>
                <button
                  onClick={() => handleDelete(config.id)}
                  className="px-2 py-1 text-[11px] text-red-400 hover:text-red-300 bg-slate-700 rounded hover:bg-red-900/30"
                >
                  Usuń
                </button>
              </div>

              {/* URL */}
              <div className="mt-2 text-[11px] text-slate-500 font-mono truncate">
                http://localhost:{httpPort}/output/{config.share_token}
              </div>

              {/* Faza 19: picker monitora dla promptera */}
              {prompterDisplayPicker === config.share_token && (
                <div className="mt-2 p-3 bg-slate-700/50 rounded border border-emerald-600/30">
                  <p className="text-[11px] text-slate-300 mb-2">Wybierz monitor dla promptera:</p>
                  <div className="flex flex-wrap gap-2">
                    {displays.map(d => (
                      <button
                        key={d.id}
                        onClick={() => handleOpenPrompterOnDisplay(config.share_token, d.id)}
                        className={`px-3 py-1.5 text-[11px] rounded border transition-colors ${
                          d.isPrimary
                            ? 'border-slate-500 text-slate-300 hover:bg-slate-600'
                            : 'border-emerald-600/50 text-emerald-400 hover:bg-emerald-900/30'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setPrompterDisplayPicker(null)}
                    className="mt-2 text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    Anuluj
                  </button>
                </div>
              )}

              {/* Panel ustawień (rozwijany) */}
              {editingId === config.id && (
                <OutputSettingsEditor
                  config={config}
                  columns={columns}
                  onUpdate={(settings) => handleUpdateSettings(config.id, settings)}
                />
              )}
            </div>
          ))}

          {/* Formularz tworzenia */}
          {showCreateForm && (
            <div className="bg-slate-750 rounded-lg p-4 mb-3 border border-blue-600/30">
              <h3 className="text-sm font-medium text-slate-200 mb-3">Nowe wyjście</h3>

              <div className="space-y-3">
                {/* Nazwa */}
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Nazwa</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="np. Monitor reżysera"
                    className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Layout */}
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Typ widoku</label>
                  <div className="flex gap-2">
                    {(['list', 'single', 'prompter'] as OutputLayout[]).map(l => (
                      <button
                        key={l}
                        onClick={() => setNewLayout(l)}
                        className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                          newLayout === l
                            ? layoutColor(l)
                            : 'border-slate-600 text-slate-400 hover:border-slate-500'
                        }`}
                      >
                        {l === 'list' ? 'Lista cue' : l === 'single' ? 'Pełny ekran' : 'Prompter'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Kolumna script (opcjonalna, głównie dla promptera) */}
                {newLayout === 'prompter' && columns.length > 0 && (
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Kolumna skryptu (opcjonalnie)</label>
                    <select
                      value={newColumnId}
                      onChange={(e) => setNewColumnId(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">— brak (tytuł + subtitle) —</option>
                      {columns.map(col => (
                        <option key={col.id} value={col.id}>{col.name} {col.is_script ? '(script)' : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Przyciski */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim()}
                    className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Utwórz
                  </button>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stopka */}
        <div className="flex justify-between items-center px-5 py-3 border-t border-slate-700">
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-500"
          >
            + Dodaj wyjście
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edytor ustawień per output ────────────────────────────────

interface OutputSettingsEditorProps {
  config: OutputConfigSummary;
  columns: ColumnInfo[];
  onUpdate: (settings: Record<string, unknown>) => void;
}

function OutputSettingsEditor({ config, columns, onUpdate }: OutputSettingsEditorProps) {
  const settings = config.settings;

  const handleChange = (key: string, value: unknown) => {
    onUpdate({ ...settings, [key]: value });
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
      {/* Wspólne ustawienia */}
      <div className="flex items-center gap-3">
        <label className="text-[11px] text-slate-400 w-28">Kolor tła</label>
        <input
          type="color"
          value={(settings.background_color as string) ?? (config.layout === 'prompter' ? '#000000' : '#0f172a')}
          onChange={(e) => handleChange('background_color', e.target.value)}
          className="w-8 h-6 bg-transparent border border-slate-600 rounded cursor-pointer"
        />
      </div>

      {/* Mirror mode */}
      <div className="flex items-center gap-3">
        <label className="text-[11px] text-slate-400 w-28">Lustrzane</label>
        <select
          value={(settings.mirror as string) ?? 'off'}
          onChange={(e) => handleChange('mirror', e.target.value)}
          className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-[11px] text-slate-200"
        >
          <option value="off">Wyłączony</option>
          <option value="vertical">Pionowy (beam-splitter)</option>
          <option value="horizontal">Poziomy</option>
          <option value="vertical,horizontal">Oba</option>
        </select>
      </div>

      {/* Ustawienia promptera */}
      {config.layout === 'prompter' && (
        <>
          <div className="flex items-center gap-3">
            <label className="text-[11px] text-slate-400 w-28">Rozmiar tekstu</label>
            <input
              type="number"
              min={16}
              max={200}
              value={(settings.prompter_text_size as number) ?? 48}
              onChange={(e) => handleChange('prompter_text_size', Number(e.target.value))}
              className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-[11px] text-slate-200"
            />
            <span className="text-[10px] text-slate-500">px</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-[11px] text-slate-400 w-28">Margines</label>
            <input
              type="number"
              min={0}
              max={200}
              value={(settings.prompter_margin as number) ?? 40}
              onChange={(e) => handleChange('prompter_margin', Number(e.target.value))}
              className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-[11px] text-slate-200"
            />
            <span className="text-[10px] text-slate-500">px</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-[11px] text-slate-400 w-28">Wskaźnik</label>
            <input
              type="number"
              min={0}
              max={100}
              value={(settings.prompter_indicator as number) ?? 30}
              onChange={(e) => handleChange('prompter_indicator', Number(e.target.value))}
              className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-[11px] text-slate-200"
            />
            <span className="text-[10px] text-slate-500">% od góry</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-[11px] text-slate-400 w-28">Wielkie litery</label>
            <input
              type="checkbox"
              checked={(settings.prompter_uppercase as boolean) ?? false}
              onChange={(e) => handleChange('prompter_uppercase', e.target.checked)}
              className="w-4 h-4 bg-slate-700 border border-slate-600 rounded"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-[11px] text-slate-400 w-28">Automatyczne przewijanie</label>
            <input
              type="checkbox"
              checked={(settings.prompter_auto_scroll as boolean) ?? true}
              onChange={(e) => handleChange('prompter_auto_scroll', e.target.checked)}
              className="w-4 h-4 bg-slate-700 border border-slate-600 rounded"
            />
          </div>
        </>
      )}

      {/* Ustawienia single view */}
      {config.layout === 'single' && (
        <>
          <div className="flex items-center gap-3">
            <label className="text-[11px] text-slate-400 w-28">Czas dnia</label>
            <select
              value={(settings.time_of_day as string) ?? 'off'}
              onChange={(e) => handleChange('time_of_day', e.target.value)}
              className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-[11px] text-slate-200"
            >
              <option value="off">Wyłączony</option>
              <option value="on">Włączony</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-[11px] text-slate-400 w-28">Pokaż następny</label>
            <select
              value={(settings.next_cue as string) ?? 'off'}
              onChange={(e) => handleChange('next_cue', e.target.value)}
              className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-[11px] text-slate-200"
            >
              <option value="off">Wyłączony</option>
              <option value="on">Włączony</option>
            </select>
          </div>
        </>
      )}

      {/* Ustawienia list view */}
      {config.layout === 'list' && (
        <>
          <div className="flex items-center gap-3">
            <label className="text-[11px] text-slate-400 w-28">Pasek postępu</label>
            <select
              value={(settings.progress_bar as string) ?? 'off'}
              onChange={(e) => handleChange('progress_bar', e.target.value)}
              className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-[11px] text-slate-200"
            >
              <option value="off">Wyłączony</option>
              <option value="on">Włączony</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}
