// ── vMix XML API Parser ─────────────────────────────────
// Parsuje odpowiedź XML z vMix HTTP API (/api/) na struktury TypeScript.
// Brak zewnętrznych zależności — użycie prostego regex parsingu
// (Node.js nie ma DOMParser, unikamy dodatkowych deps).

// ── Typy ────────────────────────────────────────────────

/** Pojedynczy input w vMix */
export interface VmixInput {
  /** Numer inputu (Key w vMix, 1-based) */
  number: number;
  /** Tytuł/nazwa inputu */
  title: string;
  /** Typ inputu (np. 'Colour', 'Video', 'Camera', 'Image', 'AudioFile') */
  type: string;
  /** Stan odtwarzania (np. 'Running', 'Paused', 'Completed') */
  state: string;
  /** Pozycja odtwarzania w ms (dla mediów) */
  position: number;
  /** Czas trwania w ms (dla mediów) */
  duration: number;
  /** Czy pętla jest włączona */
  loop: boolean;
}

/** Pełny stan vMix odczytany z XML API */
export interface VmixState {
  /** Numer aktywnego inputu na Program (PGM) */
  activeInput: number | null;
  /** Numer inputu na Preview (PRV) */
  previewInput: number | null;
  /** Lista wszystkich inputów */
  inputs: VmixInput[];
  /** Czy streaming jest aktywny */
  streaming: boolean;
  /** Czy nagrywanie jest aktywne */
  recording: boolean;
  /** Wersja vMix */
  version: string;
  /** Edycja vMix (np. '4K', 'Pro', 'HD') */
  edition: string;
}

// ── Helpery regex ───────────────────────────────────────

/** Wyciąga zawartość tagu XML — pierwszy match */
function extractTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[1]!.trim() : null;
}

/** Wyciąga atrybut z tagu XML */
function extractAttribute(tag: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const match = regex.exec(tag);
  return match ? match[1]! : null;
}

/** Wyciąga wszystkie wystąpienia tagu (pełny tag z atrybutami) */
function extractAllTags(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*(?:>[\\s\\S]*?</${tagName}>|/>)`, 'gi');
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[0]!);
  }
  return matches;
}

/** Wyciąga zawartość między otwierającym a zamykającym tagiem (tekst wewnętrzny) */
function extractInnerText(tag: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = regex.exec(tag);
  return match ? match[1]!.trim() : '';
}

// ── Parser ──────────────────────────────────────────────

/**
 * Parsuje XML odpowiedź z vMix HTTP API (/api/) na VmixState.
 *
 * Przykład XML: https://www.vmix.com/help27/DeveloperAPI.html
 *
 * @param xml Surowy XML z vMix API
 * @returns Sparsowany stan vMix
 */
export function parseVmixXml(xml: string): VmixState {
  const state: VmixState = {
    activeInput: null,
    previewInput: null,
    inputs: [],
    streaming: false,
    recording: false,
    version: '',
    edition: '',
  };

  // Wersja i edycja
  state.version = extractTag(xml, 'version') ?? '';
  state.edition = extractTag(xml, 'edition') ?? '';

  // Streaming / Recording
  const streamingStr = extractTag(xml, 'streaming');
  state.streaming = streamingStr?.toLowerCase() === 'true';

  const recordingStr = extractTag(xml, 'recording');
  state.recording = recordingStr?.toLowerCase() === 'true';

  // Aktywny input (Program)
  const activeStr = extractTag(xml, 'active');
  if (activeStr !== null) {
    const num = parseInt(activeStr, 10);
    if (!isNaN(num)) state.activeInput = num;
  }

  // Preview input
  const previewStr = extractTag(xml, 'preview');
  if (previewStr !== null) {
    const num = parseInt(previewStr, 10);
    if (!isNaN(num)) state.previewInput = num;
  }

  // Inputy — każdy <input> tag
  const inputTags = extractAllTags(xml, 'input');
  for (const inputTag of inputTags) {
    const input = parseInputTag(inputTag);
    if (input) {
      state.inputs.push(input);
    }
  }

  return state;
}

/** Parsuje pojedynczy <input> tag na VmixInput */
function parseInputTag(tag: string): VmixInput | null {
  // Atrybuty tagu <input>
  const keyStr = extractAttribute(tag, 'key');
  const numberStr = extractAttribute(tag, 'number');
  const type = extractAttribute(tag, 'type') ?? 'Unknown';
  const title = extractAttribute(tag, 'title') ?? extractInnerText(tag, 'input');
  const state = extractAttribute(tag, 'state') ?? '';
  const posStr = extractAttribute(tag, 'position');
  const durStr = extractAttribute(tag, 'duration');
  const loopStr = extractAttribute(tag, 'loop');

  // Numer inputu — preferuj 'number', fallback na 'key'
  const numParsed = numberStr ? parseInt(numberStr, 10) : (keyStr ? parseInt(keyStr, 10) : NaN);
  if (isNaN(numParsed)) return null;

  return {
    number: numParsed,
    title: title || `Input ${numParsed}`,
    type,
    state,
    position: posStr ? parseInt(posStr, 10) || 0 : 0,
    duration: durStr ? parseInt(durStr, 10) || 0 : 0,
    loop: loopStr?.toLowerCase() === 'true',
  };
}
