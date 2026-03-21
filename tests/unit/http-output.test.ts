import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { createOutputConfigRepo } from '../../electron/db/repositories/output-config.repo';
import { createColumnRepo } from '../../electron/db/repositories/column.repo';
import { createCellRepo } from '../../electron/db/repositories/cell.repo';
import { PlaybackEngine } from '../../electron/playback-engine';
import { createHttpServer } from '../../electron/http-server';
import { MockClock } from '../helpers/mock-clock';
import type { Express } from 'express';
import crypto from 'crypto';

describe('HTTP Output Endpoints (Faza 9)', () => {
  let db: Database.Database;
  let engine: PlaybackEngine;
  let app: Express;
  let clock: MockClock;
  let rundownId: string;
  let outputConfigRepo: ReturnType<typeof createOutputConfigRepo>;
  let cueRepo: ReturnType<typeof createCueRepo>;
  let columnRepo: ReturnType<typeof createColumnRepo>;
  let cellRepo: ReturnType<typeof createCellRepo>;

  beforeEach(() => {
    db = createTestDb();
    clock = new MockClock();
    cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);
    outputConfigRepo = createOutputConfigRepo(db);
    columnRepo = createColumnRepo(db);
    cellRepo = createCellRepo(db);

    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);

    cueRepo.create({ rundown_id: rundownId, title: 'Cue A', subtitle: 'Subtitle A', duration_ms: 60_000, sort_order: 0 });
    cueRepo.create({ rundown_id: rundownId, title: 'Cue B', subtitle: 'Subtitle B', duration_ms: 30_000, sort_order: 1 });

    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
    engine.loadRundown(rundownId);

    app = createHttpServer(engine, {
      outputConfigRepo,
      cueRepo,
      columnRepo,
      cellRepo,
      rundownRepo: rundownRepo,
      wsPort: 3141,
    });
  });

  afterEach(() => {
    engine.destroy();
    db.close();
  });

  // ── Companion endpoints nadal działają ────────────────────

  it('Companion GET .../start — powinno nadal działać', async () => {
    const res = await request(app).get(`/api/rundown/${rundownId}/start`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // ── Output config API ─────────────────────────────────────

  it('GET /api/output/:token/config — powinno zwrócić konfigurację', async () => {
    const token = crypto.randomUUID();
    outputConfigRepo.create({
      rundown_id: rundownId,
      name: 'Test Output',
      layout: 'list',
      share_token: token,
    });

    const res = await request(app).get(`/api/output/${token}/config`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.config.name).toBe('Test Output');
    expect(res.body.config.layout).toBe('list');
    expect(res.body.config.share_token).toBe(token);
  });

  it('GET /api/output/:token/config — powinno zwrócić 404 dla złego tokenu', async () => {
    const res = await request(app).get('/api/output/non-existent-token/config');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it('GET /api/output/:token/cues — powinno zwrócić cue\'y rundownu', async () => {
    const token = crypto.randomUUID();
    outputConfigRepo.create({
      rundown_id: rundownId,
      name: 'Cues Output',
      share_token: token,
    });

    const res = await request(app).get(`/api/output/${token}/cues`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cues).toHaveLength(2);
    expect(res.body.cues[0].title).toBe('Cue A');
    expect(res.body.cues[1].title).toBe('Cue B');
  });

  it('GET /api/output/:token/cues — powinno zwrócić 404 dla złego tokenu', async () => {
    const res = await request(app).get('/api/output/bad-token/cues');
    expect(res.status).toBe(404);
  });

  it('GET /api/output/:token/state — powinno zwrócić stan playbacku', async () => {
    const token = crypto.randomUUID();
    outputConfigRepo.create({
      rundown_id: rundownId,
      name: 'State Output',
      share_token: token,
    });

    const res = await request(app).get(`/api/output/${token}/state`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.timesnap).toBeDefined();
    expect(res.body.ws_port).toBe(3141);
  });

  // ── Script endpoint (prompter) ────────────────────────────

  it('GET /api/output/:token/script — powinno zwrócić skrypt z tytułami', async () => {
    const token = crypto.randomUUID();
    outputConfigRepo.create({
      rundown_id: rundownId,
      name: 'Prompter',
      layout: 'prompter',
      share_token: token,
    });

    const res = await request(app).get(`/api/output/${token}/script`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.script).toHaveLength(2);
    expect(res.body.script[0].title).toBe('Cue A');
    expect(res.body.script[0].script_text).toBe(''); // brak kolumny script
  });

  it('GET /api/output/:token/script — powinno zwrócić tekst z kolumny script', async () => {
    // Utwórz kolumnę script
    const column = columnRepo.create({
      rundown_id: rundownId,
      name: 'Script',
      type: 'richtext',
      is_script: true,
    });

    // Pobierz cue'y i dodaj tekst do celi
    const cues = cueRepo.findByRundown(rundownId);
    cellRepo.create({
      cue_id: cues[0]!.id,
      column_id: column.id,
      content_type: 'richtext',
      richtext: 'Witaj w pierwszym bloku skryptu.',
    });
    cellRepo.create({
      cue_id: cues[1]!.id,
      column_id: column.id,
      content_type: 'richtext',
      richtext: 'Drugi blok tekstu promptera.',
    });

    const token = crypto.randomUUID();
    outputConfigRepo.create({
      rundown_id: rundownId,
      name: 'Prompter ze skryptem',
      layout: 'prompter',
      column_id: column.id,
      share_token: token,
    });

    const res = await request(app).get(`/api/output/${token}/script`);
    expect(res.status).toBe(200);
    expect(res.body.script[0].script_text).toBe('Witaj w pierwszym bloku skryptu.');
    expect(res.body.script[1].script_text).toBe('Drugi blok tekstu promptera.');
  });

  // ── HTML endpoint ──────────────────────────────────────────

  it('GET /output/:token — powinno zwrócić HTML dla layout=list', async () => {
    const token = crypto.randomUUID();
    outputConfigRepo.create({
      rundown_id: rundownId,
      name: 'HTML List',
      layout: 'list',
      share_token: token,
    });

    const res = await request(app).get(`/output/${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('html');
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('NextTime');
    expect(res.text).toContain('Output (List)');
  });

  it('GET /output/:token — powinno zwrócić HTML dla layout=single', async () => {
    const token = crypto.randomUUID();
    outputConfigRepo.create({
      rundown_id: rundownId,
      name: 'HTML Single',
      layout: 'single',
      share_token: token,
      settings: { time_of_day: 'on' },
    });

    const res = await request(app).get(`/output/${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Output (Single)');
    expect(res.text).toContain('timeOfDay'); // element czasu dnia
  });

  it('GET /output/:token — powinno zwrócić HTML dla layout=prompter', async () => {
    const token = crypto.randomUUID();
    outputConfigRepo.create({
      rundown_id: rundownId,
      name: 'HTML Prompter',
      layout: 'prompter',
      share_token: token,
      settings: {
        prompter_text_size: 72,
        prompter_uppercase: true,
      },
    });

    const res = await request(app).get(`/output/${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Prompter');
    expect(res.text).toContain('72px'); // text size
    expect(res.text).toContain('text-transform: uppercase');
  });

  it('GET /output/:token — powinno zwrócić 404 HTML dla złego tokenu', async () => {
    const res = await request(app).get('/output/non-existent-token');
    expect(res.status).toBe(404);
    expect(res.text).toContain('404');
  });

  it('GET /output/:token — powinno zwrócić HTML z mirror mode', async () => {
    const token = crypto.randomUUID();
    outputConfigRepo.create({
      rundown_id: rundownId,
      name: 'Mirror Prompter',
      layout: 'prompter',
      share_token: token,
      settings: { mirror: 'vertical' },
    });

    const res = await request(app).get(`/output/${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('scaleX(-1)');
  });

  // ── Endpoint cells (Faza 13) ─────────────────────────────

  it('GET /api/output/:token/cells — powinno zwrócić komórki z kolumnami', async () => {
    // Utwórz kolumnę
    const column = columnRepo.create({
      rundown_id: rundownId,
      name: 'Camera',
      type: 'richtext',
    });

    // Pobierz cue'y i dodaj komórki
    const cues = cueRepo.findByRundown(rundownId);
    cellRepo.create({
      cue_id: cues[0]!.id,
      column_id: column.id,
      content_type: 'richtext',
      richtext: 'Kamera 1',
    });

    const token = crypto.randomUUID();
    outputConfigRepo.create({
      rundown_id: rundownId,
      name: 'Cells Output',
      layout: 'list',
      share_token: token,
    });

    const res = await request(app).get(`/api/output/${token}/cells`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cells).toHaveLength(2);
    // Pierwszy cue ma komórkę
    expect(res.body.cells[0].cells).toHaveLength(1);
    expect(res.body.cells[0].cells[0].column_name).toBe('Camera');
    expect(res.body.cells[0].cells[0].text).toBe('Kamera 1');
    // Drugi cue nie ma komórki
    expect(res.body.cells[1].cells).toHaveLength(0);
  });

  it('GET /api/output/:token/cells — powinno zwrócić 404 dla złego tokenu', async () => {
    const res = await request(app).get('/api/output/bad-token/cells');
    expect(res.status).toBe(404);
  });

  // ── Bezpieczeństwo ────────────────────────────────────────

  it('powinno nie zwrócić danych dla innego rundownu przez token', async () => {
    // Token jest powiązany z rundownem — nie da się dostać do innego rundownu
    const token = crypto.randomUUID();
    outputConfigRepo.create({
      rundown_id: rundownId,
      name: 'Secure',
      share_token: token,
    });

    const res = await request(app).get(`/api/output/${token}/cues`);
    expect(res.status).toBe(200);
    // Sprawdzenie: cue'y pochodzą z właściwego rundownu
    expect(res.body.cues.every((c: { title: string }) =>
      c.title === 'Cue A' || c.title === 'Cue B'
    )).toBe(true);
  });
});
