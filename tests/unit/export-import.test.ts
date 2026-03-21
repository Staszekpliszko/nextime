import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTestUser, seedTestEvent, seedTestProject } from '../helpers/test-db';
import { seedDemoData } from '../../electron/db/seed-demo';
import { exportRundownToJson, importRundownFromJson } from '../../electron/export-import';
import type { ExportImportRepos, RundownExportData } from '../../electron/export-import';
import type { SeedRepos } from '../../electron/db/seed-demo';
import {
  createRundownRepo, createCueRepo, createColumnRepo, createCellRepo,
  createTextVariableRepo, createCueGroupRepo,
  createActRepo, createTrackRepo, createTimelineCueRepo, createCameraPresetRepo,
} from '../../electron/db/repositories';
import type Database from 'better-sqlite3';

describe('export/import rundownu', () => {
  let db: Database.Database;
  let repos: SeedRepos & ExportImportRepos;
  let projectId: string;
  let rundownId: string;

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

    // Seed demo do testów exportu
    seedDemoData(projectId, repos);
    const rundowns = repos.rundownRepo.findAll();
    rundownId = rundowns[0]!.id;
  });

  // ── Export ────────────────────────────────────────────────

  describe('exportRundownToJson', () => {
    it('powinno zwrócić poprawną strukturę JSON', () => {
      const data = exportRundownToJson(rundownId, repos);
      expect(data.version).toBe(1);
      expect(data.app).toBe('nextime');
      expect(data.exported_at).toBeDefined();
      expect(data.rundown.name).toBe('Gala AS Media 2026');
    });

    it('powinno eksportować 12 cue\'ów', () => {
      const data = exportRundownToJson(rundownId, repos);
      expect(data.cues).toHaveLength(12);
    });

    it('powinno eksportować 3 kolumny', () => {
      const data = exportRundownToJson(rundownId, repos);
      expect(data.columns).toHaveLength(3);
    });

    it('powinno eksportować grupy z ref', () => {
      const data = exportRundownToJson(rundownId, repos);
      expect(data.groups).toHaveLength(2);
      expect(data.groups[0]!.ref).toBeDefined();
      expect(data.groups[1]!.ref).toBeDefined();
    });

    it('powinno eksportować zmienne tekstowe', () => {
      const data = exportRundownToJson(rundownId, repos);
      expect(data.variables).toHaveLength(4);
      const keys = data.variables.map(v => v.key);
      expect(keys).toContain('presenter');
    });

    it('powinno eksportować cells z indeksami cue i kolumny', () => {
      const data = exportRundownToJson(rundownId, repos);
      expect(data.cells.length).toBeGreaterThan(0);
      for (const cell of data.cells) {
        expect(cell.cue_index).toBeGreaterThanOrEqual(0);
        expect(cell.cue_index).toBeLessThan(12);
        expect(cell.column_index).toBeGreaterThanOrEqual(0);
        expect(cell.column_index).toBeLessThan(3);
      }
    });

    it('powinno rzucić błąd dla nieistniejącego rundownu', () => {
      expect(() => exportRundownToJson('non-existent', repos)).toThrow('nie istnieje');
    });
  });

  // ── Import ────────────────────────────────────────────────

  describe('importRundownFromJson', () => {
    it('powinno zaimportować rundown z nowymi UUID', () => {
      const exported = exportRundownToJson(rundownId, repos);
      const newId = importRundownFromJson(exported, projectId, repos);

      expect(newId).toBeDefined();
      expect(newId).not.toBe(rundownId);

      const newRundown = repos.rundownRepo.findById(newId);
      expect(newRundown).toBeDefined();
      expect(newRundown!.name).toBe('Gala AS Media 2026');
    });

    it('powinno roundtrip zachować liczbę cue\'ów', () => {
      const exported = exportRundownToJson(rundownId, repos);
      const newId = importRundownFromJson(exported, projectId, repos);

      const originalCues = repos.cueRepo.findByRundown(rundownId);
      const importedCues = repos.cueRepo.findByRundown(newId);
      expect(importedCues).toHaveLength(originalCues.length);
    });

    it('powinno roundtrip zachować kolumny', () => {
      const exported = exportRundownToJson(rundownId, repos);
      const newId = importRundownFromJson(exported, projectId, repos);

      const originalCols = repos.columnRepo.findByRundown(rundownId);
      const importedCols = repos.columnRepo.findByRundown(newId);
      expect(importedCols).toHaveLength(originalCols.length);

      // Sprawdź nazwy
      const origNames = originalCols.map(c => c.name).sort();
      const impNames = importedCols.map(c => c.name).sort();
      expect(impNames).toEqual(origNames);
    });

    it('powinno roundtrip zachować grupy cue\'ów', () => {
      const exported = exportRundownToJson(rundownId, repos);
      const newId = importRundownFromJson(exported, projectId, repos);

      const originalGroups = repos.cueGroupRepo.findByRundown(rundownId);
      const importedGroups = repos.cueGroupRepo.findByRundown(newId);
      expect(importedGroups).toHaveLength(originalGroups.length);
    });

    it('powinno roundtrip zachować zmienne', () => {
      const exported = exportRundownToJson(rundownId, repos);
      const newId = importRundownFromJson(exported, projectId, repos);

      const originalVars = repos.textVariableRepo.findByRundown(rundownId);
      const importedVars = repos.textVariableRepo.findByRundown(newId);
      expect(importedVars).toHaveLength(originalVars.length);

      const origKeys = originalVars.map(v => v.key).sort();
      const impKeys = importedVars.map(v => v.key).sort();
      expect(impKeys).toEqual(origKeys);
    });

    it('powinno roundtrip zachować przypisanie cue\'ów do grup', () => {
      const exported = exportRundownToJson(rundownId, repos);
      const newId = importRundownFromJson(exported, projectId, repos);

      const importedCues = repos.cueRepo.findByRundown(newId);
      const importedGroups = repos.cueGroupRepo.findByRundown(newId);
      const groupIds = new Set(importedGroups.map(g => g.id));

      // Każdy cue z group_id powinien wskazywać na istniejącą grupę
      const cuesWithGroup = importedCues.filter(c => c.group_id);
      expect(cuesWithGroup.length).toBeGreaterThan(0);
      for (const cue of cuesWithGroup) {
        expect(groupIds.has(cue.group_id!)).toBe(true);
      }
    });

    it('powinno roundtrip zachować cells z treścią', () => {
      const exported = exportRundownToJson(rundownId, repos);
      const newId = importRundownFromJson(exported, projectId, repos);

      const importedCues = repos.cueRepo.findByRundown(newId);
      // Sprawdź że pierwszy cue (Opening) ma komórki
      const cells = repos.cellRepo.findByCue(importedCues[0]!.id);
      expect(cells.length).toBeGreaterThanOrEqual(1);
    });

    it('powinno generować nowe UUID — brak kolizji', () => {
      const exported = exportRundownToJson(rundownId, repos);
      const newId = importRundownFromJson(exported, projectId, repos);

      const originalCues = repos.cueRepo.findByRundown(rundownId);
      const importedCues = repos.cueRepo.findByRundown(newId);

      const originalIds = new Set(originalCues.map(c => c.id));
      for (const cue of importedCues) {
        expect(originalIds.has(cue.id)).toBe(false);
      }
    });
  });

  // ── Walidacja import ──────────────────────────────────────

  describe('walidacja importu', () => {
    it('powinno odrzucić null', () => {
      expect(() => importRundownFromJson(null, projectId, repos)).toThrow('Nieprawidłowy format');
    });

    it('powinno odrzucić string', () => {
      expect(() => importRundownFromJson('not json', projectId, repos)).toThrow('Nieprawidłowy format');
    });

    it('powinno odrzucić nieprawidłową wersję', () => {
      expect(() => importRundownFromJson({ version: 99, app: 'nextime', rundown: { name: 'x' } }, projectId, repos)).toThrow('Nieobsługiwana wersja');
    });

    it('powinno odrzucić nieprawidłową aplikację', () => {
      expect(() => importRundownFromJson({ version: 1, app: 'other', rundown: { name: 'x' } }, projectId, repos)).toThrow('Nieprawidłowa aplikacja');
    });

    it('powinno odrzucić brak sekcji rundown', () => {
      expect(() => importRundownFromJson({ version: 1, app: 'nextime' }, projectId, repos)).toThrow('Brak sekcji');
    });

    it('powinno odrzucić brak nazwy rundownu', () => {
      expect(() => importRundownFromJson({ version: 1, app: 'nextime', rundown: {} }, projectId, repos)).toThrow('Brak nazwy');
    });

    it('powinno zaimportować minimalny plik (tylko rundown)', () => {
      const minimal = { version: 1, app: 'nextime', rundown: { name: 'Minimalny' } };
      const newId = importRundownFromJson(minimal, projectId, repos);
      const imported = repos.rundownRepo.findById(newId);
      expect(imported).toBeDefined();
      expect(imported!.name).toBe('Minimalny');
    });
  });
});
