import { useCallback, useState, useEffect, useRef } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import { RichtextEditor } from '@/components/RichtextEditor/RichtextEditor';
import { extractPlainTextFromRichtext } from '@/utils/textVariables';
import type { ColumnInfo, CellContent } from '@/store/playback.store';
import type { JSONContent } from '@tiptap/core';

interface CellRendererProps {
  cueId: string;
  column: ColumnInfo;
  variableMap?: Record<string, string>;
}

/**
 * Renderuje komórkę tabeli rundownu — różny typ w zależności od kolumny.
 * Lazy loading: komórki ładowane z bazy przy pierwszym renderze wiersza.
 * - richtext/script: RichtextEditor (inline, edytowalny po kliknięciu)
 * - dropdown: select z opcjami
 */
export function CellRenderer({ cueId, column, variableMap }: CellRendererProps) {
  const cellContent = usePlaybackStore(s => s.cells[cueId]?.[column.id]);
  const setCellContent = usePlaybackStore(s => s.setCellContent);
  const setCellsForCue = usePlaybackStore(s => s.setCellsForCue);
  const hasLoadedCells = usePlaybackStore(s => s.cells[cueId] !== undefined);
  const [isEditing, setIsEditing] = useState(false);
  const loadedRef = useRef(false);

  // Lazy load komórek — ładuj raz dla danego cue
  useEffect(() => {
    if (hasLoadedCells || loadedRef.current) return;
    loadedRef.current = true;

    window.nextime.getCells(cueId).then(cells => {
      const cellList = (cells as Array<{
        column_id: string;
        content_type: 'richtext' | 'dropdown_value' | 'file_ref';
        richtext?: unknown;
        dropdown_value?: string;
        file_ref?: string;
      }>);
      setCellsForCue(cueId, cellList);
    }).catch(err => {
      console.error('[CellRenderer] Błąd ładowania komórek:', err);
    });
  }, [cueId, hasLoadedCells, setCellsForCue]);

  // Zapis komórki do bazy (debounced wewnątrz RichtextEditor, natychmiastowy dla dropdown)
  const handleCellUpdate = useCallback(async (content: Partial<CellContent>) => {
    const fullContent: CellContent = {
      content_type: content.content_type ?? cellContent?.content_type ?? 'richtext',
      richtext: content.richtext ?? cellContent?.richtext,
      dropdown_value: content.dropdown_value ?? cellContent?.dropdown_value,
      file_ref: content.file_ref ?? cellContent?.file_ref,
    };

    // Aktualizuj store lokalnie
    setCellContent(cueId, column.id, fullContent);

    // Zapisz do bazy przez IPC
    try {
      await window.nextime.updateCell(cueId, column.id, {
        content_type: fullContent.content_type,
        richtext: fullContent.richtext,
        dropdown_value: fullContent.dropdown_value,
        file_ref: fullContent.file_ref,
      });
    } catch (err) {
      console.error('[CellRenderer] Błąd zapisu komórki:', err);
    }
  }, [cueId, column.id, cellContent, setCellContent]);

  // Richtext / Script — edytor TipTap
  if (column.type === 'richtext' || column.type === 'script') {
    const richtextDoc = cellContent?.richtext as JSONContent | undefined;

    if (!isEditing) {
      // Tryb readonly — wyświetl plain text
      const plainText = richtextDoc
        ? extractPlainTextFromRichtext(richtextDoc, variableMap)
        : '';

      return (
        <div
          className="text-sm text-slate-300 min-h-[1.5rem] cursor-text truncate"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          title={plainText || 'Kliknij, aby edytować'}
        >
          {plainText || <span className="text-slate-600 text-xs italic">—</span>}
        </div>
      );
    }

    // Tryb edycji — RichtextEditor inline
    return (
      <div onClick={e => e.stopPropagation()} onBlur={() => setIsEditing(false)}>
        <RichtextEditor
          content={richtextDoc}
          onUpdate={(json) => handleCellUpdate({ content_type: 'richtext', richtext: json })}
          placeholder={`Wpisz ${column.name.toLowerCase()}...`}
          editable
          className="bg-slate-900/50 rounded px-1"
        />
      </div>
    );
  }

  // Dropdown — select
  if (column.type === 'dropdown') {
    const options = column.dropdown_options ?? [];
    const currentValue = cellContent?.dropdown_value ?? '';

    return (
      <select
        value={currentValue}
        onChange={(e) => {
          e.stopPropagation();
          handleCellUpdate({ content_type: 'dropdown_value', dropdown_value: e.target.value });
        }}
        onClick={e => e.stopPropagation()}
        className="w-full px-1 py-0.5 text-sm bg-slate-900 border border-slate-700 rounded text-slate-300 focus:border-blue-500 outline-none"
      >
        <option value="">—</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  return null;
}
