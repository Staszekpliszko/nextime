/**
 * Faza 33B — Generowanie PDF z timeline/shotlist.
 * Lista ujęć (vision cues) z TC in/out, kamerą i opisem.
 * Używa czcionki Roboto (polskie znaki).
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { registerPolishFont } from './pdf-fonts';

import type { PdfOrientation, PdfPageSize } from './rundown-pdf';

// ── Typy wejściowe ──────────────────────────────────────────

export interface PdfAct {
  name: string;
  artist?: string;
  fps: number;
  duration_frames: number;
}

export interface PdfTrack {
  id: string;
  name: string;
  type: string;
}

export interface PdfTimelineCue {
  id: string;
  track_id: string;
  type: string;
  tc_in_frames: number;
  tc_out_frames?: number;
  data: Record<string, unknown>;
}

export interface PdfCameraPreset {
  camera_number: number;
  label: string;
  color?: string;
}

export interface TimelinePdfOptions {
  orientation: PdfOrientation;
  pageSize: PdfPageSize;
}

// ── Helpery ─────────────────────────────────────────────────

/** Konwertuje klatki na timecode HH:MM:SS:FF */
function framesToTimecode(frames: number, fps: number): string {
  if (frames < 0) frames = 0;
  const h = Math.floor(frames / (fps * 3600));
  const m = Math.floor((frames % (fps * 3600)) / (fps * 60));
  const s = Math.floor((frames % (fps * 60)) / fps);
  const ff = Math.floor(frames % fps);
  return [h, m, s, ff].map(n => String(n).padStart(2, '0')).join(':');
}

/** Wyciąga etykietę kamery/inputu z danych vision cue */
function getCameraLabel(
  data: Record<string, unknown>,
  presetMap: Map<number, PdfCameraPreset>,
): string {
  // Vision cue: camera_number
  const camNum = data.camera_number as number | undefined;
  if (camNum !== undefined && camNum !== null) {
    const preset = presetMap.get(camNum);
    return preset ? `CAM ${camNum} — ${preset.label}` : `CAM ${camNum}`;
  }
  // OBS: sceneName
  if (typeof data.sceneName === 'string') return data.sceneName;
  // vMix: inputNumber
  if (typeof data.inputNumber === 'number') return `Input ${data.inputNumber}`;
  return '';
}

/** Wyciąga opis z danych cue */
function getDescription(data: Record<string, unknown>): string {
  if (typeof data.description === 'string') return data.description;
  if (typeof data.label === 'string') return data.label;
  if (typeof data.text === 'string') return data.text;
  // vision_fx: typ efektu
  if (typeof data.fx_type === 'string') return `FX: ${data.fx_type}`;
  return '';
}

/** Mapowanie typu cue na polski tekst */
function cueTypeLabel(type: string): string {
  switch (type) {
    case 'vision': return 'Wizja';
    case 'vision_fx': return 'Wizja FX';
    case 'lyric': return 'Tekst';
    case 'marker': return 'Marker';
    case 'media': return 'Media';
    case 'osc': return 'OSC';
    case 'gpi': return 'GPI';
    case 'midi': return 'MIDI';
    default: return type;
  }
}

// ── Główna funkcja ──────────────────────────────────────────

/**
 * Generuje PDF z shotlist (timeline vision cues) i zwraca bufor jako Uint8Array.
 */
export function exportTimelinePdf(
  act: PdfAct,
  tracks: PdfTrack[],
  timelineCues: PdfTimelineCue[],
  cameraPresets: PdfCameraPreset[],
  options: TimelinePdfOptions,
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
  const fps = act.fps || 25;

  // ── Nagłówek ──
  doc.setFont(fontName, 'bold');
  doc.setFontSize(16);
  doc.text(act.name || 'Shotlist', 14, 16);

  const subtitleParts: string[] = [];
  if (act.artist) subtitleParts.push(act.artist);
  subtitleParts.push(`${fps} fps`);
  if (act.duration_frames > 0) {
    subtitleParts.push(`Czas trwania: ${framesToTimecode(act.duration_frames, fps)}`);
  }

  doc.setFont(fontName, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(subtitleParts.join('  |  '), 14, 22);
  doc.setTextColor(0);

  // ── Mapa kamer ──
  const presetMap = new Map<number, PdfCameraPreset>();
  for (const p of cameraPresets) {
    presetMap.set(p.camera_number, p);
  }

  // ── Filtrowanie: vision + vision_fx cue'y (shotlist) ──
  const shotlistCues = [...timelineCues]
    .filter(c => c.type === 'vision' || c.type === 'vision_fx')
    .sort((a, b) => a.tc_in_frames - b.tc_in_frames);

  // ── Nagłówki tabeli ──
  const tableHead = ['#', 'TC In', 'TC Out', 'Kamera / Input', 'Typ', 'Opis'];

  // ── Budowanie wierszy ──
  const tableBody: string[][] = [];
  shotlistCues.forEach((cue, index) => {
    tableBody.push([
      String(index + 1),
      framesToTimecode(cue.tc_in_frames, fps),
      cue.tc_out_frames !== undefined ? framesToTimecode(cue.tc_out_frames, fps) : '—',
      getCameraLabel(cue.data, presetMap),
      cueTypeLabel(cue.type),
      getDescription(cue.data),
    ]);
  });

  // Pusta tabela — wstaw informację
  if (tableBody.length === 0) {
    tableBody.push(['', '', '', 'Brak ujęć wizji w tym akcie', '', '']);
  }

  // ── Obliczenie szerokości kolumn ──
  const availableWidth = pageWidth - 20;

  // ── Renderowanie tabeli ──
  autoTable(doc, {
    startY: 27,
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
      fillColor: [60, 30, 80],
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      font: fontName,
    },
    bodyStyles: {
      fontSize: 7,
      font: fontName,
    },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },    // #
      1: { cellWidth: 24, halign: 'center' },   // TC In
      2: { cellWidth: 24, halign: 'center' },   // TC Out
      3: { cellWidth: Math.floor(availableWidth * 0.25), overflow: 'linebreak' }, // Kamera
      4: { cellWidth: 16, halign: 'center' },   // Typ
      5: { overflow: 'linebreak' },              // Opis — auto szerokość
    },
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
