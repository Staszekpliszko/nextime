import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTestUser, seedTestEvent, seedTestProject } from '../helpers/test-db';
import { seedDemoData } from '../../electron/db/seed-demo';
import {
  createRundownRepo, createCueRepo, createColumnRepo, createCellRepo,
  createTextVariableRepo, createCueGroupRepo,
  createActRepo, createTrackRepo, createTimelineCueRepo, createCameraPresetRepo,
} from '../../electron/db/repositories';
import type { SeedRepos } from '../../electron/db/seed-demo';
import type Database from 'better-sqlite3';

describe('seedDemoData', () => {
  let db: Database.Database;
  let repos: SeedRepos;
  let projectId: string;

  beforeEach(() => {
    db = createTestDb();
    const userId = seedTestUser(db);
    const eventId = seedTestEvent(db, userId);
    projectId = seedTestProject(db, userId, { event_id: eventId });

    repos = {
      rundownRepo: createRundownRepo(db),
      cueRepo: createCueRepo(db),
      columnRepo: createColumnRepo(db),
      cellRepo: createCellRepo(db),
      textVariableRepo: createTextVariableRepo(db),
      cueGroupRepo: createCueGroupRepo(db),
      actRepo: createActRepo(db),
      trackRepo: createTrackRepo(db),
      timelineCueRepo: createTimelineCueRepo(db),
      cameraPresetRepo: createCameraPresetRepo(db),
    };
  });

  it('powinno utworzyć rundown z poprawną nazwą', () => {
    seedDemoData(projectId, repos);
    const rundowns = repos.rundownRepo.findAll();
    expect(rundowns).toHaveLength(1);
    expect(rundowns[0]!.name).toBe('Gala AS Media 2026');
    expect(rundowns[0]!.venue).toBe('Hala Expo Kraków');
  });

  it('powinno utworzyć 12 cue\'ów', () => {
    seedDemoData(projectId, repos);
    const rundowns = repos.rundownRepo.findAll();
    const cues = repos.cueRepo.findByRundown(rundowns[0]!.id);
    expect(cues).toHaveLength(12);
  });

  it('powinno mieć mieszankę soft i hard start cue\'ów', () => {
    seedDemoData(projectId, repos);
    const rundowns = repos.rundownRepo.findAll();
    const cues = repos.cueRepo.findByRundown(rundowns[0]!.id);
    const hardCues = cues.filter(c => c.start_type === 'hard');
    const softCues = cues.filter(c => c.start_type === 'soft');
    expect(hardCues.length).toBe(2);
    expect(softCues.length).toBe(10);
  });

  it('powinno utworzyć cue\'y z realistycznymi czasami (30s-5min)', () => {
    seedDemoData(projectId, repos);
    const rundowns = repos.rundownRepo.findAll();
    const cues = repos.cueRepo.findByRundown(rundowns[0]!.id);
    for (const cue of cues) {
      expect(cue.duration_ms).toBeGreaterThanOrEqual(30_000);
      expect(cue.duration_ms).toBeLessThanOrEqual(300_000);
    }
  });

  it('powinno utworzyć 2 grupy cue\'ów', () => {
    seedDemoData(projectId, repos);
    const rundowns = repos.rundownRepo.findAll();
    const groups = repos.cueGroupRepo.findByRundown(rundowns[0]!.id);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.label).toBe('Blok 1 — Otwarcie');
    expect(groups[1]!.label).toBe('Blok 2 — Program');
  });

  it('powinno utworzyć 3 kolumny dynamiczne', () => {
    seedDemoData(projectId, repos);
    const rundowns = repos.rundownRepo.findAll();
    const columns = repos.columnRepo.findByRundown(rundowns[0]!.id);
    expect(columns).toHaveLength(3);
    const names = columns.map(c => c.name);
    expect(names).toContain('Skrypt');
    expect(names).toContain('Audio');
    expect(names).toContain('Grafika');
  });

  it('powinno kolumna Audio mieć dropdown opcje BGM/VO/OFF/SFX', () => {
    seedDemoData(projectId, repos);
    const rundowns = repos.rundownRepo.findAll();
    const columns = repos.columnRepo.findByRundown(rundowns[0]!.id);
    const audioCol = columns.find(c => c.name === 'Audio');
    expect(audioCol).toBeDefined();
    expect(audioCol!.type).toBe('dropdown');
    expect(audioCol!.dropdown_options).toEqual(['BGM', 'VO', 'OFF', 'SFX']);
  });

  it('powinno utworzyć 4 zmienne tekstowe', () => {
    seedDemoData(projectId, repos);
    const rundowns = repos.rundownRepo.findAll();
    const vars = repos.textVariableRepo.findByRundown(rundowns[0]!.id);
    expect(vars).toHaveLength(4);
    const keys = vars.map(v => v.key);
    expect(keys).toContain('presenter');
    expect(keys).toContain('date');
    expect(keys).toContain('venue');
    expect(keys).toContain('sponsor');
  });

  it('powinno utworzyć Act z 5 trackami', () => {
    seedDemoData(projectId, repos);
    const rundowns = repos.rundownRepo.findAll();
    const acts = repos.actRepo.findByRundown(rundowns[0]!.id);
    expect(acts).toHaveLength(1);
    expect(acts[0]!.name).toBe('Koncert Główny');
    expect(acts[0]!.fps).toBe(25);
    expect(acts[0]!.duration_frames).toBe(45000);

    const tracks = repos.trackRepo.findByAct(acts[0]!.id);
    expect(tracks).toHaveLength(5);
    const types = tracks.map(t => t.type);
    expect(types).toContain('vision');
    expect(types).toContain('lyrics');
    expect(types).toContain('osc');
    expect(types).toContain('midi');
    expect(types).toContain('media');
  });

  it('powinno utworzyć 3 camera presety', () => {
    seedDemoData(projectId, repos);
    const presets = repos.cameraPresetRepo.findByProject(projectId);
    expect(presets).toHaveLength(3);
    expect(presets[0]!.label).toContain('Kamera 1');
    expect(presets[1]!.label).toContain('Kamera 2');
    expect(presets[2]!.label).toContain('Kamera 3');
  });

  it('powinno być idempotentne — drugie wywołanie nie tworzy duplikatów', () => {
    seedDemoData(projectId, repos);
    seedDemoData(projectId, repos); // drugie wywołanie

    const rundowns = repos.rundownRepo.findAll();
    expect(rundowns).toHaveLength(1);
  });

  it('powinno utworzyć komórki z treścią', () => {
    seedDemoData(projectId, repos);
    const rundowns = repos.rundownRepo.findAll();
    const cues = repos.cueRepo.findByRundown(rundowns[0]!.id);
    // Opening powinien mieć komórkę skryptu
    const openingCells = repos.cellRepo.findByCue(cues[0]!.id);
    expect(openingCells.length).toBeGreaterThanOrEqual(1);
  });
});
