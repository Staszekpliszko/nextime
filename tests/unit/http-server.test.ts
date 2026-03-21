import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { PlaybackEngine } from '../../electron/playback-engine';
import type { EngineRundownMsState } from '../../electron/playback-engine';
import { createHttpServer } from '../../electron/http-server';
import { MockClock } from '../helpers/mock-clock';
import type { Express } from 'express';

describe('HttpServer (Companion API)', () => {
  let db: Database.Database;
  let engine: PlaybackEngine;
  let app: Express;
  let clock: MockClock;
  let rundownId: string;

  beforeEach(() => {
    db = createTestDb();
    clock = new MockClock();
    const cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
    cueRepo.create({ rundown_id: rundownId, title: 'Cue A', duration_ms: 60_000, sort_order: 0 });
    cueRepo.create({ rundown_id: rundownId, title: 'Cue B', duration_ms: 30_000, sort_order: 1 });

    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
    engine.loadRundown(rundownId);
    app = createHttpServer(engine);
  });

  afterEach(() => {
    engine.destroy();
    db.close();
  });

  it('GET /api/rundown/:id/start — powinno rozpocząć odtwarzanie', async () => {
    const res = await request(app).get(`/api/rundown/${rundownId}/start`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.timesnap).toHaveProperty('tc_mode', 'rundown_ms');
    expect((engine.getState() as EngineRundownMsState).is_playing).toBe(true);
  });

  it('GET /api/rundown/:id/pause — powinno zatrzymać odtwarzanie', async () => {
    engine.play();
    const res = await request(app).get(`/api/rundown/${rundownId}/pause`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((engine.getState() as EngineRundownMsState).is_playing).toBe(false);
  });

  it('GET /api/rundown/:id/next — powinno przejść na następny cue', async () => {
    const res = await request(app).get(`/api/rundown/${rundownId}/next`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((engine.getState() as EngineRundownMsState).currentCueTitle).toBe('Cue B');
  });

  it('GET /api/rundown/:id/prev — powinno wrócić na poprzedni cue', async () => {
    engine.next();
    const res = await request(app).get(`/api/rundown/${rundownId}/prev`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((engine.getState() as EngineRundownMsState).currentCueTitle).toBe('Cue A');
  });

  it('GET /api/rundown/:id/start z wrong ID — powinno zwrócić 404', async () => {
    const res = await request(app).get('/api/rundown/wrong-id/start');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it('GET /api/unknown — powinno zwrócić 404', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.status).toBe(404);
  });
});
