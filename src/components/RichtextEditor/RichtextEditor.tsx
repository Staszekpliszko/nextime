import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TextVariableMark } from './TextVariableMark';
import { VariableSuggestion } from './VariableSuggestion';
import type { JSONContent } from '@tiptap/core';

export interface RichtextEditorProps {
  /** Zawartość edytora w formacie TipTap JSON (ProseMirror doc) */
  content?: JSONContent;
  /** Callback po zmianie treści — debounced 500ms */
  onUpdate?: (content: JSONContent) => void;
  /** Placeholder tekst */
  placeholder?: string;
  /** Czy edytor jest edytowalny (false = readonly render) */
  editable?: boolean;
  /** Dodatkowe klasy CSS */
  className?: string;
}

/**
 * Edytor richtext oparty na TipTap — do użycia w komórkach tabeli rundownu.
 * Minimalna konfiguracja: paragraphs, bold, italic, hard breaks.
 * Auto-save z debounce 500ms.
 */
export function RichtextEditor({
  content,
  onUpdate,
  placeholder = 'Wpisz tekst...',
  editable = true,
  className = '',
}: RichtextEditorProps) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Minimalna konfiguracja — bez heading, blockquote, codeBlock, horizontalRule
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      Placeholder.configure({ placeholder }),
      TextVariableMark,
    ],
    content: content ?? { type: 'doc', content: [] },
    editable,
    onUpdate: ({ editor: ed }) => {
      if (!onUpdateRef.current) return;
      // Debounced auto-save — 500ms od ostatniej edycji
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        const json = ed.getJSON();
        onUpdateRef.current?.(json);
      }, 500);
    },
    editorProps: {
      attributes: {
        class: `tiptap-cell outline-none min-h-[1.5rem] text-sm text-slate-200 ${editable ? '' : 'cursor-default'}`,
      },
    },
  });

  // Aktualizuj edytowalność przy zmianie prop
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // Aktualizuj treść z zewnątrz (np. z WS delta) — tylko jeśli editor nie jest sfokusowany
  useEffect(() => {
    if (!editor || !content) return;
    if (editor.isFocused) return; // nie nadpisuj gdy user edytuje
    const currentJson = JSON.stringify(editor.getJSON());
    const newJson = JSON.stringify(content);
    if (currentJson !== newJson) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [editor, content]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Flush pending changes — wywoływany przy blur
  const handleBlur = useCallback(() => {
    if (debounceTimer.current && editor) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
      const json = editor.getJSON();
      onUpdateRef.current?.(json);
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={`tiptap-editor relative ${className}`} onBlur={handleBlur}>
      <EditorContent editor={editor} />
      {editable && <VariableSuggestion editor={editor} />}
    </div>
  );
}
