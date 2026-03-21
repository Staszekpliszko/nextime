// ============================================================
//  Timecode utilities — konwersja frames ↔ timecode ↔ ms
//
//  Czyste funkcje, zero side effects.
//  Obsługa FPS: 24, 25, 29.97 (drop-frame), 30, 50, 59.94, 60
// ============================================================

/** Obsługiwane wartości FPS */
export type FPS = 24 | 25 | 29 | 30 | 50 | 59 | 60;

/** Czy FPS jest drop-frame (29.97 lub 59.94) */
export function isDropFrame(fps: FPS): boolean {
  return fps === 29 || fps === 59;
}

/**
 * Konwertuje liczbę klatek na timecode string "HH:MM:SS:FF"
 * Dla drop-frame (29/59) stosuje standard SMPTE z separatorem ";"
 */
export function framesToTimecode(frames: number, fps: FPS): string {
  if (frames < 0) frames = 0;

  if (isDropFrame(fps)) {
    return framesToDropFrameTimecode(frames, fps);
  }

  const h  = Math.floor(frames / (fps * 3600));
  const m  = Math.floor((frames % (fps * 3600)) / (fps * 60));
  const s  = Math.floor((frames % (fps * 60)) / fps);
  const ff = Math.floor(frames % fps);

  return [h, m, s, ff].map(n => String(n).padStart(2, '0')).join(':');
}

/**
 * Parsuje timecode string "HH:MM:SS:FF" (lub "HH:MM:SS;FF" drop-frame) na liczbę klatek
 */
export function timecodeToFrames(tc: string, fps: FPS): number {
  // Obsługa separatora ; (drop-frame) i : (non-drop-frame)
  const parts = tc.split(/[:;]/).map(Number);
  if (parts.length !== 4) return 0;

  const [h, m, s, ff] = parts as [number, number, number, number];

  if (isDropFrame(fps)) {
    return dropFrameTimecodeToFrames(h, m, s, ff, fps);
  }

  return (h * 3600 + m * 60 + s) * fps + ff;
}

/**
 * Konwertuje klatki na milisekundy (TYLKO do display, nie do logiki biznesowej)
 */
export function framesToMs(frames: number, fps: FPS): number {
  const realFps = getRealFps(fps);
  return Math.round((frames / realFps) * 1000);
}

/**
 * Konwertuje milisekundy na klatki (TYLKO do display, nie do logiki biznesowej)
 */
export function msToFrames(ms: number, fps: FPS): number {
  const realFps = getRealFps(fps);
  return Math.round((ms / 1000) * realFps);
}

/**
 * Zwraca rzeczywistą wartość FPS (29 → 29.97, 59 → 59.94)
 */
export function getRealFps(fps: FPS): number {
  if (fps === 29) return 30000 / 1001; // 29.97
  if (fps === 59) return 60000 / 1001; // 59.94
  return fps;
}

/**
 * Formatuje timecode do krótszej formy "MM:SS" (bez godzin i klatek)
 * Przydatne dla wyświetlania w ShotlistPanel
 */
export function framesToShortTimecode(frames: number, fps: FPS): string {
  const full = framesToTimecode(frames, fps);
  // Zwróć MM:SS z pełnego HH:MM:SS:FF
  const parts = full.split(/[:;]/);
  return `${parts[1]}:${parts[2]}`;
}

// ── Drop-frame helpers (SMPTE 12M) ──────────────────────────

/**
 * Drop-frame: przy 29.97fps pomijamy klatki 0 i 1 na początku
 * każdej minuty, OPRÓCZ co 10. minuty.
 * Przy 59.94fps pomijamy 0,1,2,3.
 */
function framesToDropFrameTimecode(totalFrames: number, fps: FPS): string {
  const dropFrames = fps === 29 ? 2 : 4;
  const framesPerMinute = fps * 60 - dropFrames;
  const framesPer10Min = framesPerMinute * 10 + dropFrames;

  const d = Math.floor(totalFrames / framesPer10Min);
  const m = totalFrames % framesPer10Min;

  let adjustedFrames: number;
  if (m < dropFrames) {
    adjustedFrames = totalFrames + dropFrames * 9 * d;
  } else {
    adjustedFrames = totalFrames + dropFrames * 9 * d + dropFrames * Math.floor((m - dropFrames) / framesPerMinute);
  }

  const h  = Math.floor(adjustedFrames / (fps * 3600));
  const min = Math.floor((adjustedFrames % (fps * 3600)) / (fps * 60));
  const s  = Math.floor((adjustedFrames % (fps * 60)) / fps);
  const ff = Math.floor(adjustedFrames % fps);

  // Drop-frame separator: ";" między sekundami a klatkami
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(min)}:${pad(s)};${pad(ff)}`;
}

function dropFrameTimecodeToFrames(h: number, m: number, s: number, ff: number, fps: FPS): number {
  const dropFrames = fps === 29 ? 2 : 4;
  const totalMinutes = h * 60 + m;

  // Klatki bez drop-frame correction
  const baseFrames = (h * 3600 + m * 60 + s) * fps + ff;

  // Odjęcie pominiętych klatek
  const dropped = dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));

  return baseFrames - dropped;
}
