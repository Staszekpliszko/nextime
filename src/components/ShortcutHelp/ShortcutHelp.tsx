interface ShortcutHelpProps {
  onClose: () => void;
}

interface ShortcutEntry {
  key: string;
  description: string;
  mode: 'global' | 'rundown' | 'timeline';
}

const SHORTCUTS: ShortcutEntry[] = [
  // Globalne
  { key: 'Space', description: 'Play / Pause', mode: 'global' },
  { key: 'Escape', description: 'Odznacz cue / zamknij panel', mode: 'global' },
  { key: '?', description: 'Pomoc skrótów klawiszowych', mode: 'global' },
  { key: 'Ctrl+Z', description: 'Cofnij ostatnią operację', mode: 'global' },
  { key: 'Ctrl+Shift+Z', description: 'Przywróć cofniętą operację', mode: 'global' },

  // Rundown
  { key: 'Click', description: 'Goto cue', mode: 'rundown' },
  { key: 'Double-click', description: 'Edycja inline tytułu/podtytułu', mode: 'rundown' },
  { key: 'Delete', description: 'Usuń zaznaczony cue', mode: 'rundown' },
  { key: 'Ctrl+D', description: 'Duplikuj zaznaczony cue', mode: 'rundown' },
  { key: 'Ctrl+Enter', description: 'Wstaw nowy cue poniżej', mode: 'rundown' },
  { key: 'Prawy klik', description: 'Menu kontekstowe cue', mode: 'rundown' },

  // Timeline
  { key: 'F3', description: 'Toggle Step Mode', mode: 'timeline' },
  { key: 'F8', description: 'Take Next Shot', mode: 'timeline' },
  { key: 'F9', description: 'Toggle Hold Mode', mode: 'timeline' },
  { key: 'J', description: 'Step do nastepnego cue', mode: 'timeline' },
  { key: 'F1', description: 'Zmien zrodlo TC (INT/LTC/MTC/MAN)', mode: 'timeline' },
  { key: '\u2190 / \u2192', description: 'Scrub \u00B11 klatka', mode: 'timeline' },
  { key: 'Shift + \u2190/\u2192', description: 'Scrub \u00B110 klatek', mode: 'timeline' },
  { key: 'Ctrl + \u2190/\u2192', description: 'Przesun cue \u00B11 klatka', mode: 'timeline' },
  { key: 'Ctrl+Shift + \u2190/\u2192', description: 'Przesun cue \u00B110 klatek', mode: 'timeline' },
  { key: 'Delete', description: 'Usun zaznaczony cue', mode: 'timeline' },
  { key: 'Double-click', description: 'Edytuj / Dodaj cue', mode: 'timeline' },
];

const MODE_LABELS: Record<string, string> = {
  global: 'Globalne',
  rundown: 'Tryb Rundown',
  timeline: 'Tryb Timeline',
};

const MODE_COLORS: Record<string, string> = {
  global: 'text-slate-300',
  rundown: 'text-blue-400',
  timeline: 'text-purple-400',
};

export function ShortcutHelp({ onClose }: ShortcutHelpProps) {
  // Grupuj skroty po trybie
  const grouped = new Map<string, ShortcutEntry[]>();
  for (const s of SHORTCUTS) {
    const list = grouped.get(s.mode) ?? [];
    list.push(s);
    grouped.set(s.mode, list);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg shadow-2xl w-[450px] max-h-[80vh] flex flex-col border border-slate-600"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Skroty klawiszowe
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {['global', 'rundown', 'timeline'].map(mode => {
            const entries = grouped.get(mode);
            if (!entries || entries.length === 0) return null;

            return (
              <div key={mode}>
                <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${MODE_COLORS[mode]}`}>
                  {MODE_LABELS[mode]}
                </div>
                <div className="space-y-1">
                  {entries.map(s => (
                    <div key={s.key} className="flex items-center gap-3 py-1">
                      <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300 min-w-[100px] text-center">
                        {s.key}
                      </kbd>
                      <span className="text-xs text-slate-400">{s.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-2 border-t border-slate-700 text-[10px] text-slate-500 text-center">
          Nacisnij ? lub Escape aby zamknac
        </div>
      </div>
    </div>
  );
}
