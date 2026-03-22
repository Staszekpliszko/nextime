import fs from 'fs';
import path from 'path';

// ── Typy OSC Schema ─────────────────────────────────────

/** Definicja argumentu komendy OSC */
export interface OscArgDef {
  /** Nazwa argumentu (wyświetlana w UI) */
  name: string;
  /** Typ OSC: i=int32, f=float32, s=string, b=boolean */
  type: 'i' | 'f' | 's' | 'b';
  /** Wartość domyślna */
  default?: number | string | boolean;
  /** Min (dla i/f) */
  min?: number;
  /** Max (dla i/f) */
  max?: number;
}

/** Definicja jednej komendy OSC w schemacie */
export interface OscCommand {
  /** Identyfikator komendy (unikalny w schemacie) */
  name: string;
  /** Etykieta wyświetlana w UI */
  label: string;
  /** Wzorzec adresu OSC (może zawierać {placeholder}) */
  address: string;
  /** Lista argumentów */
  args: OscArgDef[];
}

/** Schemat OSC dla jednego urządzenia */
export interface OscSchema {
  /** Identyfikator urządzenia (nazwa pliku bez .json) */
  device: string;
  /** Etykieta wyświetlana w dropdown UI */
  label: string;
  /** Lista dostępnych komend */
  commands: OscCommand[];
}

// ── Walidacja schematu ──────────────────────────────────

const VALID_ARG_TYPES = new Set(['i', 'f', 's', 'b']);

/** Waliduje pojedynczy schemat załadowany z JSON */
function validateSchema(data: unknown, fileName: string): OscSchema | null {
  if (!data || typeof data !== 'object') {
    console.warn(`[OscSchemaLoader] Pominięto ${fileName}: nie jest obiektem`);
    return null;
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.device !== 'string' || !obj.device) {
    console.warn(`[OscSchemaLoader] Pominięto ${fileName}: brak pola 'device'`);
    return null;
  }

  if (typeof obj.label !== 'string' || !obj.label) {
    console.warn(`[OscSchemaLoader] Pominięto ${fileName}: brak pola 'label'`);
    return null;
  }

  if (!Array.isArray(obj.commands)) {
    console.warn(`[OscSchemaLoader] Pominięto ${fileName}: brak tablicy 'commands'`);
    return null;
  }

  const validCommands: OscCommand[] = [];

  for (const cmd of obj.commands) {
    if (!cmd || typeof cmd !== 'object') continue;
    const c = cmd as Record<string, unknown>;

    if (typeof c.name !== 'string' || !c.name) continue;
    if (typeof c.label !== 'string') continue;
    if (typeof c.address !== 'string') continue;

    const args: OscArgDef[] = [];
    if (Array.isArray(c.args)) {
      for (const arg of c.args) {
        if (!arg || typeof arg !== 'object') continue;
        const a = arg as Record<string, unknown>;
        if (typeof a.name !== 'string' || !a.name) continue;
        if (typeof a.type !== 'string' || !VALID_ARG_TYPES.has(a.type)) continue;

        args.push({
          name: a.name,
          type: a.type as OscArgDef['type'],
          default: a.default as OscArgDef['default'],
          min: typeof a.min === 'number' ? a.min : undefined,
          max: typeof a.max === 'number' ? a.max : undefined,
        });
      }
    }

    validCommands.push({
      name: c.name,
      label: typeof c.label === 'string' ? c.label : c.name,
      address: c.address,
      args,
    });
  }

  if (validCommands.length === 0) {
    console.warn(`[OscSchemaLoader] Pominięto ${fileName}: brak prawidłowych komend`);
    return null;
  }

  return {
    device: obj.device,
    label: obj.label,
    commands: validCommands,
  };
}

// ── Ścieżka do katalogu schematów ───────────────────────

/** Zwraca ścieżkę do katalogu assets/osc-schemas/ */
export function getSchemasDir(): string {
  // Sprawdź czy jesteśmy w kontekście Electron (app.isPackaged)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app.isPackaged) {
      // Produkcja — pliki w process.resourcesPath/assets/osc-schemas
      return path.join(process.resourcesPath, 'assets', 'osc-schemas');
    }
    // Dev Electron — app.getAppPath() wskazuje na root projektu
    return path.join(app.getAppPath(), 'assets', 'osc-schemas');
  } catch {
    // Nie w Electron (np. testy vitest) — __dirname = electron/osc-schemas/
    return path.join(__dirname, '..', '..', 'assets', 'osc-schemas');
  }
}

// ── Cache ───────────────────────────────────────────────

let cachedSchemas: OscSchema[] | null = null;

/** Czyści cache (przydatne w testach) */
export function clearSchemaCache(): void {
  cachedSchemas = null;
}

// ── Publiczne API ───────────────────────────────────────

/**
 * Ładuje wszystkie schematy OSC z katalogu assets/osc-schemas/.
 * Wynik jest cachowany — drugie wywołanie zwraca ten sam array.
 */
export function loadSchemas(schemasDir?: string): OscSchema[] {
  if (cachedSchemas) return cachedSchemas;

  const dir = schemasDir ?? getSchemasDir();
  const schemas: OscSchema[] = [];

  if (!fs.existsSync(dir)) {
    console.warn(`[OscSchemaLoader] Katalog schematów nie istnieje: ${dir}`);
    cachedSchemas = schemas;
    return schemas;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const data = JSON.parse(content) as unknown;
      const schema = validateSchema(data, file);
      if (schema) {
        schemas.push(schema);
      }
    } catch (err) {
      console.warn(`[OscSchemaLoader] Błąd parsowania ${file}:`, err);
    }
  }

  // Upewnij się, że 'generic' jest na końcu listy
  const genericIdx = schemas.findIndex(s => s.device === 'generic');
  if (genericIdx >= 0 && genericIdx < schemas.length - 1) {
    const generic = schemas.splice(genericIdx, 1)[0]!;
    schemas.push(generic);
  }

  console.log(`[OscSchemaLoader] Załadowano ${schemas.length} schematów OSC: ${schemas.map(s => s.device).join(', ')}`);
  cachedSchemas = schemas;
  return schemas;
}

/**
 * Zwraca schemat OSC dla danego urządzenia.
 * Ładuje schematy jeśli jeszcze nie załadowane.
 */
export function getSchemaByDevice(device: string, schemasDir?: string): OscSchema | undefined {
  const schemas = loadSchemas(schemasDir);
  return schemas.find(s => s.device === device);
}

/**
 * Buduje finalny adres OSC z wzorca i argumentów.
 * Zamienia {placeholder} na wartości z args o tej samej nazwie.
 * np. "/channel/{channel}/layer/{layer}/play" + {channel: 1, layer: 10}
 *   → "/channel/1/layer/10/play"
 */
export function buildOscAddress(addressTemplate: string, argValues: Record<string, unknown>): string {
  return addressTemplate.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const val = argValues[name];
    return val !== undefined ? String(val) : `{${name}}`;
  });
}
