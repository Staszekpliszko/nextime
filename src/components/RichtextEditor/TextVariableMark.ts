import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Custom TipTap Mark — TextVariable.
 * Wstawia inline mark z atrybutem `key` (klucz zmiennej tekstowej).
 * Renderuje jako <span> z cyjanowym tłem w edytorze.
 */
export const TextVariableMark = Mark.create({
  name: 'textVariable',

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-variable-key'),
        renderHTML: (attributes: Record<string, string>) => ({
          'data-variable-key': attributes.key,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-variable-key]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'tiptap-variable',
        style: 'background-color: rgba(6, 182, 212, 0.3); border-radius: 3px; padding: 0 4px; color: #67e8f9;',
      }),
      0,
    ];
  },
});
