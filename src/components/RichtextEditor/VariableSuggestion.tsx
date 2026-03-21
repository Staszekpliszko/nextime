import { useState, useEffect, useCallback, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { usePlaybackStore } from '@/store/playback.store';

interface VariableSuggestionProps {
  editor: Editor;
}

/**
 * Proste autocomplete po wpisaniu `$` w edytorze TipTap.
 * Wyświetla listę dostępnych zmiennych tekstowych.
 * Po wyborze wstawia tekst z markiem textVariable.
 */
export function VariableSuggestion({ editor }: VariableSuggestionProps) {
  const textVariables = usePlaybackStore(s => s.textVariables);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filtrowane zmienne
  const filtered = textVariables.filter(v =>
    v.key.toLowerCase().includes(filter.toLowerCase())
  );

  // Nasłuchuj na zmiany w edytorze — szukaj wzorca $
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      const { state } = editor;
      const { $from } = state.selection;
      const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);

      // Szukaj `$` na końcu tekstu — pocz. wpisywania zmiennej
      const dollarMatch = textBefore.match(/\$([a-z0-9-]*)$/);
      if (dollarMatch) {
        setFilter(dollarMatch[1] ?? '');
        setIsOpen(true);
        setSelectedIndex(0);

        // Pozycja popupu — bazujemy na koordynatach kursora
        const coords = editor.view.coordsAtPos($from.pos);
        const editorRect = editor.view.dom.closest('.tiptap-editor')?.getBoundingClientRect();
        if (editorRect) {
          setPosition({
            top: coords.bottom - editorRect.top + 4,
            left: coords.left - editorRect.left,
          });
        }
      } else {
        setIsOpen(false);
      }
    };

    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
    };
  }, [editor]);

  // Wstaw zmienną do edytora
  const insertVariable = useCallback((key: string) => {
    if (!editor) return;

    const { state } = editor;
    const { $from } = state.selection;
    const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
    const dollarMatch = textBefore.match(/\$([a-z0-9-]*)$/);

    if (dollarMatch) {
      // Usuń `$xxx` i wstaw tekst z markiem textVariable
      const deleteFrom = $from.pos - dollarMatch[0].length;
      const deleteTo = $from.pos;

      editor
        .chain()
        .focus()
        .deleteRange({ from: deleteFrom, to: deleteTo })
        .insertContent({
          type: 'text',
          text: `$${key}`,
          marks: [{ type: 'textVariable', attrs: { key } }],
        })
        .run();
    }

    setIsOpen(false);
  }, [editor]);

  // Obsługa klawiszy w popup
  useEffect(() => {
    if (!isOpen || !editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        insertVariable(filtered[selectedIndex].key);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    // Przechwytujemy na capture aby zapobiec defaultowej obsłudze
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, filtered, selectedIndex, insertVariable, editor]);

  if (!isOpen || filtered.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 bg-slate-800 border border-slate-600 rounded shadow-lg py-1 max-h-40 overflow-y-auto min-w-[160px]"
      style={{ top: position.top, left: position.left }}
    >
      {filtered.map((v, i) => (
        <button
          key={v.id}
          className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 ${
            i === selectedIndex ? 'bg-cyan-800/40 text-cyan-300' : 'text-slate-300 hover:bg-slate-700'
          }`}
          onMouseDown={(e) => {
            e.preventDefault(); // nie trać fokusu z edytora
            insertVariable(v.key);
          }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="font-mono text-xs">${v.key}</span>
          <span className="text-xs text-slate-500 truncate max-w-[100px]">{v.value}</span>
        </button>
      ))}
    </div>
  );
}
