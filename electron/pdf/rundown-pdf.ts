/**
 * Faza 33A — Generowanie PDF z rundownu.
 * Używa jsPDF + jspdf-autotable + czcionkę Roboto (polskie znaki).
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { registerPolishFont } from './pdf-fonts';

// ── Typy wejściowe ──────────────────────────────────────────

export interface PdfCue {
  id: string;
  title: string;
  subtitle: string;
  duration_ms: number;
  status: string;
  sort_order: number;
  group_id?: string;
}

export interface PdfColumn {
  id: string;
  name: string;
  sort_order: number;
}

export interface PdfCell {
  cue_id: string;
  column_id: string;
  content_type: string;
  richtext?: unknown;
  dropdown_value?: string;
}

export interface PdfCueGroup {
  id: string;
  label: string;
  sort_order: number;
  color?: string;
}

export interface PdfRundown {
  name: string;
  show_date?: string;
  show_time?: string;
  venue?: string;
}

export type PdfOrientation = 'portrait' | 'landscape';
export type PdfPageSize = 'a4' | 'a3' | 'letter';

export interface RundownPdfOptions {
  orientation: PdfOrientation;
  pageSize: PdfPageSize;
  selectedColumnIds: string[];
  includeGroups: boolean;
}

// ── Helpery ─────────────────────────────────────────────────

/** Formatuje milisekundy na MM:SS */
function formatDuration(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Mapowanie statusu na polski tekst */
function statusLabel(status: string): string {
  switch (status) {
    case 'ready': return 'Gotowy';
    case 'standby': return 'Czuwanie';
    case 'done': return 'Zakończony';
    case 'skipped': return 'Pominięty';
    default: return status;
  }
}

/**
 * Wyciąga plain text z TipTap richtext JSON (uproszczona wersja dla main process).
 * Nie potrzebuje substituteVariables — eksport PDF wyciąga surowy tekst.
 */
export function extractPlainText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return '';
  const d = doc as Record<string, unknown>;

  if (typeof d === 'string') return d as unknown as string;

  // Tekst node
  if (d.type === 'text' && typeof d.text === 'string') {
    return d.text;
  }

  // hardBreak → spacja (w PDF nie chcemy newline w komórce)
  if (d.type === 'hardBreak') return ' ';

  // Rekursywnie przejdź content
  if (Array.isArray(d.content)) {
    const parts = (d.content as unknown[]).map((node: unknown) => extractPlainText(node));
    if (d.type === 'doc') return parts.join(' ');
    return parts.join('');
  }

  return '';
}

// ── Główna funkcja ──────────────────────────────────────────

/**
 * Generuje PDF z rundownu i zwraca bufor jako Uint8Array.
 */
export function exportRundownPdf(
  rundown: PdfRundown,
  cues: PdfCue[],
  columns: PdfColumn[],
  cells: PdfCell[],
  groups: PdfCueGroup[],
  options: RundownPdfOptions,
): Uint8Array {
  const doc = new jsPDF({
    orientation: options.orientation === 'landscape' ? 'landscape' : 'portrait',
    unit: 'mm',
    format: options.pageSize,
  });

  // Rejestruj czcionkę Roboto z polskimi znakami
  const hasPolishFont = registerPolishFont(doc);
  const fontName = hasPolishFont ? 'CustomFont' : 'helvetica';

  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Nagłówek ──
  doc.setFont(fontName, 'bold');
  doc.setFontSize(16);
  doc.text(rundown.name || 'Rundown', 14, 16);

  // Podtytuł: data, godzina, miejsce
  const subtitleParts: string[] = [];
  if (rundown.show_date) subtitleParts.push(rundown.show_date);
  if (rundown.show_time) subtitleParts.push(rundown.show_time);
  if (rundown.venue) subtitleParts.push(rundown.venue);

  if (subtitleParts.length > 0) {
    doc.setFont(fontName, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(subtitleParts.join('  |  '), 14, 22);
    doc.setTextColor(0);
  }

  // ── Przygotowanie kolumn tabeli ──
  const selectedCols = columns
    .filter(c => options.selectedColumnIds.includes(c.id))
    .sort((a, b) => a.sort_order - b.sort_order);

  // Nagłówki: #, Tytuł, Podtytuł, Czas, Status + dynamiczne kolumny
  const tableHead = ['#', 'Tytuł', 'Podtytuł', 'Czas', 'Status', ...selectedCols.map(c => c.name)];

  // ── Mapa komórek: klucz "cueId:columnId" → tekst ──
  const cellMap = new Map<string, string>();
  for (const cell of cells) {
    let text = '';
    if (cell.content_type === 'dropdown_value' && cell.dropdown_value) {
      text = cell.dropdown_value;
    } else if (cell.richtext) {
      text = extractPlainText(cell.richtext);
    }
    cellMap.set(`${cell.cue_id}:${cell.column_id}`, text);
  }

  // ── Mapa grup ──
  const groupMap = new Map<string, PdfCueGroup>();
  for (const g of groups) {
    groupMap.set(g.id, g);
  }

  // ── Budowanie wierszy tabeli ──
  const tableBody: Array<Array<string | { content: string; colSpan: number; styles: Record<string, unknown> }>> = [];
  let cueIndex = 0;

  // Sortuj cue'y wg sort_order
  const sortedCues = [...cues].sort((a, b) => a.sort_order - b.sort_order);

  // Jeśli grupowanie — wstaw nagłówki grup
  if (options.includeGroups && groups.length > 0) {
    // Pogrupuj cue'y
    const groupedCues = new Map<string, PdfCue[]>();
    const ungrouped: PdfCue[] = [];

    for (const cue of sortedCues) {
      if (cue.group_id && groupMap.has(cue.group_id)) {
        const list = groupedCues.get(cue.group_id) ?? [];
        list.push(cue);
        groupedCues.set(cue.group_id, list);
      } else {
        ungrouped.push(cue);
      }
    }

    // Najpierw grupy w kolejności sort_order
    const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order);
    for (const group of sortedGroups) {
      const groupCues = groupedCues.get(group.id);
      if (!groupCues || groupCues.length === 0) continue;

      // Wiersz nagłówka grupy — span na cały wiersz
      const colCount = tableHead.length;
      tableBody.push([
        {
          content: group.label,
          colSpan: colCount,
          styles: {
            fillColor: group.color ? hexToRgb(group.color) : [70, 70, 90],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
            font: fontName,
          },
        },
      ]);

      // Cue'y w grupie
      for (const cue of groupCues) {
        cueIndex++;
        tableBody.push(buildCueRow(cueIndex, cue, selectedCols, cellMap));
      }
    }

    // Cue'y bez grupy na końcu
    for (const cue of ungrouped) {
      cueIndex++;
      tableBody.push(buildCueRow(cueIndex, cue, selectedCols, cellMap));
    }
  } else {
    // Bez grupowania — wszystkie cue'y sekwencyjnie
    for (const cue of sortedCues) {
      cueIndex++;
      tableBody.push(buildCueRow(cueIndex, cue, selectedCols, cellMap));
    }
  }

  // ── Obliczenie szerokości kolumn ──
  // Dostępna szerokość = pageWidth - marginesy (10 + 10)
  const availableWidth = pageWidth - 20;
  // Stałe kolumny: #(7), Czas(14), Status(18)
  const fixedWidth = 7 + 14 + 18;
  // Pozostała szerokość na Tytuł, Podtytuł i dynamiczne kolumny
  const dynamicColCount = selectedCols.length;
  const flexCols = 2 + dynamicColCount; // Tytuł + Podtytuł + dynamiczne
  const flexWidth = availableWidth - fixedWidth;
  // Tytuł i Podtytuł mają proporcjonalnie więcej miejsca
  const titleWidth = Math.max(25, Math.floor(flexWidth * 0.25));
  const subtitleWidth = Math.max(25, Math.floor(flexWidth * 0.25));
  const remainingForDynamic = flexWidth - titleWidth - subtitleWidth;
  const dynamicColWidth = dynamicColCount > 0
    ? Math.max(15, Math.floor(remainingForDynamic / dynamicColCount))
    : 0;

  // Buduj columnStyles
  const colStyles: Record<number, Record<string, unknown>> = {
    0: { cellWidth: 7, halign: 'center' },    // #
    1: { cellWidth: titleWidth, overflow: 'linebreak' },  // Tytuł
    2: { cellWidth: subtitleWidth, overflow: 'linebreak' }, // Podtytuł
    3: { cellWidth: 14, halign: 'center' },   // Czas
    4: { cellWidth: 18, halign: 'center' },   // Status
  };
  // Dynamiczne kolumny
  for (let i = 0; i < dynamicColCount; i++) {
    colStyles[5 + i] = { cellWidth: dynamicColWidth, overflow: 'linebreak' };
  }

  // ── Renderowanie tabeli ──
  const startY = subtitleParts.length > 0 ? 27 : 22;

  autoTable(doc, {
    startY,
    head: [tableHead],
    body: tableBody,
    theme: 'grid',
    styles: {
      font: fontName,
      fontSize: 7,
      cellPadding: 1.5,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [40, 50, 70],
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      font: fontName,
    },
    bodyStyles: {
      fontSize: 7,
      font: fontName,
    },
    columnStyles: colStyles,
    margin: { left: 10, right: 10, bottom: 16 },
    tableWidth: 'auto',
  });

  // ── Stopka z numeracją stron ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont(fontName, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(150);
    const pageH = doc.internal.pageSize.getHeight();
    doc.text(
      `Strona ${i} z ${pageCount}`,
      pageWidth / 2,
      pageH - 6,
      { align: 'center' },
    );
    doc.text(
      `NEXTIME — ${new Date().toLocaleDateString('pl-PL')}`,
      pageWidth - 10,
      pageH - 6,
      { align: 'right' },
    );
  }

  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}

// ── Pomocnicze ──────────────────────────────────────────────

function buildCueRow(
  index: number,
  cue: PdfCue,
  selectedCols: PdfColumn[],
  cellMap: Map<string, string>,
): string[] {
  const row: string[] = [
    String(index),
    cue.title || '',
    cue.subtitle || '',
    formatDuration(cue.duration_ms),
    statusLabel(cue.status),
  ];

  for (const col of selectedCols) {
    row.push(cellMap.get(`${cue.id}:${col.id}`) ?? '');
  }

  return row;
}

/** Konwertuje hex color (#RRGGBB) na [R, G, B] */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [70, 70, 90];
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}
