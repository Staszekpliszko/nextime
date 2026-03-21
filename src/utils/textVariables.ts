/**
 * Podstawia zmienne tekstowe w tekście.
 * Zamienia $klucz na wartość z mapy zmiennych.
 * Klucze: [a-z0-9-]+
 *
 * Przykład: substituteVariables("Witaj $host-name!", { "host-name": "Jan" }) → "Witaj Jan!"
 */
export function substituteVariables(text: string, variableMap: Record<string, string>): string {
  if (!text) return text;

  // Szukaj $klucz (klucze: a-z, 0-9, -)
  return text.replace(/\$([a-z0-9-]+)/g, (_match: string, key: string): string => {
    if (key in variableMap) return variableMap[key] as string;
    return `$${key}`;
  });
}

/**
 * Tworzy mapę klucz→wartość z tablicy TextVariableInfo.
 */
export function buildVariableMap(variables: Array<{ key: string; value: string }>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const v of variables) {
    map[v.key] = v.value;
  }
  return map;
}

/**
 * Wyciąga plain text z TipTap/ProseMirror JSON document.
 * Obsługuje TextVariableMark — zamienia mark na wartość zmiennej z mapy.
 * Używane w: RundownTable (render readonly), Prompter, CueApp.
 */
export function extractPlainTextFromRichtext(
  doc: unknown,
  variableMap?: Record<string, string>,
): string {
  if (!doc || typeof doc !== 'object') return '';
  const d = doc as Record<string, unknown>;

  // Prosty tekst (string)
  if (typeof d === 'string') return d as unknown as string;

  // Tekst node — sprawdź marki textVariable
  if (d.type === 'text' && typeof d.text === 'string') {
    const marks = d.marks as Array<{ type: string; attrs?: Record<string, unknown> }> | undefined;
    if (marks && variableMap) {
      const varMark = marks.find(m => m.type === 'textVariable');
      if (varMark && typeof varMark.attrs?.key === 'string') {
        const key = varMark.attrs.key as string;
        return variableMap[key] ?? `$${key}`;
      }
    }
    return d.text;
  }

  // hardBreak → newline
  if (d.type === 'hardBreak') return '\n';

  // Rekursywnie przejdź content
  if (Array.isArray(d.content)) {
    const parts = d.content.map((node: unknown) =>
      extractPlainTextFromRichtext(node, variableMap)
    );
    // Paragrafy oddzielone newline
    if (d.type === 'doc') return parts.join('\n');
    return parts.join('');
  }

  return '';
}
