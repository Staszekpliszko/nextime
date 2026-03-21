import { describe, it, expect } from 'vitest';
import { extractPlainTextFromRichtext } from '../../src/utils/textVariables';

describe('extractPlainTextFromRichtext', () => {
  it('powinno wyciągnąć tekst z prostego TipTap doc', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello world' },
          ],
        },
      ],
    };
    expect(extractPlainTextFromRichtext(doc)).toBe('Hello world');
  });

  it('powinno obsłużyć wiele paragrafów', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Linia 1' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Linia 2' }] },
      ],
    };
    expect(extractPlainTextFromRichtext(doc)).toBe('Linia 1\nLinia 2');
  });

  it('powinno obsłużyć hardBreak', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Cześć' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Świat' },
          ],
        },
      ],
    };
    expect(extractPlainTextFromRichtext(doc)).toBe('Cześć\nŚwiat');
  });

  it('powinno zamienić TextVariableMark na wartość', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Witaj ' },
            {
              type: 'text',
              text: '$host',
              marks: [{ type: 'textVariable', attrs: { key: 'host' } }],
            },
            { type: 'text', text: '!' },
          ],
        },
      ],
    };
    const result = extractPlainTextFromRichtext(doc, { host: 'Jan' });
    expect(result).toBe('Witaj Jan!');
  });

  it('powinno zostawić $klucz gdy brak w mapie', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '$unknown',
              marks: [{ type: 'textVariable', attrs: { key: 'unknown' } }],
            },
          ],
        },
      ],
    };
    const result = extractPlainTextFromRichtext(doc, {});
    expect(result).toBe('$unknown');
  });

  it('powinno zwrócić pusty string dla null/undefined', () => {
    expect(extractPlainTextFromRichtext(null)).toBe('');
    expect(extractPlainTextFromRichtext(undefined)).toBe('');
  });

  it('powinno obsłużyć pusty doc', () => {
    const doc = { type: 'doc', content: [] };
    expect(extractPlainTextFromRichtext(doc)).toBe('');
  });

  it('powinno obsłużyć tekst z bold/italic marks (bez textVariable)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'pogrubiony',
              marks: [{ type: 'bold' }],
            },
          ],
        },
      ],
    };
    expect(extractPlainTextFromRichtext(doc)).toBe('pogrubiony');
  });
});
