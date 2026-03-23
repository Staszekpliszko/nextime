import { useState, useEffect, useCallback } from 'react';
import type { AllSettings, OscSettings, MidiSettings, AtemSettings, LtcSettings, GpiSettings, PtzSettings, ObsSettings, VmixSettings, VisionSettings } from '../../../electron/settings-manager';
import { ObsSettingsTab } from './ObsSettingsTab';
import { VmixSettingsTab } from './VmixSettingsTab';
import { CompanionTab } from './CompanionTab';
import { StreamDeckTab } from './StreamDeckTab';

// ── Typy ────────────────────────────────────────────────

type TabId = 'general' | 'osc' | 'midi' | 'atem' | 'obs' | 'vmix' | 'ltc' | 'gpi' | 'ptz' | 'companion' | 'streamdeck';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'general', label: 'Ogólne' },
  { id: 'osc', label: 'OSC' },
  { id: 'midi', label: 'MIDI' },
  { id: 'atem', label: 'ATEM' },
  { id: 'obs', label: 'OBS' },
  { id: 'vmix', label: 'vMix' },
  { id: 'ltc', label: 'LTC' },
  { id: 'gpi', label: 'GPI' },
  { id: 'ptz', label: 'PTZ' },
  { id: 'companion', label: 'Companion' },
  { id: 'streamdeck', label: 'StreamDeck' },
];

interface SettingsPanelProps {
  onClose: () => void;
}

// ── Główny komponent ────────────────────────────────────

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [settings, setSettings] = useState<AllSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Wczytaj ustawienia przy montowaniu
  useEffect(() => {
    window.nextime.getSettings()
      .then(s => { setSettings(s); setLoading(false); })
      .catch(err => { console.error('[SettingsPanel] Błąd wczytywania:', err); setLoading(false); });
  }, []);

  // Zapisz sekcję do backendu i odśwież lokalny stan
  const saveSection = useCallback(async <S extends keyof AllSettings>(section: S, values: Partial<AllSettings[S]>) => {
    try {
      await window.nextime.updateSettings(section, values);
      // Odśwież pełne ustawienia z backendu
      const updated = await window.nextime.getSettings();
      setSettings(updated);
    } catch (err) {
      console.error(`[SettingsPanel] Błąd zapisu sekcji ${section}:`, err);
    }
  }, []);

  if (loading || !settings) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
        <div className="bg-slate-800 rounded-lg p-8 text-slate-400">
          Ładowanie ustawień...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div
        className={`bg-slate-800 rounded-lg shadow-xl max-h-[90vh] flex flex-col transition-all ${
          activeTab === 'streamdeck' ? 'w-[1100px]' : 'w-[720px]'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Nagłówek */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">Ustawienia</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xl leading-none"
            title="Zamknij"
          >
            ✕
          </button>
        </div>

        {/* Zakładki + zawartość */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar z zakładkami */}
          <nav className="w-[160px] bg-slate-850 border-r border-slate-700 py-2 flex-shrink-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-500'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Zawartość zakładki */}
          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === 'general' && <GeneralTab settings={settings.vision} onSave={v => saveSection('vision', v)} />}
            {activeTab === 'osc' && <OscTab settings={settings.osc} onSave={v => saveSection('osc', v)} />}
            {activeTab === 'midi' && <MidiTab settings={settings.midi} onSave={v => saveSection('midi', v)} />}
            {activeTab === 'atem' && <AtemTab settings={settings.atem} onSave={v => saveSection('atem', v)} />}
            {activeTab === 'obs' && <ObsSettingsTab settings={settings.obs} onSave={v => saveSection('obs', v)} />}
            {activeTab === 'vmix' && <VmixSettingsTab settings={settings.vmix} onSave={v => saveSection('vmix', v)} />}
            {activeTab === 'ltc' && <LtcTab settings={settings.ltc} onSave={v => saveSection('ltc', v)} />}
            {activeTab === 'gpi' && <GpiTab settings={settings.gpi} onSave={v => saveSection('gpi', v)} />}
            {activeTab === 'ptz' && <PtzTab settings={settings.ptz} onSave={v => saveSection('ptz', v)} />}
            {activeTab === 'companion' && <CompanionTab />}
            {activeTab === 'streamdeck' && <StreamDeckTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Komponenty pomocnicze ───────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-slate-300 mb-3">{children}</h3>;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <label className="text-sm text-slate-400 w-[140px] flex-shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, className }: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 ${className ?? ''}`}
    />
  );
}

function NumberInput({ value, onChange, min, max }: {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      min={min}
      max={max}
      className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
    />
  );
}

function Toggle({ checked, onChange, label }: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`w-10 h-5 rounded-full transition-colors relative ${checked ? 'bg-blue-600' : 'bg-slate-600'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  );
}

function SaveButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="mt-4 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
    >
      {label ?? 'Zapisz'}
    </button>
  );
}

function TestButton({ onClick, label, result }: {
  onClick: () => void;
  label: string;
  result: { ok: boolean; error?: string } | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm rounded transition-colors"
      >
        {label}
      </button>
      {result && (
        <span className={`text-xs ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
          {result.ok ? 'OK' : result.error ?? 'Błąd'}
        </span>
      )}
    </div>
  );
}

// ── Zakładka: Ogólne ────────────────────────────────────

function GeneralTab({ settings, onSave }: { settings: VisionSettings; onSave: (v: Partial<VisionSettings>) => void }) {
  return (
    <div>
      <SectionTitle>Ustawienia ogólne</SectionTitle>
      <p className="text-sm text-slate-500 mb-4">
        Język interfejsu, automatyczny zapis i centralny routing wizji.
      </p>
      <FieldRow label="Język">
        <select
          disabled
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-400 cursor-not-allowed"
        >
          <option>Polski</option>
        </select>
      </FieldRow>
      <FieldRow label="Automatyczny zapis">
        <Toggle checked={true} onChange={() => {}} label="Włączony (zawsze)" />
      </FieldRow>
      <div className="mt-6 border-t border-slate-700 pt-4">
        <SectionTitle>Aktywny switcher wizji</SectionTitle>
        <p className="text-sm text-slate-500 mb-3">
          Wybierz, który switcher ma reagować na vision cue z timeline.
          Tylko jeden switcher może być aktywny jednocześnie.
        </p>
        <FieldRow label="Switcher">
          <select
            value={settings.targetSwitcher}
            onChange={e => onSave({ targetSwitcher: e.target.value as VisionSettings['targetSwitcher'] })}
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200"
          >
            <option value="none">Brak (wyłączony)</option>
            <option value="atem">ATEM (BlackMagic)</option>
            <option value="obs">OBS Studio</option>
            <option value="vmix">vMix</option>
          </select>
        </FieldRow>
      </div>
    </div>
  );
}

// ── Zakładka: OSC ───────────────────────────────────────

function OscTab({ settings, onSave }: { settings: OscSettings; onSave: (v: Partial<OscSettings>) => void }) {
  const [host, setHost] = useState(settings.host);
  const [port, setPort] = useState(settings.port);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const handleSave = () => {
    onSave({ host, port, enabled });
  };

  const handleTest = async () => {
    setTestResult(null);
    // Najpierw zapisz aktualne wartości
    await window.nextime.updateSettings('osc', { host, port, enabled });
    const result = await window.nextime.oscTestSend();
    setTestResult(result);
  };

  return (
    <div>
      <SectionTitle>OSC (Open Sound Control)</SectionTitle>
      <FieldRow label="Aktywny">
        <Toggle checked={enabled} onChange={setEnabled} label={enabled ? 'Włączony' : 'Wyłączony'} />
      </FieldRow>
      <FieldRow label="Adres hosta">
        <TextInput value={host} onChange={setHost} placeholder="127.0.0.1" />
      </FieldRow>
      <FieldRow label="Port">
        <NumberInput value={port} onChange={setPort} min={1} max={65535} />
      </FieldRow>
      <FieldRow label="Test">
        <TestButton onClick={handleTest} label="Testuj połączenie" result={testResult} />
      </FieldRow>
      <SaveButton onClick={handleSave} />
    </div>
  );
}

// ── Zakładka: MIDI ──────────────────────────────────────

function MidiTab({ settings, onSave }: { settings: MidiSettings; onSave: (v: Partial<MidiSettings>) => void }) {
  const [channel, setChannel] = useState(settings.defaultChannel);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [ports, setPorts] = useState<Array<{ index: number; name: string }>>([]);
  const [midiAvailable, setMidiAvailable] = useState(true);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    window.nextime.midiIsAvailable().then(setMidiAvailable).catch(() => setMidiAvailable(false));
    window.nextime.midiListPorts().then(setPorts).catch(() => setPorts([]));
  }, []);

  const handleSave = () => {
    onSave({ defaultChannel: channel, enabled });
  };

  const handleOpenPort = async (portIndex: number) => {
    const result = await window.nextime.midiOpenPort(portIndex);
    if (!result.ok) {
      setTestResult({ ok: false, error: result.error });
    } else {
      setTestResult({ ok: true });
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    const result = await window.nextime.midiTestSend();
    setTestResult(result);
  };

  return (
    <div>
      <SectionTitle>MIDI</SectionTitle>
      {!midiAvailable && (
        <div className="mb-3 px-3 py-2 bg-yellow-600/20 border border-yellow-600/30 rounded text-xs text-yellow-400">
          Moduł MIDI niedostępny — zainstaluj @julusian/midi
        </div>
      )}
      <FieldRow label="Aktywny">
        <Toggle checked={enabled} onChange={setEnabled} label={enabled ? 'Włączony' : 'Wyłączony'} />
      </FieldRow>
      <FieldRow label="Kanał MIDI">
        <NumberInput value={channel} onChange={setChannel} min={1} max={16} />
      </FieldRow>
      <FieldRow label="Port wyjściowy">
        {ports.length > 0 ? (
          <select
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            onChange={e => handleOpenPort(Number(e.target.value))}
            defaultValue=""
          >
            <option value="" disabled>Wybierz port...</option>
            {ports.map(p => (
              <option key={p.index} value={p.index}>{p.name}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-slate-500">Brak dostępnych portów MIDI</span>
        )}
      </FieldRow>
      <FieldRow label="Test">
        <TestButton onClick={handleTest} label="Testuj wysyłanie" result={testResult} />
      </FieldRow>
      <SaveButton onClick={handleSave} />
    </div>
  );
}

// ── Zakładka: ATEM ──────────────────────────────────────

function AtemTab({ settings, onSave }: { settings: AtemSettings; onSave: (v: Partial<AtemSettings>) => void }) {
  const [ip, setIp] = useState(settings.ip);
  const [meIndex, setMeIndex] = useState(settings.meIndex);
  const [transitionType, setTransitionType] = useState(settings.transitionType);
  const [autoSwitch, setAutoSwitch] = useState(settings.autoSwitch);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [connectStatus, setConnectStatus] = useState<string | null>(null);

  const handleSave = () => {
    onSave({ ip, meIndex, transitionType, autoSwitch, enabled });
  };

  const handleConnect = async () => {
    try {
      // Najpierw zapisz IP
      await window.nextime.updateSettings('atem', { ip, enabled: true });
      await window.nextime.atemConfigure({ ip, meIndex, transitionType, autoSwitch, enabled: true });
      await window.nextime.atemConnect();
      setConnectStatus('Połączono');
      setEnabled(true);
    } catch (err) {
      setConnectStatus(`Błąd: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.nextime.atemDisconnect();
      setConnectStatus('Rozłączono');
    } catch (err) {
      setConnectStatus(`Błąd: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div>
      <SectionTitle>ATEM Vision Switcher</SectionTitle>
      <FieldRow label="Aktywny">
        <Toggle checked={enabled} onChange={setEnabled} label={enabled ? 'Włączony' : 'Wyłączony'} />
      </FieldRow>
      <FieldRow label="Adres IP">
        <TextInput value={ip} onChange={setIp} placeholder="192.168.10.240" />
      </FieldRow>
      <FieldRow label="ME Index">
        <NumberInput value={meIndex} onChange={setMeIndex} min={0} max={3} />
      </FieldRow>
      <FieldRow label="Typ przejścia">
        <select
          value={transitionType}
          onChange={e => setTransitionType(e.target.value as 'cut' | 'mix')}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="cut">Cut</option>
          <option value="mix">Mix</option>
        </select>
      </FieldRow>
      <FieldRow label="Auto-switch">
        <Toggle checked={autoSwitch} onChange={setAutoSwitch} label={autoSwitch ? 'Automatyczny' : 'Ręczny'} />
      </FieldRow>
      <FieldRow label="Połączenie">
        <div className="flex items-center gap-2">
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
          {connectStatus && (
            <span className={`text-xs ${connectStatus.startsWith('Błąd') ? 'text-red-400' : 'text-green-400'}`}>
              {connectStatus}
            </span>
          )}
        </div>
      </FieldRow>
      <SaveButton onClick={handleSave} />
    </div>
  );
}

// ── Zakładka: LTC ───────────────────────────────────────

function LtcTab({ settings, onSave }: { settings: LtcSettings; onSave: (v: Partial<LtcSettings>) => void }) {
  const [source, setSource] = useState(settings.source);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [mtcPorts, setMtcPorts] = useState<Array<{ index: number; name: string }>>([]);
  const [mtcPortIndex, setMtcPortIndex] = useState(settings.mtcPortIndex ?? -1);
  const [midiAvailable, setMidiAvailable] = useState(true);
  const [mtcStatus, setMtcStatus] = useState<string | null>(null);
  const [ltcStatus, setLtcStatus] = useState<{ lastTcFormatted: string | null; connected: boolean } | null>(null);

  useEffect(() => {
    window.nextime.ltcIsMidiAvailable().then(setMidiAvailable).catch(() => setMidiAvailable(false));
    window.nextime.ltcListMtcPorts().then(setMtcPorts).catch(() => setMtcPorts([]));
    window.nextime.getLtcStatus().then(s => setLtcStatus({ lastTcFormatted: s.lastTcFormatted ?? null, connected: s.connected })).catch(() => {});
  }, []);

  // Odświeżaj status TC co 500ms gdy połączony
  useEffect(() => {
    if (source !== 'mtc') return;
    const interval = setInterval(() => {
      window.nextime.getLtcStatus().then(s => {
        setLtcStatus({ lastTcFormatted: s.lastTcFormatted ?? null, connected: s.connected });
      }).catch(() => {});
    }, 500);
    return () => clearInterval(interval);
  }, [source]);

  const handleSave = async () => {
    onSave({ source, enabled, mtcPortIndex });
    await window.nextime.setLtcSource(source);
  };

  const handleConnectMtc = async () => {
    if (mtcPortIndex < 0) return;
    const result = await window.nextime.ltcConnectMtc(mtcPortIndex);
    if (result.ok) {
      setMtcStatus('Połączono');
      // Ustaw źródło na MTC automatycznie
      setSource('mtc');
      await window.nextime.setLtcSource('mtc');
    } else {
      setMtcStatus(`Błąd: ${result.error ?? 'nieznany'}`);
    }
  };

  const handleDisconnectMtc = async () => {
    await window.nextime.ltcDisconnectMtc();
    setMtcStatus('Rozłączono');
    setLtcStatus(null);
  };

  return (
    <div>
      <SectionTitle>LTC / Timecode</SectionTitle>
      <FieldRow label="Aktywny">
        <Toggle checked={enabled} onChange={setEnabled} label={enabled ? 'Włączony' : 'Wyłączony'} />
      </FieldRow>
      <FieldRow label="Źródło TC">
        <select
          value={source}
          onChange={e => setSource(e.target.value as 'internal' | 'ltc' | 'mtc' | 'manual')}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="internal">Wewnętrzny</option>
          <option value="ltc">LTC (audio)</option>
          <option value="mtc">MTC (MIDI Timecode)</option>
          <option value="manual">Ręczny</option>
        </select>
      </FieldRow>

      {/* Sekcja MTC — widoczna gdy source = mtc */}
      {source === 'mtc' && (
        <>
          {!midiAvailable && (
            <div className="mb-3 px-3 py-2 bg-yellow-600/20 border border-yellow-600/30 rounded text-xs text-yellow-400">
              Moduł MIDI niedostępny — zainstaluj @julusian/midi
            </div>
          )}
          <FieldRow label="Port MIDI Input">
            {mtcPorts.length > 0 ? (
              <select
                value={mtcPortIndex}
                onChange={e => setMtcPortIndex(Number(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value={-1}>Wybierz port...</option>
                {mtcPorts.map(p => (
                  <option key={p.index} value={p.index}>{p.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-slate-500">Brak dostępnych portów MIDI Input</span>
            )}
          </FieldRow>
          <FieldRow label="Połączenie MTC">
            <div className="flex items-center gap-2">
              <button
                onClick={handleConnectMtc}
                disabled={mtcPortIndex < 0 || !midiAvailable}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
              >
                Połącz
              </button>
              <button
                onClick={handleDisconnectMtc}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
              >
                Rozłącz
              </button>
              {mtcStatus && (
                <span className={`text-xs ${mtcStatus.startsWith('Błąd') ? 'text-red-400' : 'text-green-400'}`}>
                  {mtcStatus}
                </span>
              )}
            </div>
          </FieldRow>
          {ltcStatus?.connected && ltcStatus.lastTcFormatted && (
            <FieldRow label="Aktualny TC">
              <span className="text-sm font-mono text-green-400 bg-slate-900 px-3 py-1.5 rounded">
                {ltcStatus.lastTcFormatted}
              </span>
            </FieldRow>
          )}
        </>
      )}

      <SaveButton onClick={handleSave} />
    </div>
  );
}

// ── Zakładka: GPI ───────────────────────────────────────

function GpiTab({ settings, onSave }: { settings: GpiSettings; onSave: (v: Partial<GpiSettings>) => void }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [defaultPulseMs, setDefaultPulseMs] = useState(settings.defaultPulseMs);
  const [portPath, setPortPath] = useState(settings.portPath);
  const [baudRate, setBaudRate] = useState(settings.baudRate);
  const [ports, setPorts] = useState<Array<{ path: string; friendlyName?: string }>>([]);
  const [serialAvailable, setSerialAvailable] = useState(true);
  const [portOpen, setPortOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    window.nextime.gpiIsAvailable().then(setSerialAvailable).catch(() => setSerialAvailable(false));
    window.nextime.gpiListPorts().then(setPorts).catch(() => setPorts([]));
  }, []);

  const handleSave = () => {
    onSave({ enabled, defaultPulseMs, portPath, baudRate });
  };

  const handleOpenPort = async () => {
    if (!portPath) return;
    const result = await window.nextime.gpiOpenPort(portPath, baudRate);
    if (result.ok) {
      setPortOpen(true);
      setTestResult({ ok: true });
    } else {
      setTestResult({ ok: false, error: result.error });
    }
  };

  const handleClosePort = async () => {
    await window.nextime.gpiClosePort();
    setPortOpen(false);
    setTestResult(null);
  };

  const handleTest = async () => {
    setTestResult(null);
    const result = await window.nextime.gpiTestSend();
    setTestResult(result);
  };

  return (
    <div>
      <SectionTitle>GPI (General Purpose Interface)</SectionTitle>
      {!serialAvailable && (
        <div className="mb-3 px-3 py-2 bg-yellow-600/20 border border-yellow-600/30 rounded text-xs text-yellow-400">
          Moduł serialport niedostępny — zainstaluj pakiet serialport
        </div>
      )}
      <FieldRow label="Aktywny">
        <Toggle checked={enabled} onChange={setEnabled} label={enabled ? 'Włączony' : 'Wyłączony'} />
      </FieldRow>
      <FieldRow label="Domyślny impuls (ms)">
        <NumberInput value={defaultPulseMs} onChange={setDefaultPulseMs} min={10} max={5000} />
      </FieldRow>
      <FieldRow label="Port serial">
        {ports.length > 0 ? (
          <select
            value={portPath}
            onChange={e => setPortPath(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">Wybierz port...</option>
            {ports.map(p => (
              <option key={p.path} value={p.path}>
                {p.path}{p.friendlyName ? ` (${p.friendlyName})` : ''}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-slate-500">Brak dostępnych portów serial</span>
        )}
      </FieldRow>
      <FieldRow label="Baud rate">
        <select
          value={baudRate}
          onChange={e => setBaudRate(Number(e.target.value))}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          {[9600, 19200, 38400, 57600, 115200].map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="Połączenie">
        <div className="flex items-center gap-2">
          {!portOpen ? (
            <button
              onClick={handleOpenPort}
              disabled={!portPath || !serialAvailable}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
            >
              Otwórz port
            </button>
          ) : (
            <button
              onClick={handleClosePort}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
            >
              Zamknij port
            </button>
          )}
          <span className={`text-xs ${portOpen ? 'text-green-400' : 'text-slate-500'}`}>
            {portOpen ? 'Otwarty' : 'Zamknięty'}
          </span>
        </div>
      </FieldRow>
      <FieldRow label="Test">
        <TestButton onClick={handleTest} label="Testuj trigger" result={testResult} />
      </FieldRow>
      <SaveButton onClick={handleSave} />
    </div>
  );
}

// ── Zakładka: PTZ ───────────────────────────────────────

function PtzTab({ settings, onSave }: { settings: PtzSettings; onSave: (v: Partial<PtzSettings>) => void }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [cameras, setCameras] = useState(settings.cameras);
  const [cameraStatuses, setCameraStatuses] = useState<Array<{ cameraNumber: number; connected: boolean }>>([]);
  const [connectResult, setConnectResult] = useState<Record<number, string>>({});

  // Odświeżaj statusy kamer
  useEffect(() => {
    const refresh = () => {
      window.nextime.ptzGetStatus().then(setCameraStatuses).catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = () => {
    onSave({ enabled, cameras });
  };

  const addCamera = () => {
    const nextNum = cameras.length > 0 ? Math.max(...cameras.map(c => c.number)) + 1 : 1;
    setCameras([...cameras, { number: nextNum, ip: '', port: 52381, protocol: 'visca_ip' as const }]);
  };

  const removeCamera = (index: number) => {
    setCameras(cameras.filter((_, i) => i !== index));
  };

  type CameraField = 'ip' | 'port' | 'number' | 'protocol' | 'serialPath' | 'serialBaudRate' | 'ndiSourceName' | 'onvifProfileToken' | 'onvifUsername' | 'onvifPassword';

  const updateCamera = (index: number, field: CameraField, value: string | number) => {
    const updated = [...cameras];
    const cam = { ...updated[index]! };
    if (field === 'ip') cam.ip = value as string;
    else if (field === 'port') cam.port = value as number;
    else if (field === 'number') cam.number = value as number;
    else if (field === 'protocol') cam.protocol = value as PtzSettings['cameras'][0]['protocol'];
    else if (field === 'serialPath') cam.serialPath = value as string;
    else if (field === 'serialBaudRate') cam.serialBaudRate = value as number;
    else if (field === 'ndiSourceName') cam.ndiSourceName = value as string;
    else if (field === 'onvifProfileToken') cam.onvifProfileToken = value as string;
    else if (field === 'onvifUsername') cam.onvifUsername = value as string;
    else if (field === 'onvifPassword') cam.onvifPassword = value as string;
    updated[index] = cam;
    setCameras(updated);
  };

  const handleConnect = async (cameraNumber: number) => {
    // Najpierw zapisz aktualne ustawienia
    await window.nextime.updateSettings('ptz', { enabled, cameras });
    const result = await window.nextime.ptzConnect(cameraNumber);
    setConnectResult(prev => ({ ...prev, [cameraNumber]: result.ok ? 'Połączono' : `Błąd: ${result.error ?? ''}` }));
  };

  const handleDisconnect = async (cameraNumber: number) => {
    await window.nextime.ptzDisconnect(cameraNumber);
    setConnectResult(prev => ({ ...prev, [cameraNumber]: 'Rozłączono' }));
  };

  const handleTestPreset = async (cameraNumber: number) => {
    const result = await window.nextime.ptzRecallPreset(cameraNumber, 1);
    setConnectResult(prev => ({ ...prev, [cameraNumber]: result.ok ? 'Preset 1 OK' : `Błąd: ${result.error ?? ''}` }));
  };

  const getCamStatus = (num: number) => cameraStatuses.find(s => s.cameraNumber === num);

  return (
    <div>
      <SectionTitle>PTZ (Pan-Tilt-Zoom)</SectionTitle>
      <FieldRow label="Aktywny">
        <Toggle checked={enabled} onChange={setEnabled} label={enabled ? 'Włączony' : 'Wyłączony'} />
      </FieldRow>
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-400">Kamery PTZ</span>
          <button
            onClick={addCamera}
            className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs rounded transition-colors"
          >
            + Dodaj kamerę
          </button>
        </div>
        {cameras.length === 0 ? (
          <p className="text-xs text-slate-500">Brak skonfigurowanych kamer PTZ.</p>
        ) : (
          <div className="space-y-3">
            {cameras.map((cam, i) => {
              const status = getCamStatus(cam.number);
              const statusMsg = connectResult[cam.number];
              return (
                <div key={i} className="bg-slate-700/50 rounded px-3 py-2 space-y-2">
                  {/* Wiersz 1: numer, protokół, status, usuń */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-8">#{cam.number}</span>
                    <select
                      value={cam.protocol}
                      onChange={e => updateCamera(i, 'protocol', e.target.value)}
                      className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="visca_ip">VISCA IP</option>
                      <option value="visca_serial">VISCA Serial</option>
                      <option value="onvif">ONVIF</option>
                      <option value="ndi">NDI HTTP (PTZOptics)</option>
                      <option value="panasonic_http">Panasonic HTTP (AW-HE/AW-UE)</option>
                    </select>
                    <span className={`w-2 h-2 rounded-full ${status?.connected ? 'bg-green-400' : 'bg-red-400'}`} title={status?.connected ? 'Połączono' : 'Rozłączono'} />
                    <div className="flex-1" />
                    <button
                      onClick={() => removeCamera(i)}
                      className="text-red-400 hover:text-red-300 text-xs px-1"
                      title="Usuń kamerę"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Wiersz 2: konfiguracja zależna od protokołu */}
                  {(cam.protocol === 'visca_ip' || cam.protocol === 'onvif' || cam.protocol === 'ndi' || cam.protocol === 'panasonic_http') && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={cam.ip}
                        onChange={e => updateCamera(i, 'ip', e.target.value)}
                        placeholder="IP kamery"
                        className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="number"
                        value={cam.port}
                        onChange={e => updateCamera(i, 'port', Number(e.target.value))}
                        min={1}
                        max={65535}
                        className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}

                  {cam.protocol === 'visca_serial' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={cam.serialPath ?? ''}
                        onChange={e => updateCamera(i, 'serialPath', e.target.value)}
                        placeholder="Port serial (np. COM3)"
                        className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <select
                        value={cam.serialBaudRate ?? 9600}
                        onChange={e => updateCamera(i, 'serialBaudRate', Number(e.target.value))}
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                      >
                        {[9600, 19200, 38400].map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {cam.protocol === 'onvif' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={cam.onvifUsername ?? ''}
                        onChange={e => updateCamera(i, 'onvifUsername', e.target.value)}
                        placeholder="ONVIF login"
                        className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="password"
                        value={cam.onvifPassword ?? ''}
                        onChange={e => updateCamera(i, 'onvifPassword', e.target.value)}
                        placeholder="Hasło"
                        className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}

                  {/* Wiersz 3: przyciski */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleConnect(cam.number)}
                      className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded transition-colors"
                    >
                      Połącz
                    </button>
                    <button
                      onClick={() => handleDisconnect(cam.number)}
                      className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition-colors"
                    >
                      Rozłącz
                    </button>
                    <button
                      onClick={() => handleTestPreset(cam.number)}
                      className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs rounded transition-colors"
                    >
                      Test Preset 1
                    </button>
                    {statusMsg && (
                      <span className={`text-xs ${statusMsg.startsWith('Błąd') ? 'text-red-400' : 'text-green-400'}`}>
                        {statusMsg}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <SaveButton onClick={handleSave} />
    </div>
  );
}
