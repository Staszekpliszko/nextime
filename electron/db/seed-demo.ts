/**
 * Seed demo data — tworzy przykładowy rundown "Gala AS Media 2026"
 * z 12 cue'ami, kolumnami, grupami, zmiennymi, aktem i camera presetami.
 *
 * IDEMPOTENTNY: nie tworzy duplikatów jeśli dane już istnieją.
 */

import type { createRundownRepo } from './repositories/rundown.repo';
import type { createCueRepo } from './repositories/cue.repo';
import type { createColumnRepo } from './repositories/column.repo';
import type { createCellRepo } from './repositories/cell.repo';
import type { createTextVariableRepo } from './repositories/text-variable.repo';
import type { createCueGroupRepo } from './repositories/cue-group.repo';
import type { createActRepo } from './repositories/act.repo';
import type { createTrackRepo } from './repositories/track.repo';
import type { createTimelineCueRepo } from './repositories/timeline-cue.repo';
import type { createCameraPresetRepo } from './repositories/camera-preset.repo';

export interface SeedRepos {
  rundownRepo: ReturnType<typeof createRundownRepo>;
  cueRepo: ReturnType<typeof createCueRepo>;
  columnRepo: ReturnType<typeof createColumnRepo>;
  cellRepo: ReturnType<typeof createCellRepo>;
  textVariableRepo: ReturnType<typeof createTextVariableRepo>;
  cueGroupRepo: ReturnType<typeof createCueGroupRepo>;
  actRepo: ReturnType<typeof createActRepo>;
  trackRepo: ReturnType<typeof createTrackRepo>;
  timelineCueRepo: ReturnType<typeof createTimelineCueRepo>;
  cameraPresetRepo: ReturnType<typeof createCameraPresetRepo>;
}

/** Definicja seed cue — kolejność w tablicy = sort_order */
interface SeedCueDef {
  title: string;
  subtitle: string;
  duration_ms: number;
  start_type: 'soft' | 'hard';
  hard_start_datetime?: string;
  auto_start: boolean;
  background_color?: string;
  /** Indeks grupy (0 = Blok 1, 1 = Blok 2) */
  groupIndex: number;
}

/**
 * Tworzy dane demo w bazie. Wywołuj TYLKO jeśli brak rundownów.
 * @param projectId ID istniejącego projektu (wymagany do FK)
 * @param repos obiekty repozytoriów
 */
export function seedDemoData(projectId: string, repos: SeedRepos): void {
  const {
    rundownRepo, cueRepo, columnRepo, cellRepo,
    textVariableRepo, cueGroupRepo,
    actRepo, trackRepo, timelineCueRepo, cameraPresetRepo,
  } = repos;

  // Idempotentność — sprawdź czy są rundowny
  const existing = rundownRepo.findAll();
  if (existing.length > 0) {
    console.log('[Seed] Dane już istnieją — pomijam seed.');
    return;
  }

  console.log('[Seed] Tworzę dane demo...');

  // ── 1. Rundown ──────────────────────────────────────────
  const rundown = rundownRepo.create({
    project_id: projectId,
    name: 'Gala AS Media 2026',
    show_date: '2026-05-17',
    show_time: '19:00',
    status: 'draft',
    venue: 'Hala Expo Kraków',
    notes: 'Główna gala roczna AS LIVE MEDIA — demonstracyjne dane.',
  });

  // ── 2. Grupy cue'ów ────────────────────────────────────
  const group1 = cueGroupRepo.create({
    rundown_id: rundown.id,
    label: 'Blok 1 — Otwarcie',
    sort_order: 0,
    color: '#3b82f6',
  });

  const group2 = cueGroupRepo.create({
    rundown_id: rundown.id,
    label: 'Blok 2 — Program',
    sort_order: 1,
    color: '#8b5cf6',
  });

  const groups = [group1, group2];

  // ── 3. Cue'y ────────────────────────────────────────────
  const cueDefs: SeedCueDef[] = [
    // Blok 1 — Otwarcie
    { title: 'Opening', subtitle: 'Powitanie widzów, fanfary', duration_ms: 30_000, start_type: 'soft', auto_start: false, groupIndex: 0 },
    { title: 'VT Intro', subtitle: 'Film wizerunkowy AS Media', duration_ms: 90_000, start_type: 'soft', auto_start: true, groupIndex: 0 },
    { title: 'Wywiad z gościem', subtitle: 'Rozmowa z dyrektorem kreatywnym', duration_ms: 300_000, start_type: 'soft', auto_start: false, groupIndex: 0 },
    { title: 'Przerwa muzyczna', subtitle: 'Występ zespołu na żywo', duration_ms: 180_000, start_type: 'hard', hard_start_datetime: '2026-05-17T19:30:00Z', auto_start: false, background_color: '#059669', groupIndex: 0 },
    { title: 'Blok sponsorski', subtitle: 'Prezentacja partnerów', duration_ms: 120_000, start_type: 'soft', auto_start: false, groupIndex: 0 },
    { title: 'Konkurs', subtitle: 'Quiz interaktywny z publicznością', duration_ms: 240_000, start_type: 'soft', auto_start: false, groupIndex: 0 },
    // Blok 2 — Program
    { title: 'VT Reportaż', subtitle: 'Materiał z planu zdjęciowego', duration_ms: 90_000, start_type: 'soft', auto_start: true, groupIndex: 1 },
    { title: 'Panel dyskusyjny', subtitle: 'Przyszłość broadcastu w Polsce', duration_ms: 300_000, start_type: 'soft', auto_start: false, groupIndex: 1 },
    { title: 'Występ artystyczny', subtitle: 'Koncert gwiazdy wieczoru', duration_ms: 240_000, start_type: 'hard', hard_start_datetime: '2026-05-17T20:30:00Z', auto_start: false, background_color: '#dc2626', groupIndex: 1 },
    { title: 'Podsumowanie', subtitle: 'Słowo końcowe prowadzącego', duration_ms: 120_000, start_type: 'soft', auto_start: false, groupIndex: 1 },
    { title: 'Zakończenie', subtitle: 'Podziękowania i pożegnanie', duration_ms: 60_000, start_type: 'soft', auto_start: false, groupIndex: 1 },
    { title: 'Credits', subtitle: 'Napisy końcowe, rolka sponsorów', duration_ms: 30_000, start_type: 'soft', auto_start: true, groupIndex: 1 },
  ];

  const createdCues = cueDefs.map((def, index) => {
    return cueRepo.create({
      rundown_id: rundown.id,
      title: def.title,
      subtitle: def.subtitle,
      duration_ms: def.duration_ms,
      start_type: def.start_type,
      hard_start_datetime: def.hard_start_datetime,
      auto_start: def.auto_start,
      background_color: def.background_color,
      group_id: groups[def.groupIndex]!.id,
      sort_order: index,
    });
  });

  // ── 4. Kolumny dynamiczne ──────────────────────────────
  const colSkrypt = columnRepo.create({
    rundown_id: rundown.id,
    name: 'Skrypt',
    type: 'richtext',
    sort_order: 0,
    width_px: 250,
  });

  const colAudio = columnRepo.create({
    rundown_id: rundown.id,
    name: 'Audio',
    type: 'dropdown',
    sort_order: 1,
    width_px: 100,
    dropdown_options: ['BGM', 'VO', 'OFF', 'SFX'],
  });

  const colGrafika = columnRepo.create({
    rundown_id: rundown.id,
    name: 'Grafika',
    type: 'richtext',
    sort_order: 2,
    width_px: 200,
  });

  // ── 5. Zmienne tekstowe ────────────────────────────────
  textVariableRepo.create({ rundown_id: rundown.id, key: 'presenter', value: 'Jan Kowalski', description: 'Imię i nazwisko prowadzącego' });
  textVariableRepo.create({ rundown_id: rundown.id, key: 'date', value: '2026-05-17', description: 'Data wydarzenia' });
  textVariableRepo.create({ rundown_id: rundown.id, key: 'venue', value: 'Hala Expo Kraków', description: 'Miejsce wydarzenia' });
  textVariableRepo.create({ rundown_id: rundown.id, key: 'sponsor', value: 'AS LIVE MEDIA', description: 'Główny sponsor' });

  // ── 6. Przykładowe komórki (cells) ─────────────────────
  // Opening — skrypt z richtext (TipTap format)
  const richtextOpening = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [
        { type: 'text', text: 'Witamy Państwa na Gali AS Media 2026! Prowadzi: ' },
        { type: 'text', text: '$presenter', marks: [{ type: 'bold' }] },
      ] },
    ],
  };
  cellRepo.upsert({
    cue_id: createdCues[0]!.id,
    column_id: colSkrypt.id,
    content_type: 'richtext',
    richtext: richtextOpening,
  });

  // Opening — audio: BGM
  cellRepo.upsert({
    cue_id: createdCues[0]!.id,
    column_id: colAudio.id,
    content_type: 'dropdown_value',
    dropdown_value: 'BGM',
  });

  // Wywiad z gościem — skrypt
  const richtextWywiad = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [
        { type: 'text', text: 'Pytania do rozmowy: kariera, wizja przyszłości broadcastu, plany na 2027.' },
      ] },
    ],
  };
  cellRepo.upsert({
    cue_id: createdCues[2]!.id,
    column_id: colSkrypt.id,
    content_type: 'richtext',
    richtext: richtextWywiad,
  });

  // Wywiad z gościem — audio: VO
  cellRepo.upsert({
    cue_id: createdCues[2]!.id,
    column_id: colAudio.id,
    content_type: 'dropdown_value',
    dropdown_value: 'VO',
  });

  // VT Intro — grafika
  const richtextGrafika = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [
        { type: 'text', text: 'Lower third: Logo AS Media + data $date' },
      ] },
    ],
  };
  cellRepo.upsert({
    cue_id: createdCues[1]!.id,
    column_id: colGrafika.id,
    content_type: 'richtext',
    richtext: richtextGrafika,
  });

  // Credits — audio: OFF
  cellRepo.upsert({
    cue_id: createdCues[11]!.id,
    column_id: colAudio.id,
    content_type: 'dropdown_value',
    dropdown_value: 'OFF',
  });

  // Podsumowanie — skrypt
  const richtextPodsumowanie = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [
        { type: 'text', text: 'Dziękujemy za wspólny wieczór w $venue! Do zobaczenia za rok.' },
      ] },
    ],
  };
  cellRepo.upsert({
    cue_id: createdCues[9]!.id,
    column_id: colSkrypt.id,
    content_type: 'richtext',
    richtext: richtextPodsumowanie,
  });

  // ── 7. Act + Tracki + TimelineCues ──────────────────────
  const act = actRepo.create({
    rundown_id: rundown.id,
    name: 'Koncert Główny',
    artist: 'Gwiazda Wieczoru',
    fps: 25,
    duration_frames: 45000, // 30 minut
    sort_order: 0,
    color: '#dc2626',
  });

  // 5 tracków
  const trackVision = trackRepo.create({ act_id: act.id, type: 'vision', name: 'Vision', sort_order: 0 });
  const trackLyrics = trackRepo.create({ act_id: act.id, type: 'lyrics', name: 'Lyrics', sort_order: 1 });
  const trackOsc = trackRepo.create({ act_id: act.id, type: 'osc', name: 'OSC', sort_order: 2 });
  const trackMidi = trackRepo.create({ act_id: act.id, type: 'midi', name: 'MIDI', sort_order: 3 });
  const trackMedia = trackRepo.create({ act_id: act.id, type: 'media', name: 'Media', sort_order: 4 });

  // Vision cues (kamery 1-4)
  timelineCueRepo.create({
    track_id: trackVision.id, act_id: act.id, type: 'vision',
    tc_in_frames: 0, tc_out_frames: 750, // 0:00 - 0:30
    data: { camera_number: 1, transition: 'cut', description: 'Scena — widok ogólny' },
  });
  timelineCueRepo.create({
    track_id: trackVision.id, act_id: act.id, type: 'vision',
    tc_in_frames: 750, tc_out_frames: 2250, // 0:30 - 1:30
    data: { camera_number: 2, transition: 'dissolve', description: 'Publiczność — reakcje' },
  });
  timelineCueRepo.create({
    track_id: trackVision.id, act_id: act.id, type: 'vision',
    tc_in_frames: 2250, tc_out_frames: 5000, // 1:30 - 3:20
    data: { camera_number: 3, transition: 'cut', description: 'Zbliżenie — artysta' },
  });
  timelineCueRepo.create({
    track_id: trackVision.id, act_id: act.id, type: 'vision',
    tc_in_frames: 5000, tc_out_frames: 7500, // 3:20 - 5:00
    data: { camera_number: 1, transition: 'cut', description: 'Scena — powrót do ogólnego' },
  });

  // Lyric cues
  timelineCueRepo.create({
    track_id: trackLyrics.id, act_id: act.id, type: 'lyric',
    tc_in_frames: 250, tc_out_frames: 1500,
    data: { text: 'Pierwsza zwrotka — tekst piosenki demo\nLinia druga tekstu' },
  });
  timelineCueRepo.create({
    track_id: trackLyrics.id, act_id: act.id, type: 'lyric',
    tc_in_frames: 2000, tc_out_frames: 3500,
    data: { text: 'Refren — powtarzany tekst\nNa żywo w Hali Expo!' },
  });
  timelineCueRepo.create({
    track_id: trackLyrics.id, act_id: act.id, type: 'lyric',
    tc_in_frames: 4000, tc_out_frames: 5500,
    data: { text: 'Druga zwrotka — kontynuacja\nFinałowa linia tekstu' },
  });

  // OSC cues
  timelineCueRepo.create({
    track_id: trackOsc.id, act_id: act.id, type: 'osc',
    tc_in_frames: 0,
    data: { address: '/lighting/scene', args: [{ type: 'int', value: 1 }], host: '192.168.1.100', port: 8000 },
  });
  timelineCueRepo.create({
    track_id: trackOsc.id, act_id: act.id, type: 'osc',
    tc_in_frames: 2250,
    data: { address: '/lighting/scene', args: [{ type: 'int', value: 2 }], host: '192.168.1.100', port: 8000 },
  });

  // MIDI cue
  timelineCueRepo.create({
    track_id: trackMidi.id, act_id: act.id, type: 'midi',
    tc_in_frames: 500,
    data: { channel: 1, type: 'note_on', note: 60, velocity: 127 },
  });

  // Media cue
  timelineCueRepo.create({
    track_id: trackMedia.id, act_id: act.id, type: 'media',
    tc_in_frames: 100, tc_out_frames: 1000,
    data: { file_path: 'media/intro-loop.mp4', volume: 80, loop: false },
  });

  // ── 8. Camera Presets ───────────────────────────────────
  cameraPresetRepo.create({
    project_id: projectId,
    number: 1,
    label: 'Kamera 1 — Scena',
    color: '#3b82f6',
    default_channel: 'PGM',
    operator_name: 'Operator A',
  });
  cameraPresetRepo.create({
    project_id: projectId,
    number: 2,
    label: 'Kamera 2 — Publiczność',
    color: '#10b981',
    default_channel: 'ME1',
    operator_name: 'Operator B',
  });
  cameraPresetRepo.create({
    project_id: projectId,
    number: 3,
    label: 'Kamera 3 — Zbliżenie',
    color: '#f59e0b',
    default_channel: 'ME2',
    operator_name: 'Operator C',
  });

  console.log('[Seed] Dane demo utworzone pomyślnie.');
}
