import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../../helpers/test-db';
import {
  createRundownRepo,
  createColumnRepo,
  createCueRepo,
  createCellRepo,
  createCueGroupRepo,
  createTextVariableRepo,
  createOutputConfigRepo,
  createPrivateNoteRepo,
  createActRepo,
  createTrackRepo,
  createTimelineCueRepo,
  createMediaFileRepo,
  createProjectRepo,
  createEventRepo,
} from '../../../electron/db/repositories';

describe('Cascade Delete — testy integracyjne', () => {
  let db: Database.Database;
  let userId: string;
  let projectId: string;
  let rundownId: string;

  beforeEach(() => {
    db = createTestDb();
    userId = seedTestUser(db);
    projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
  });

  afterEach(() => { db.close(); });

  it('usunięcie rundownu kasuje: cues, cells, columns, groups, text_variables, output_configs, private_notes, acts', () => {
    const colRepo = createColumnRepo(db);
    const cueRepo = createCueRepo(db);
    const cellRepo = createCellRepo(db);
    const groupRepo = createCueGroupRepo(db);
    const tvRepo = createTextVariableRepo(db);
    const ocRepo = createOutputConfigRepo(db);
    const noteRepo = createPrivateNoteRepo(db);
    const actRepo = createActRepo(db);
    const trackRepo = createTrackRepo(db);
    const tlRepo = createTimelineCueRepo(db);
    const rundownRepo = createRundownRepo(db);

    // Budujemy pełną hierarchię
    const col = colRepo.create({ rundown_id: rundownId, name: 'Camera' });
    const group = groupRepo.create({ rundown_id: rundownId, label: 'Act 1' });
    const cue = cueRepo.create({ rundown_id: rundownId, title: 'Cue 1', group_id: group.id });
    const cell = cellRepo.create({ cue_id: cue.id, column_id: col.id, dropdown_value: 'Cam 1' });
    const note = noteRepo.create({ cue_id: cue.id, user_id: userId, content: 'Priv note' });
    const tv = tvRepo.create({ rundown_id: rundownId, key: 'host', value: 'Jan' });
    const oc = ocRepo.create({ rundown_id: rundownId, name: 'Mon', share_token: 'tok-casc' });
    const act = actRepo.create({ rundown_id: rundownId, name: 'Song 1' });
    const track = trackRepo.create({ act_id: act.id, type: 'vision', name: 'V' });
    const tlCue = tlRepo.create({
      track_id: track.id, act_id: act.id, type: 'vision',
      tc_in_frames: 0, tc_out_frames: 100,
    });

    // Usuwamy rundown
    rundownRepo.delete(rundownId);

    // Wszystko powinno być usunięte kaskadowo
    expect(colRepo.findById(col.id)).toBeUndefined();
    expect(groupRepo.findById(group.id)).toBeUndefined();
    expect(cueRepo.findById(cue.id)).toBeUndefined();
    expect(cellRepo.findById(cell.id)).toBeUndefined();
    expect(noteRepo.findById(note.id)).toBeUndefined();
    expect(tvRepo.findById(tv.id)).toBeUndefined();
    expect(ocRepo.findById(oc.id)).toBeUndefined();
    expect(actRepo.findById(act.id)).toBeUndefined();
    expect(trackRepo.findById(track.id)).toBeUndefined();
    expect(tlRepo.findById(tlCue.id)).toBeUndefined();
  });

  it('usunięcie projektu kasuje: rundowny, project_members, camera_presets', () => {
    const projectRepo = createProjectRepo(db);
    const rundownRepo = createRundownRepo(db);

    const r = rundownRepo.create({ project_id: projectId, name: 'R' });
    projectRepo.addMember({ project_id: projectId, user_id: userId, role: 'owner' });
    projectRepo.createPreset({ project_id: projectId, number: 1, label: 'Cam 1' });

    projectRepo.delete(projectId);

    expect(rundownRepo.findById(r.id)).toBeUndefined();
    expect(projectRepo.findMembersByProject(projectId).length).toBe(0);
    expect(projectRepo.findPresetsByProject(projectId).length).toBe(0);
  });

  it('usunięcie eventu kasuje: event_guests', () => {
    const eventRepo = createEventRepo(db);
    const event = eventRepo.create({ owner_id: userId, name: 'E', slug: 'e-integ' });
    eventRepo.createGuest({ event_id: event.id, share_token: 'int-tok' });

    eventRepo.delete(event.id);

    expect(eventRepo.findGuestsByEvent(event.id).length).toBe(0);
  });
});

describe('Unique Constraints — testy integracyjne', () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('users: email musi być unikalny', () => {
    const repo = createUserRepo(db);
    repo.create({ name: 'A', email: 'unique@test.pl', password_hash: 'h' });
    expect(() => repo.create({ name: 'B', email: 'unique@test.pl', password_hash: 'h' })).toThrow();
  });

  it('projects: slug musi być unikalny', () => {
    const userId = seedTestUser(db);
    const repo = createProjectRepo(db);
    repo.create({ owner_id: userId, name: 'A', slug: 'unique-slug' });
    expect(() => repo.create({ owner_id: userId, name: 'B', slug: 'unique-slug' })).toThrow();
  });

  it('text_variables: (rundown_id, key) musi być unikalne', () => {
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    const rundownId = seedTestRundown(db, projectId);
    const repo = createTextVariableRepo(db);
    repo.create({ rundown_id: rundownId, key: 'host' });
    expect(() => repo.create({ rundown_id: rundownId, key: 'host' })).toThrow();
  });

  it('cells: (cue_id, column_id) musi być unikalne', () => {
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    const rundownId = seedTestRundown(db, projectId);
    const cueId = createCueRepo(db).create({ rundown_id: rundownId, title: 'C' }).id;
    const colId = createColumnRepo(db).create({ rundown_id: rundownId, name: 'Col' }).id;
    const repo = createCellRepo(db);
    repo.create({ cue_id: cueId, column_id: colId });
    expect(() => repo.create({ cue_id: cueId, column_id: colId })).toThrow();
  });
});

describe('Trigger updated_at — testy integracyjne', () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('updated_at zmienia się po UPDATE usera', async () => {
    const repo = createUserRepo(db);
    const user = repo.create({ name: 'Old', email: 'upd@t.pl', password_hash: 'h' });
    const oldUpdated = user.updated_at;

    // SQLite strftime ma rozdzielczość milisekundową, ale trigger jest instant
    // Wymuszamy opóźnienie by zobaczyć różnicę
    await new Promise(r => setTimeout(r, 10));

    const updated = repo.update(user.id, { name: 'New' });
    expect(updated?.updated_at).not.toBe(oldUpdated);
  });

  it('updated_at zmienia się po UPDATE cue', async () => {
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    const rundownId = seedTestRundown(db, projectId);
    const repo = createCueRepo(db);
    const cue = repo.create({ rundown_id: rundownId, title: 'T' });
    const oldUpdated = cue.updated_at;

    await new Promise(r => setTimeout(r, 10));

    const updated = repo.update(cue.id, { title: 'New' });
    expect(updated?.updated_at).not.toBe(oldUpdated);
  });
});

// Import for unique constraints tests
import { createUserRepo } from '../../../electron/db/repositories/user.repo';
