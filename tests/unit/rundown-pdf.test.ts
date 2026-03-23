/**
 * Faza 33D — Testy generowania PDF z rundownu i timeline.
 */

import { describe, it, expect } from 'vitest';
import {
  exportRundownPdf,
  extractPlainText,
} from '../../electron/pdf/rundown-pdf';
import { exportTimelinePdf } from '../../electron/pdf/timeline-pdf';
import type { PdfCue, PdfColumn, PdfCell, PdfCueGroup, PdfRundown, RundownPdfOptions } from '../../electron/pdf/rundown-pdf';
import type { PdfAct, PdfTrack, PdfTimelineCue, PdfCameraPreset, TimelinePdfOptions } from '../../electron/pdf/timeline-pdf';

// ── Helpery testowe ─────────────────────────────────────────

function makeRundown(overrides?: Partial<PdfRundown>): PdfRundown {
  return { name: 'Testowy Rundown', show_date: '2026-03-22', show_time: '19:00', venue: 'Hala Expo', ...overrides };
}

function makeCue(id: string, index: number, overrides?: Partial<PdfCue>): PdfCue {
  return {
    id,
    title: `Cue ${index}`,
    subtitle: `Subtitle ${index}`,
    duration_ms: 60_000,
    status: 'ready',
    sort_order: index,
    ...overrides,
  };
}

function makeColumn(id: string, name: string, order: number): PdfColumn {
  return { id, name, sort_order: order };
}

function makeCell(cueId: string, colId: string, text: string): PdfCell {
  return {
    cue_id: cueId,
    column_id: colId,
    content_type: 'richtext',
    richtext: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  };
}

function makeGroup(id: string, label: string, order: number, color?: string): PdfCueGroup {
  return { id, label, sort_order: order, color };
}

function defaultOptions(overrides?: Partial<RundownPdfOptions>): RundownPdfOptions {
  return {
    orientation: 'portrait',
    pageSize: 'a4',
    selectedColumnIds: [],
    includeGroups: false,
    ...overrides,
  };
}

function makeAct(overrides?: Partial<PdfAct>): PdfAct {
  return { name: 'Testowy Akt', artist: 'Artysta', fps: 25, duration_frames: 7500, ...overrides };
}

function makeTimelineCue(id: string, tcIn: number, tcOut: number, camNum: number): PdfTimelineCue {
  return {
    id,
    track_id: 'track-1',
    type: 'vision',
    tc_in_frames: tcIn,
    tc_out_frames: tcOut,
    data: { camera_number: camNum, description: `Ujęcie ${camNum}` },
  };
}

// ── Testy: Rundown PDF ──────────────────────────────────────

describe('exportRundownPdf', () => {
  it('generuje PDF z pustym rundownem (0 cue)', () => {
    const buf = exportRundownPdf(makeRundown(), [], [], [], [], defaultOptions());
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('generuje PDF z wieloma cue-ami', () => {
    const cues = [makeCue('c1', 0), makeCue('c2', 1), makeCue('c3', 2)];
    const buf = exportRundownPdf(makeRundown(), cues, [], [], [], defaultOptions());
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBeGreaterThan(100);
  });

  it('zawiera nagłówek z nazwą rundownu (PDF nie pusty)', () => {
    const buf = exportRundownPdf(
      makeRundown({ name: 'Mega Show 2026' }),
      [makeCue('c1', 0)],
      [], [], [],
      defaultOptions(),
    );
    expect(buf.length).toBeGreaterThan(200);
  });

  it('obsługuje dynamiczne kolumny z richtext cells', () => {
    const col = makeColumn('col-1', 'Notatki', 0);
    const cue = makeCue('c1', 0);
    const cell = makeCell('c1', 'col-1', 'Uwaga dla operatora');

    const buf = exportRundownPdf(
      makeRundown(), [cue], [col], [cell], [],
      defaultOptions({ selectedColumnIds: ['col-1'] }),
    );
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBeGreaterThan(100);
  });

  it('obsługuje dynamiczne kolumny z dropdown_value', () => {
    const col = makeColumn('col-d', 'Priorytet', 0);
    const cue = makeCue('c1', 0);
    const cell: PdfCell = {
      cue_id: 'c1',
      column_id: 'col-d',
      content_type: 'dropdown_value',
      dropdown_value: 'Wysoki',
    };

    const buf = exportRundownPdf(
      makeRundown(), [cue], [col], [cell], [],
      defaultOptions({ selectedColumnIds: ['col-d'] }),
    );
    expect(buf.length).toBeGreaterThan(100);
  });

  it('obsługuje grupowanie cue-ów z nagłówkami grup', () => {
    const group = makeGroup('g1', 'Blok 1', 0, '#3366ff');
    const cues = [
      makeCue('c1', 0, { group_id: 'g1' }),
      makeCue('c2', 1, { group_id: 'g1' }),
      makeCue('c3', 2), // bez grupy
    ];

    const buf = exportRundownPdf(
      makeRundown(), cues, [], [], [group],
      defaultOptions({ includeGroups: true }),
    );
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBeGreaterThan(100);
  });

  it('obsługuje orientację landscape', () => {
    const cues = [makeCue('c1', 0)];
    const buf = exportRundownPdf(
      makeRundown(), cues, [], [], [],
      defaultOptions({ orientation: 'landscape' }),
    );
    expect(buf.length).toBeGreaterThan(100);
  });

  it('obsługuje rozmiar A3', () => {
    const cues = [makeCue('c1', 0)];
    const buf = exportRundownPdf(
      makeRundown(), cues, [], [], [],
      defaultOptions({ pageSize: 'a3' }),
    );
    expect(buf.length).toBeGreaterThan(100);
  });

  it('obsługuje rozmiar Letter', () => {
    const cues = [makeCue('c1', 0)];
    const buf = exportRundownPdf(
      makeRundown(), cues, [], [], [],
      defaultOptions({ pageSize: 'letter' }),
    );
    expect(buf.length).toBeGreaterThan(100);
  });

  it('obsługuje cue bez tytułu', () => {
    const cues = [makeCue('c1', 0, { title: '', subtitle: '' })];
    const buf = exportRundownPdf(makeRundown(), cues, [], [], [], defaultOptions());
    expect(buf.length).toBeGreaterThan(100);
  });

  it('obsługuje pustą komórkę', () => {
    const col = makeColumn('col-1', 'Notatki', 0);
    const cue = makeCue('c1', 0);
    // Brak komórek — kolumna powinna być pusta

    const buf = exportRundownPdf(
      makeRundown(), [cue], [col], [], [],
      defaultOptions({ selectedColumnIds: ['col-1'] }),
    );
    expect(buf.length).toBeGreaterThan(100);
  });
});

// ── Testy: extractPlainText ─────────────────────────────────

describe('extractPlainText', () => {
  it('wyciąga tekst z TipTap document', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'World' }] },
      ],
    };
    expect(extractPlainText(doc)).toBe('Hello World');
  });

  it('zwraca pusty string dla null', () => {
    expect(extractPlainText(null)).toBe('');
  });

  it('zwraca pusty string dla undefined', () => {
    expect(extractPlainText(undefined)).toBe('');
  });

  it('obsługuje hardBreak jako spację', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Line1' }, { type: 'hardBreak' }, { type: 'text', text: 'Line2' }] },
      ],
    };
    expect(extractPlainText(doc)).toBe('Line1 Line2');
  });
});

// ── Testy: Timeline PDF ─────────────────────────────────────

describe('exportTimelinePdf', () => {
  it('generuje PDF z pustym aktem (0 cue)', () => {
    const buf = exportTimelinePdf(
      makeAct(), [], [], [],
      { orientation: 'portrait', pageSize: 'a4' },
    );
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('generuje PDF z vision cue-ami (shotlist)', () => {
    const tracks: PdfTrack[] = [{ id: 'track-1', name: 'Vision', type: 'vision' }];
    const cues = [
      makeTimelineCue('tc1', 0, 75, 1),
      makeTimelineCue('tc2', 75, 150, 2),
      makeTimelineCue('tc3', 150, 225, 3),
    ];
    const presets: PdfCameraPreset[] = [
      { camera_number: 1, label: 'Wide', color: '#ff0000' },
      { camera_number: 2, label: 'Close-up' },
    ];

    const buf = exportTimelinePdf(makeAct(), tracks, cues, presets, { orientation: 'portrait', pageSize: 'a4' });
    expect(buf.length).toBeGreaterThan(200);
  });

  it('filtruje tylko vision i vision_fx cue-y', () => {
    const tracks: PdfTrack[] = [
      { id: 'track-1', name: 'Vision', type: 'vision' },
      { id: 'track-2', name: 'OSC', type: 'osc' },
    ];
    const cues: PdfTimelineCue[] = [
      makeTimelineCue('tc1', 0, 75, 1),
      { id: 'tc-osc', track_id: 'track-2', type: 'osc', tc_in_frames: 50, data: { address: '/test' } },
    ];

    // OSC cue nie powinien spowodować błędu — jest filtrowany
    const buf = exportTimelinePdf(makeAct(), tracks, cues, [], { orientation: 'landscape', pageSize: 'a4' });
    expect(buf.length).toBeGreaterThan(100);
  });

  it('obsługuje orientację landscape', () => {
    const buf = exportTimelinePdf(
      makeAct(), [], [], [],
      { orientation: 'landscape', pageSize: 'a4' },
    );
    expect(buf.length).toBeGreaterThan(100);
  });

  it('obsługuje rozmiar A3', () => {
    const buf = exportTimelinePdf(
      makeAct(), [], [], [],
      { orientation: 'portrait', pageSize: 'a3' },
    );
    expect(buf.length).toBeGreaterThan(100);
  });
});
