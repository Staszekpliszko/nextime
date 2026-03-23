import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { createActRepo } from '../../electron/db/repositories/act.repo';
import { createTrackRepo } from '../../electron/db/repositories/track.repo';
import { createTimelineCueRepo } from '../../electron/db/repositories/timeline-cue.repo';
import { PlaybackEngine } from '../../electron/playback-engine';
import type { EngineRundownMsState, EngineTimelineFramesState } from '../../electron/playback-engine';
import { createHttpServer } from '../../electron/http-server';
import { MockClock } from '../helpers/mock-clock';
import type { Express } from 'express';

/** Helper — tworzy act do testów timeline */
function seedTestAct(db: Database.Database, rundownId: string): string {
  const id = `act-test-companion-${Date.now()}`;
  db.prepare(`
    INSERT INTO acts (id, rundown_id, name, sort_order, duration_frames, tc_offset_frames, fps, status, color)
    VALUES (?, ?, 'Test Act', 0, 7500, 0, 25, 'draft', '#2196F3')
  `).run(id, rundownId);
  return id;
}

/** Helper — tworzy track do testów timeline */
function seedTestTrack(db: Database.Database, actId: string, type: string): string {
  const id = `track-test-${type}-${Date.now()}`;
  db.prepare(`
    INSERT INTO tracks (id, act_id, type, name, sort_order)
    VALUES (?, ?, ?, ?, 0)
  `).run(id, actId, type, `Track ${type}`);
  return id;
}

/** Helper — tworzy vision cue na timeline */
function seedVisionCue(db: Database.Database, trackId: string, actId: string, tcIn: number, tcOut: number, cameraNumber: number): string {
  const id = `tlcue-vision-${cameraNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const data = JSON.stringify({ camera_number: cameraNumber, shot_name: `CAM ${cameraNumber}` });
  db.prepare(`
    INSERT INTO timeline_cues (id, track_id, act_id, type, tc_in_frames, tc_out_frames, data)
    VALUES (?, ?, ?, 'vision', ?, ?, ?)
  `).run(id, trackId, actId, tcIn, tcOut, data);
  return id;
}

// ── Testy Rundown endpoints ──────────────────────────────

describe('Companion Extended API — Rundown', () => {
  let db: Database.Database;
  let engine: PlaybackEngine;
  let app: Express;
  let clock: MockClock;
  let rundownId: string;
  let cueAId: string;
  let cueBId: string;

  beforeEach(() => {
    db = createTestDb();
    clock = new MockClock();
    const cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
    cueAId = cueRepo.create({ rundown_id: rundownId, title: 'Cue A', duration_ms: 60_000, sort_order: 0 }).id;
    cueBId = cueRepo.create({ rundown_id: rundownId, title: 'Cue B', duration_ms: 30_000, sort_order: 1 }).id;

    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
    engine.loadRundown(rundownId);
    app = createHttpServer(engine);
  });

  afterEach(() => {
    engine.destroy();
    db.close();
  });

  // ── /goto/:cueId ──

  it('GET /goto/:cueId — powinno skoczyć do konkretnego cue', async () => {
    const res = await request(app).get(`/api/rundown/${rundownId}/goto/${cueBId}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.current_cue_id).toBe(cueBId);
    expect((engine.getState() as EngineRundownMsState).currentCueTitle).toBe('Cue B');
  });

  it('GET /goto/:cueId — nieistniejący cue → 400', async () => {
    const res = await request(app).get(`/api/rundown/${rundownId}/goto/fake-cue-id`);
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('GET /goto/:cueId — wrong rundown ID → 404', async () => {
    const res = await request(app).get(`/api/rundown/wrong-id/goto/${cueBId}`);
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  // ── /state ──

  it('GET /state — poprawny format odpowiedzi z remaining/elapsed/over_under', async () => {
    engine.play();
    clock.advance(10_000); // 10s elapsed

    const res = await request(app).get(`/api/rundown/${rundownId}/state`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const data = res.body.data;
    expect(data.rundown_id).toBe(rundownId);
    expect(data.is_playing).toBe(true);
    expect(data.current_cue).toBeTruthy();
    expect(data.current_cue.id).toBe(cueAId);
    expect(data.current_cue.title).toBe('Cue A');
    expect(data.current_cue.index).toBe(0);
    expect(data.total_cues).toBe(2);
    expect(typeof data.remaining_ms).toBe('number');
    expect(typeof data.elapsed_ms).toBe('number');
    expect(typeof data.over_under_ms).toBe('number');
    expect(data.next_cue).toBeTruthy();
    expect(data.next_cue.id).toBe(cueBId);
  });

  it('GET /state — wrong ID → 404', async () => {
    const res = await request(app).get('/api/rundown/wrong-id/state');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  // ── /cues ──

  it('GET /cues — lista cue\'ów z tytułami, statusami i is_current', async () => {
    const res = await request(app).get(`/api/rundown/${rundownId}/cues`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const cues = res.body.data.cues;
    expect(cues).toHaveLength(2);
    expect(cues[0].title).toBe('Cue A');
    expect(cues[0].is_current).toBe(true);
    expect(cues[1].title).toBe('Cue B');
    expect(cues[1].is_current).toBe(false);
    expect(cues[0]).toHaveProperty('status');
    expect(cues[0]).toHaveProperty('duration_ms');
  });

  it('GET /cues — wrong rundown ID → 404', async () => {
    const res = await request(app).get('/api/rundown/wrong-id/cues');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  // ── /speed/:value ──

  it('GET /speed/abc — błędna wartość → 400', async () => {
    const res = await request(app).get(`/api/rundown/${rundownId}/speed/abc`);
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('speed');
  });

  it('GET /speed/0.01 — poza zakresem → 400', async () => {
    const res = await request(app).get(`/api/rundown/${rundownId}/speed/0.01`);
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

// ── Testy Act/Timeline endpoints ─────────────────────────

describe('Companion Extended API — Act/Timeline', () => {
  let db: Database.Database;
  let engine: PlaybackEngine;
  let app: Express;
  let clock: MockClock;
  let rundownId: string;
  let actId: string;

  beforeEach(() => {
    db = createTestDb();
    clock = new MockClock();
    const cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);
    const actRepo = createActRepo(db);
    const trackRepo = createTrackRepo(db);
    const timelineCueRepo = createTimelineCueRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);

    // Utwórz act z vision cue'ami
    actId = seedTestAct(db, rundownId);
    const visionTrackId = seedTestTrack(db, actId, 'vision');
    seedVisionCue(db, visionTrackId, actId, 0, 100, 1);
    seedVisionCue(db, visionTrackId, actId, 200, 400, 2);

    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
    engine.setTimelineRepos(actRepo, timelineCueRepo);
    engine.loadAct(actId);

    app = createHttpServer(engine);
  });

  afterEach(() => {
    if (engine) engine.destroy();
    if (db) db.close();
  });

  it('GET /act/:id/step_next — step do następnego vision cue', async () => {
    const res = await request(app).get(`/api/act/${actId}/step_next`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /act/:id/take_shot — force next vision cue', async () => {
    const res = await request(app).get(`/api/act/${actId}/take_shot`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /act/:id/hold_toggle — toggle hold mode', async () => {
    const res = await request(app).get(`/api/act/${actId}/hold_toggle`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.hold_mode).toBe(true);

    // Toggle znowu — powrót do false
    const res2 = await request(app).get(`/api/act/${actId}/hold_toggle`);
    expect(res2.body.data.hold_mode).toBe(false);
  });

  it('GET /act/:id/step_toggle — toggle step mode', async () => {
    const res = await request(app).get(`/api/act/${actId}/step_toggle`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.step_mode).toBe(true);
  });

  it('GET /act/:id/step_toggle — wrong act ID → 404', async () => {
    const res = await request(app).get('/api/act/wrong-act-id/step_toggle');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it('GET /speed/:value — zmiana prędkości w timeline mode', async () => {
    // Speed działa w timeline mode — endpoint jest pod /rundown/:id/speed ale engine jest w timeline mode
    // Użyjemy dowolnego ID bo engine sprawdza tylko czy stan istnieje
    const res = await request(app).get(`/api/rundown/${rundownId}/speed/2.0`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.speed).toBe(2.0);
    expect((engine.getState() as EngineTimelineFramesState).speed).toBe(2.0);
  });
});

// ── Testy ATEM i PTZ (bez prawdziwych senderów) ──────────

describe('Companion Extended API — ATEM & PTZ', () => {
  let db: Database.Database;
  let engine: PlaybackEngine;
  let app: Express;
  let clock: MockClock;

  beforeEach(() => {
    db = createTestDb();
    clock = new MockClock();
    const cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    const rundownId = seedTestRundown(db, projectId);
    cueRepo.create({ rundown_id: rundownId, title: 'Cue A', duration_ms: 60_000, sort_order: 0 });

    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
    engine.loadRundown(rundownId);
    // Bez senderManager — endpointy ATEM/PTZ powinny zwrócić 503
    app = createHttpServer(engine);
  });

  afterEach(() => {
    engine.destroy();
    db.close();
  });

  it('GET /atem/cut/:input — bez senderManager → 503', async () => {
    const res = await request(app).get('/api/atem/cut/1');
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('SenderManager');
  });

  it('GET /atem/cut/abc — błędny input → 400', async () => {
    const res = await request(app).get('/api/atem/cut/abc');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('GET /atem/preview/:input — bez senderManager → 503', async () => {
    const res = await request(app).get('/api/atem/preview/2');
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });

  it('GET /ptz/:camera/preset/:nr — bez senderManager → 503', async () => {
    const res = await request(app).get('/api/ptz/1/preset/5');
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });

  it('GET /ptz/abc/preset/1 — błędny numer kamery → 400', async () => {
    const res = await request(app).get('/api/ptz/abc/preset/1');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('GET /ptz/0/preset/1 — kamera poza zakresem → 400', async () => {
    const res = await request(app).get('/api/ptz/0/preset/1');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('GET /ptz/17/preset/1 — kamera poza zakresem → 400', async () => {
    const res = await request(app).get('/api/ptz/17/preset/1');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});
