import { useState, useEffect, useCallback, useMemo } from 'react';

// ── Typy (lokalne kopie — unikamy importu z electron/) ───

interface OscArgDef {
  name: string;
  type: 'i' | 'f' | 's' | 'b';
  default?: number | string | boolean;
  min?: number;
  max?: number;
}

interface OscCommand {
  name: string;
  label: string;
  address: string;
  args: OscArgDef[];
}

interface OscSchema {
  device: string;
  label: string;
  commands: OscCommand[];
}

// ── Dane wyjściowe z edytora ─────────────────────────────

export interface OscCueData {
  /** Identyfikator urządzenia (np. 'disguise', 'qlab', 'generic') */
  device: string;
  /** Nazwa wybranej komendy */
  command_name: string;
  /** Finalny adres OSC (po podstawieniu placeholderów) */
  address: string;
  /** Argumenty OSC w formacie [{type, value}] */
  args: Array<{ type: 'i' | 'f' | 's' | 'b'; value: number | string | boolean }>;
  /** Host docelowy (override per cue) */
  host: string;
  /** Port docelowy (override per cue) */
  port: number;
}

export interface OscCueEditorProps {
  /** Istniejące dane cue (tryb edycji lub kompatybilność wsteczna) */
  existingData: Record<string, unknown>;
  /** Callback — wywoływany przy każdej zmianie */
  onChange: (data: OscCueData) => void;
}

/** Buduje adres OSC z placeholderami podstawionymi z wartości argumentów */
function buildAddress(template: string, argValues: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const val = argValues[name];
    return val !== undefined ? String(val) : `{${name}}`;
  });
}

/** Komponent edytora OSC cue z obsługą schematów urządzeń */
export function OscCueEditor({ existingData, onChange }: OscCueEditorProps) {
  const [schemas, setSchemas] = useState<OscSchema[]>([]);
  const [loading, setLoading] = useState(true);

  // Stan edytora
  const [device, setDevice] = useState<string>((existingData.device as string) ?? 'generic');
  const [commandName, setCommandName] = useState<string>((existingData.command_name as string) ?? 'custom');
  const [host, setHost] = useState<string>((existingData.host as string) ?? '127.0.0.1');
  const [port, setPort] = useState<number>((existingData.port as number) ?? 8000);

  // Argumenty — przechowywane jako Record<argName, value>
  const [argValues, setArgValues] = useState<Record<string, number | string | boolean>>(() => {
    // Odtwórz wartości z istniejących danych
    const existing = existingData.arg_values as Record<string, number | string | boolean> | undefined;
    if (existing && typeof existing === 'object') return { ...existing };
    return {};
  });

  // Surowy tryb (kompatybilność wsteczna — cue'y bez device)
  const [rawAddress, setRawAddress] = useState<string>((existingData.address as string) ?? '');
  const [rawArgs, setRawArgs] = useState<string>(() => {
    const args = existingData.args;
    if (Array.isArray(args)) return JSON.stringify(args);
    return '[]';
  });

  // Załaduj schematy z main process
  useEffect(() => {
    const win = window as unknown as { nextime?: { getOscSchemas?: () => Promise<OscSchema[]> } };
    if (win.nextime?.getOscSchemas) {
      win.nextime.getOscSchemas()
        .then((loaded) => {
          setSchemas(loaded);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Aktualny schemat i komenda
  const currentSchema = useMemo(() => schemas.find(s => s.device === device), [schemas, device]);
  const currentCommand = useMemo(() => currentSchema?.commands.find(c => c.name === commandName), [currentSchema, commandName]);

  // Czy tryb surowy (generic lub brak schematu lub brak device w danych)
  const isRawMode = device === 'generic' || !currentSchema;

  // Inicjalizuj domyślne wartości argumentów gdy zmieni się komenda
  useEffect(() => {
    if (!currentCommand) return;
    const defaults: Record<string, number | string | boolean> = {};
    let needsUpdate = false;
    for (const arg of currentCommand.args) {
      if (argValues[arg.name] === undefined && arg.default !== undefined) {
        defaults[arg.name] = arg.default;
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      setArgValues(prev => ({ ...prev, ...defaults }));
    }
  }, [currentCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  // Emituj onChange przy każdej zmianie danych
  const emitChange = useCallback(() => {
    if (isRawMode) {
      // Tryb surowy — zwróć adres + args jako JSON
      let parsedArgs: Array<{ type: 'i' | 'f' | 's' | 'b'; value: number | string | boolean }> = [];
      try { parsedArgs = JSON.parse(rawArgs); } catch { /* ignoruj */ }
      onChange({
        device: 'generic',
        command_name: 'custom',
        address: rawAddress,
        args: parsedArgs,
        host,
        port,
      });
    } else if (currentCommand) {
      // Tryb schematowy — zbuduj adres z wzorca i wartości
      const finalAddress = buildAddress(currentCommand.address, argValues);
      const oscArgs = currentCommand.args.map(argDef => ({
        type: argDef.type,
        value: argValues[argDef.name] ?? argDef.default ?? (argDef.type === 's' ? '' : argDef.type === 'b' ? false : 0),
      }));
      onChange({
        device,
        command_name: commandName,
        address: finalAddress,
        args: oscArgs,
        host,
        port,
        // Zapisz wartości argumentów do odtworzenia w edycji
        ...({ arg_values: { ...argValues } } as Record<string, unknown>),
      } as OscCueData);
    }
  }, [isRawMode, rawAddress, rawArgs, host, port, device, commandName, currentCommand, argValues, onChange]);

  useEffect(() => {
    emitChange();
  }, [device, commandName, argValues, rawAddress, rawArgs, host, port]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlery zmian ──────────────────────────────────────

  const handleDeviceChange = (newDevice: string) => {
    setDevice(newDevice);
    const schema = schemas.find(s => s.device === newDevice);
    if (schema && schema.commands.length > 0) {
      setCommandName(schema.commands[0]!.name);
      // Resetuj argumenty do domyślnych
      const defaults: Record<string, number | string | boolean> = {};
      for (const arg of schema.commands[0]!.args) {
        if (arg.default !== undefined) defaults[arg.name] = arg.default;
      }
      setArgValues(defaults);
    } else {
      setCommandName('custom');
      setArgValues({});
    }
  };

  const handleCommandChange = (newCmdName: string) => {
    setCommandName(newCmdName);
    const cmd = currentSchema?.commands.find(c => c.name === newCmdName);
    if (cmd) {
      const defaults: Record<string, number | string | boolean> = {};
      for (const arg of cmd.args) {
        if (arg.default !== undefined) defaults[arg.name] = arg.default;
      }
      setArgValues(defaults);
    }
  };

  const handleArgChange = (argName: string, value: number | string | boolean) => {
    setArgValues(prev => ({ ...prev, [argName]: value }));
  };

  // ── Renderowanie ────────────────────────────────────────

  if (loading) {
    return <div className="text-xs text-slate-400">Ładowanie schematów OSC...</div>;
  }

  return (
    <>
      {/* Host + Port */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-[10px] text-slate-500 block mb-0.5">Host</label>
          <input
            value={host}
            onChange={e => setHost(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none"
            placeholder="127.0.0.1"
          />
        </div>
        <div className="w-24">
          <label className="text-[10px] text-slate-500 block mb-0.5">Port</label>
          <input
            type="number"
            min={1} max={65535}
            value={port}
            onChange={e => setPort(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none"
          />
        </div>
      </div>

      {/* Urządzenie */}
      <div>
        <label className="text-[10px] text-slate-500 block mb-0.5">Urządzenie</label>
        <select
          value={device}
          onChange={e => handleDeviceChange(e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
        >
          {schemas.map(s => (
            <option key={s.device} value={s.device}>{s.label}</option>
          ))}
          {/* Fallback jeśli brak schematów */}
          {schemas.length === 0 && (
            <option value="generic">Własny (surowy OSC)</option>
          )}
        </select>
      </div>

      {/* Komenda (tylko w trybie schematowym) */}
      {!isRawMode && currentSchema && (
        <div>
          <label className="text-[10px] text-slate-500 block mb-0.5">Komenda</label>
          <select
            value={commandName}
            onChange={e => handleCommandChange(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
          >
            {currentSchema.commands.map(cmd => (
              <option key={cmd.name} value={cmd.name}>{cmd.label}</option>
            ))}
          </select>
          {currentCommand && (
            <span className="text-[9px] text-slate-600 font-mono">
              {currentCommand.address}
            </span>
          )}
        </div>
      )}

      {/* Argumenty dynamiczne (tryb schematowy) */}
      {!isRawMode && currentCommand && currentCommand.args.length > 0 && (
        <div className="space-y-2">
          <label className="text-[10px] text-slate-500 block">Argumenty</label>
          {currentCommand.args.map(argDef => (
            <div key={argDef.name} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-28 truncate" title={argDef.name}>
                {argDef.name}
                <span className="text-slate-600 ml-1">({argDef.type})</span>
              </span>
              {renderArgInput(argDef, argValues[argDef.name], handleArgChange)}
            </div>
          ))}
        </div>
      )}

      {/* Tryb surowy (generic) */}
      {isRawMode && (
        <>
          <div>
            <label className="text-[10px] text-slate-500 block mb-0.5">Adres OSC</label>
            <input
              value={rawAddress}
              onChange={e => setRawAddress(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none"
              placeholder="/layer/1/opacity"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 block mb-0.5">Argumenty (JSON)</label>
            <input
              value={rawArgs}
              onChange={e => setRawArgs(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none"
              placeholder='[{"type":"f","value":1.0}]'
            />
            <span className="text-[9px] text-slate-600">{'Format: [{"type":"f","value":1.0}]  Typy: i=int, f=float, s=string, b=bool'}</span>
          </div>
        </>
      )}
    </>
  );
}

// ── Renderowanie pola argumentu ──────────────────────────

function renderArgInput(
  argDef: OscArgDef,
  value: number | string | boolean | undefined,
  onChange: (name: string, value: number | string | boolean) => void,
) {
  const currentValue = value ?? argDef.default ?? (argDef.type === 's' ? '' : argDef.type === 'b' ? false : 0);

  switch (argDef.type) {
    case 'i':
      return (
        <input
          type="number"
          step={1}
          min={argDef.min}
          max={argDef.max}
          value={currentValue as number}
          onChange={e => onChange(argDef.name, parseInt(e.target.value, 10) || 0)}
          className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-0.5 text-xs text-slate-200 font-mono focus:outline-none"
        />
      );
    case 'f':
      return (
        <input
          type="number"
          step={0.01}
          min={argDef.min}
          max={argDef.max}
          value={currentValue as number}
          onChange={e => onChange(argDef.name, parseFloat(e.target.value) || 0)}
          className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-0.5 text-xs text-slate-200 font-mono focus:outline-none"
        />
      );
    case 's':
      return (
        <input
          type="text"
          value={currentValue as string}
          onChange={e => onChange(argDef.name, e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-0.5 text-xs text-slate-200 font-mono focus:outline-none"
          placeholder="..."
        />
      );
    case 'b':
      return (
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(currentValue)}
            onChange={e => onChange(argDef.name, e.target.checked)}
            className="accent-blue-500"
          />
          <span className="text-[10px] text-slate-400">{currentValue ? 'TAK' : 'NIE'}</span>
        </label>
      );
  }
}
