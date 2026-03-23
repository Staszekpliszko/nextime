import type { StreamDeckButtonConfig, StreamDeckActionType } from './streamdeck-actions';

// ── Typy ────────────────────────────────────────────────

export interface StreamDeckPage {
  name: string;
  /** Przyciski — indeks = pozycja na StreamDecku */
  buttons: StreamDeckButtonConfig[];
}

export interface StreamDeckPagesConfig {
  pages: StreamDeckPage[];
  activePage: number;
}

// ── Helper — tworzenie przycisku ────────────────────────

function btn(action: StreamDeckActionType, label: string, params?: Record<string, unknown>, bgColor?: string): StreamDeckButtonConfig {
  return { action, label, params, bgColor };
}

/** Wypełnia tablicę do podanej długości pustymi przyciskami */
function padToLength(buttons: StreamDeckButtonConfig[], keyCount: number): StreamDeckButtonConfig[] {
  const result = [...buttons];
  while (result.length < keyCount) {
    result.push(btn('none', ''));
  }
  return result.slice(0, keyCount);
}

// ── Domyślne strony ─────────────────────────────────────

/**
 * Generuje domyślne strony zależnie od liczby przycisków modelu.
 * Wszystkie przyciski są wypełnione — nie ma pustych dziur.
 */
export function getDefaultPages(keyCount: number): StreamDeckPagesConfig {
  // ── Pedal (3 przyciski) — jedna strona ────────────
  if (keyCount <= 3) {
    return {
      activePage: 0,
      pages: [{
        name: 'SHOW CONTROL',
        buttons: padToLength([
          btn('prev', 'Poprzedni'),
          btn('play', 'Play'),
          btn('next', 'Następny'),
        ], keyCount),
      }],
    };
  }

  // ── Mini (6 przycisków) — 2 strony ────────────────
  if (keyCount <= 6) {
    return {
      activePage: 0,
      pages: [
        {
          name: 'SHOW CONTROL',
          buttons: padToLength([
            btn('play', 'Play'),
            btn('pause', 'Pauza'),
            btn('prev', 'Poprzedni'),
            btn('next', 'Następny'),
            btn('ftb', 'FTB'),
            btn('page_nav', '→ KAMERY', { page: 1 }),
          ], keyCount),
        },
        {
          name: 'SHOTBOX',
          buttons: padToLength([
            btn('page_nav', '← STEROWANIE', { page: 0 }),
            btn('cam_pgm', 'CAM 1', { camera: 1 }),
            btn('cam_pgm', 'CAM 2', { camera: 2 }),
            btn('cam_pgm', 'CAM 3', { camera: 3 }),
            btn('cam_pgm', 'CAM 4', { camera: 4 }),
            btn('cut', 'CUT'),
          ], keyCount),
        },
      ],
    };
  }

  // ── MK.2 / Original (15 przycisków) — 4 strony ───
  if (keyCount <= 15) {
    return {
      activePage: 0,
      pages: [
        {
          name: 'SHOW CONTROL',
          buttons: padToLength([
            // Rząd 1 (5)
            btn('play', 'Play'),
            btn('pause', 'Pauza'),
            btn('prev', 'Poprzedni'),
            btn('next', 'Następny'),
            btn('page_nav', '→ KAMERY', { page: 1 }),
            // Rząd 2 (5)
            btn('step_next', 'Step Next'),
            btn('take_shot', 'Take Shot'),
            btn('hold', 'Hold'),
            btn('step_mode', 'Step Mode'),
            btn('ftb', 'FTB'),
            // Rząd 3 (5) — info
            btn('none', 'Aktualny Cue'),
            btn('none', 'Następny Cue'),
            btn('none', 'Remaining'),
            btn('none', 'Elapsed'),
            btn('none', 'Zegar'),
          ], keyCount),
        },
        {
          name: 'SHOTBOX',
          buttons: padToLength([
            // Rząd 1: kamery PGM
            btn('cam_pgm', 'CAM 1', { camera: 1 }),
            btn('cam_pgm', 'CAM 2', { camera: 2 }),
            btn('cam_pgm', 'CAM 3', { camera: 3 }),
            btn('cam_pgm', 'CAM 4', { camera: 4 }),
            btn('page_nav', '→ MEDIA', { page: 2 }),
            // Rząd 2: kamery PVW
            btn('cam_pvw', 'PVW 1', { camera: 1 }),
            btn('cam_pvw', 'PVW 2', { camera: 2 }),
            btn('cam_pvw', 'PVW 3', { camera: 3 }),
            btn('cam_pvw', 'PVW 4', { camera: 4 }),
            btn('page_nav', '← STEROWANIE', { page: 0 }),
            // Rząd 3: switcher
            btn('cut', 'CUT'),
            btn('auto_transition', 'AUTO'),
            btn('dsk', 'DSK', { index: 0 }),
            btn('macro', 'Makro 1', { index: 0 }),
            btn('none', ''),
          ], keyCount),
        },
        {
          name: 'AUDIO / MEDIA',
          buttons: padToLength([
            btn('media_play', 'Media Play'),
            btn('media_stop', 'Media Stop'),
            btn('vol_up', 'Głośność +'),
            btn('vol_down', 'Głośność -'),
            btn('page_nav', '← KAMERY', { page: 1 }),
            btn('ptz_preset', 'PTZ P1', { camera: 1, preset: 1 }),
            btn('ptz_preset', 'PTZ P2', { camera: 1, preset: 2 }),
            btn('ptz_preset', 'PTZ P3', { camera: 1, preset: 3 }),
            btn('ptz_preset', 'PTZ P4', { camera: 1, preset: 4 }),
            btn('page_nav', '→ STEROWANIE', { page: 0 }),
          ], keyCount),
        },
      ],
    };
  }

  // ── XL (32 przyciski) — 3 pełne strony ───────────
  // Grid 8×4 = 32 przyciski. Wszystko mieści się na mniejszej liczbie stron.
  return {
    activePage: 0,
    pages: [
      {
        name: 'SHOW CONTROL',
        buttons: padToLength([
          // Rząd 1 (8) — sterowanie
          btn('play', 'Play'),
          btn('pause', 'Pauza'),
          btn('prev', 'Poprzedni'),
          btn('next', 'Następny'),
          btn('step_next', 'Step Next'),
          btn('take_shot', 'Take Shot'),
          btn('hold', 'Hold'),
          btn('page_nav', '→ KAMERY', { page: 1 }),
          // Rząd 2 (8) — dodatkowe sterowanie + info
          btn('step_mode', 'Step Mode'),
          btn('ftb', 'FTB'),
          btn('goto', 'Goto', { cueId: '' }),
          btn('none', ''),
          btn('none', 'Aktualny Cue'),
          btn('none', 'Następny Cue'),
          btn('none', 'Remaining'),
          btn('none', 'Elapsed'),
          // Rząd 3 (8) — szybki dostęp do kamer PGM
          btn('cam_pgm', 'CAM 1', { camera: 1 }),
          btn('cam_pgm', 'CAM 2', { camera: 2 }),
          btn('cam_pgm', 'CAM 3', { camera: 3 }),
          btn('cam_pgm', 'CAM 4', { camera: 4 }),
          btn('cam_pgm', 'CAM 5', { camera: 5 }),
          btn('cam_pgm', 'CAM 6', { camera: 6 }),
          btn('cam_pgm', 'CAM 7', { camera: 7 }),
          btn('cam_pgm', 'CAM 8', { camera: 8 }),
          // Rząd 4 (8) — switcher + zegar
          btn('cut', 'CUT'),
          btn('auto_transition', 'AUTO'),
          btn('dsk', 'DSK', { index: 0 }),
          btn('macro', 'Makro 1', { index: 0 }),
          btn('none', 'Timecode'),
          btn('none', 'Zegar'),
          btn('none', ''),
          btn('none', ''),
        ], keyCount),
      },
      {
        name: 'SHOTBOX',
        buttons: padToLength([
          // Rząd 1 (8) — kamery PGM
          btn('cam_pgm', 'CAM 1', { camera: 1 }),
          btn('cam_pgm', 'CAM 2', { camera: 2 }),
          btn('cam_pgm', 'CAM 3', { camera: 3 }),
          btn('cam_pgm', 'CAM 4', { camera: 4 }),
          btn('cam_pgm', 'CAM 5', { camera: 5 }),
          btn('cam_pgm', 'CAM 6', { camera: 6 }),
          btn('cam_pgm', 'CAM 7', { camera: 7 }),
          btn('cam_pgm', 'CAM 8', { camera: 8 }),
          // Rząd 2 (8) — kamery PVW
          btn('cam_pvw', 'PVW 1', { camera: 1 }),
          btn('cam_pvw', 'PVW 2', { camera: 2 }),
          btn('cam_pvw', 'PVW 3', { camera: 3 }),
          btn('cam_pvw', 'PVW 4', { camera: 4 }),
          btn('cam_pvw', 'PVW 5', { camera: 5 }),
          btn('cam_pvw', 'PVW 6', { camera: 6 }),
          btn('cam_pvw', 'PVW 7', { camera: 7 }),
          btn('cam_pvw', 'PVW 8', { camera: 8 }),
          // Rząd 3 (8) — switcher
          btn('cut', 'CUT'),
          btn('auto_transition', 'AUTO'),
          btn('dsk', 'DSK', { index: 0 }),
          btn('dsk', 'DSK 2', { index: 1 }),
          btn('macro', 'Makro 1', { index: 0 }),
          btn('macro', 'Makro 2', { index: 1 }),
          btn('none', ''),
          btn('page_nav', '→ MEDIA', { page: 2 }),
          // Rząd 4 (8) — nawigacja + info
          btn('page_nav', '← STEROWANIE', { page: 0 }),
          btn('none', 'Aktualny Cue'),
          btn('none', 'Następny Cue'),
          btn('none', 'Remaining'),
          btn('none', 'Elapsed'),
          btn('none', 'Timecode'),
          btn('none', 'Zegar'),
          btn('none', ''),
        ], keyCount),
      },
      {
        name: 'AUDIO / MEDIA',
        buttons: padToLength([
          // Rząd 1 (8) — media
          btn('media_play', 'Media Play'),
          btn('media_stop', 'Media Stop'),
          btn('vol_up', 'Głośność +'),
          btn('vol_down', 'Głośność -'),
          btn('none', ''),
          btn('none', ''),
          btn('none', ''),
          btn('page_nav', '← KAMERY', { page: 1 }),
          // Rząd 2 (8) — PTZ
          btn('ptz_preset', 'PTZ C1 P1', { camera: 1, preset: 1 }),
          btn('ptz_preset', 'PTZ C1 P2', { camera: 1, preset: 2 }),
          btn('ptz_preset', 'PTZ C1 P3', { camera: 1, preset: 3 }),
          btn('ptz_preset', 'PTZ C1 P4', { camera: 1, preset: 4 }),
          btn('ptz_preset', 'PTZ C2 P1', { camera: 2, preset: 1 }),
          btn('ptz_preset', 'PTZ C2 P2', { camera: 2, preset: 2 }),
          btn('ptz_preset', 'PTZ C2 P3', { camera: 2, preset: 3 }),
          btn('ptz_preset', 'PTZ C2 P4', { camera: 2, preset: 4 }),
          // Rząd 3-4 — puste
          btn('page_nav', '→ STEROWANIE', { page: 0 }),
        ], keyCount),
      },
    ],
  };
}

/**
 * Tworzy pustą stronę z podaną liczbą przycisków.
 */
export function createEmptyPage(name: string, keyCount: number): StreamDeckPage {
  const buttons: StreamDeckButtonConfig[] = [];
  for (let i = 0; i < keyCount; i++) {
    buttons.push(btn('none', ''));
  }
  return { name, buttons };
}
