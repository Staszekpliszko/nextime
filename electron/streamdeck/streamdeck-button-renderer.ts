import sharp from 'sharp';

// ── Typy ────────────────────────────────────────────────

export interface ButtonRenderOptions {
  /** Rozmiar ikony w px (kwadratowa) — domyślnie 72 */
  size?: number;
}

export interface TextButtonOptions extends ButtonRenderOptions {
  text: string;
  bgColor: string;
  textColor?: string;
  fontSize?: number;
  /** Druga linia tekstu (mniejsza) */
  subtext?: string;
}

export interface CountdownButtonOptions extends ButtonRenderOptions {
  remainingMs: number;
  totalMs: number;
  /** Czy overtime (ujemny remaining) */
  overtime?: boolean;
  /** Faza migania (true=widoczny, false=ukryty) — dla <10s */
  blinkPhase?: boolean;
}

export interface TallyButtonOptions extends ButtonRenderOptions {
  cameraNumber: number;
  /** Czy kamera jest na PGM (LIVE) */
  pgm: boolean;
  /** Czy kamera jest na PVW (preview) */
  pvw: boolean;
}

export interface InfoButtonOptions extends ButtonRenderOptions {
  label: string;
  value: string;
  bgColor?: string;
}

// ── Kolory ──────────────────────────────────────────────

const COLORS = {
  // Tło countdown
  WHITE: '#FFFFFF',
  YELLOW: '#FFCC00',
  RED: '#FF0000',
  DARK_RED: '#CC0000',

  // Tally
  PGM_RED: '#FF0000',
  PVW_GREEN: '#00CC00',
  INACTIVE_GRAY: '#444444',

  // UI
  BLACK: '#000000',
  DARK_BG: '#1a1a2e',
  BLUE: '#2563EB',
  DARK_BLUE: '#1e3a5f',
} as const;

// ── Helpery SVG ─────────────────────────────────────────

/**
 * Generuje SVG tekstu wycentrowanego w kwadracie.
 * sharp obsługuje SVG overlay — używamy tego zamiast skomplikowanego text rendering.
 */
function textSvg(
  text: string,
  width: number,
  height: number,
  textColor: string,
  fontSize: number,
  subtext?: string,
  subtextSize?: number,
): Buffer {
  // Uciekamy znaki specjalne XML
  const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeText = escapeXml(text);

  // Obetnij tekst jeśli za długi (max ~10 znaków przy 72px)
  const maxChars = Math.max(3, Math.floor(width / (fontSize * 0.55)));
  const displayText = safeText.length > maxChars ? safeText.slice(0, maxChars - 1) + '…' : safeText;

  let svgContent: string;
  if (subtext) {
    const safeSubtext = escapeXml(subtext);
    const subSize = subtextSize ?? Math.round(fontSize * 0.7);
    const displaySubtext = safeSubtext.length > maxChars + 2
      ? safeSubtext.slice(0, maxChars + 1) + '…'
      : safeSubtext;
    svgContent = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="${width / 2}" y="${height * 0.4}" fill="${textColor}"
              font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="bold"
              text-anchor="middle" dominant-baseline="middle">${displayText}</text>
        <text x="${width / 2}" y="${height * 0.7}" fill="${textColor}"
              font-size="${subSize}" font-family="Arial, sans-serif"
              text-anchor="middle" dominant-baseline="middle">${displaySubtext}</text>
      </svg>`;
  } else {
    svgContent = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="${width / 2}" y="${height / 2}" fill="${textColor}"
              font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="bold"
              text-anchor="middle" dominant-baseline="middle">${displayText}</text>
      </svg>`;
  }

  return Buffer.from(svgContent);
}

// ── Formatowanie czasu ──────────────────────────────────

function formatMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const sign = ms < 0 ? '-' : '';
  return `${sign}${m}:${s.toString().padStart(2, '0')}`;
}

function formatHhMmSsFf(frames: number, fps: number): string {
  const totalFrames = Math.max(0, Math.floor(frames));
  const f = totalFrames % fps;
  const totalSec = Math.floor(totalFrames / fps);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
}

// ── Główne funkcje renderingu ───────────────────────────

/**
 * Renderuje przycisk z tekstem — zwraca raw RGBA Buffer.
 */
export async function renderTextButton(options: TextButtonOptions): Promise<Buffer> {
  const size = options.size ?? 72;
  const bgColor = options.bgColor;
  const textColor = options.textColor ?? '#FFFFFF';
  const fontSize = options.fontSize ?? Math.round(size * 0.2);

  const svg = textSvg(options.text, size, size, textColor, fontSize, options.subtext);

  const result = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([{ input: svg, top: 0, left: 0 }])
    .raw()
    .toBuffer();

  return result;
}

/**
 * Renderuje przycisk countdown z kolorami zależnymi od remaining.
 * biały (>60s) → żółty (<60s) → czerwony (<30s) → migający (<10s) → overtime
 */
export async function renderCountdownButton(options: CountdownButtonOptions): Promise<Buffer> {
  const size = options.size ?? 72;
  const { remainingMs, overtime, blinkPhase } = options;

  // Określ kolor tła na podstawie remaining
  let bgColor: string;
  let textColor = '#FFFFFF';

  if (overtime || remainingMs < 0) {
    bgColor = COLORS.DARK_RED;
  } else if (remainingMs < 10_000) {
    // Migający — toggle widoczności
    bgColor = blinkPhase === false ? COLORS.BLACK : COLORS.RED;
  } else if (remainingMs < 30_000) {
    bgColor = COLORS.RED;
  } else if (remainingMs < 60_000) {
    bgColor = COLORS.YELLOW;
    textColor = COLORS.BLACK;
  } else {
    bgColor = COLORS.WHITE;
    textColor = COLORS.BLACK;
  }

  const timeText = formatMmSs(remainingMs);
  const fontSize = Math.round(size * 0.25);

  const svg = textSvg(timeText, size, size, textColor, fontSize);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([{ input: svg, top: 0, left: 0 }])
    .raw()
    .toBuffer();
}

/**
 * Renderuje przycisk tally kamery.
 * Czerwony = PGM (LIVE), Zielony = PVW, Szary = nieaktywny
 */
export async function renderTallyButton(options: TallyButtonOptions): Promise<Buffer> {
  const size = options.size ?? 72;
  const { cameraNumber, pgm, pvw } = options;

  let bgColor: string;
  let label: string;

  if (pgm) {
    bgColor = COLORS.PGM_RED;
    label = 'LIVE';
  } else if (pvw) {
    bgColor = COLORS.PVW_GREEN;
    label = 'PVW';
  } else {
    bgColor = COLORS.INACTIVE_GRAY;
    label = '';
  }

  const fontSize = Math.round(size * 0.3);
  const svg = textSvg(
    `CAM ${cameraNumber}`,
    size, size, '#FFFFFF', fontSize,
    label, Math.round(size * 0.18),
  );

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([{ input: svg, top: 0, left: 0 }])
    .raw()
    .toBuffer();
}

/**
 * Renderuje przycisk informacyjny (etykieta + wartość).
 */
export async function renderInfoButton(options: InfoButtonOptions): Promise<Buffer> {
  const size = options.size ?? 72;
  const bgColor = options.bgColor ?? COLORS.DARK_BG;
  const fontSize = Math.round(size * 0.16);

  const svg = textSvg(
    options.label, size, size, '#AAAAAA', fontSize,
    options.value, Math.round(size * 0.22),
  );

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([{ input: svg, top: 0, left: 0 }])
    .raw()
    .toBuffer();
}

/**
 * Renderuje przycisk nawigacji stron.
 */
export async function renderNavButton(pageLabel: string, options?: ButtonRenderOptions): Promise<Buffer> {
  const size = options?.size ?? 72;
  const fontSize = Math.round(size * 0.18);

  const svg = textSvg(pageLabel, size, size, '#FFFFFF', fontSize);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: COLORS.DARK_BLUE,
    },
  })
    .composite([{ input: svg, top: 0, left: 0 }])
    .raw()
    .toBuffer();
}

// ── Eksport helperów (do testów) ────────────────────────

export { formatMmSs, formatHhMmSsFf, COLORS };
