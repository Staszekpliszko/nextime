import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { createTeamNoteRepo } from '../../electron/db/repositories/team-note.repo';
import { PlaybackEngine } from '../../electron/playback-engine';
import { RundownWsServer } from '../../electron/ws-server';
import { MockClock } from '../helpers/mock-clock';
import { connectAndHandshake, waitForEvent } from '../helpers/ws-test-helpers';

describe('TeamNotes WS Broadcast', () => {
  let db: Database.Database;
  let engine: PlaybackEngine;
  let server: RundownWsServer;
  let noteRepo: ReturnType<typeof createTeamNoteRepo>;
  let port: number;
  let clock: MockClock;
  let rundownId: string;

  beforeEach(async () => {
    db = createTestDb();
    clock = new MockClock();
    const cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);
    noteRepo = createTeamNoteRepo(db);

    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);
    cueRepo.create({ rundown_id: rundownId, title: 'Cue 1', duration_ms: 60_000, sort_order: 0 });

    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
    engine.loadRundown(rundownId);

    server = new RundownWsServer(engine, clock);
    port = await server.start(0);
  });

  afterEach(async () => {
    await server.stop();
    engine.destroy();
    db.close();
  });

  it('powinno broadcastować team-notes:delta po dodaniu notatki', async () => {
    const { ws } = await connectAndHandshake(port);

    // Stwórz notatkę i broadcastuj
    const note = noteRepo.create({
      rundown_id: rundownId,
      author_name: 'Reżyser',
      content: 'Test broadcast',
    });
    server.broadcastTeamNoteDelta(rundownId, 'added', note);

    // Odbierz event
    const envelope = await waitForEvent(ws, 'team-notes:delta', 2000);
    const payload = (envelope as Record<string, unknown>).payload as {
      rundown_id: string;
      change: { op: string; note: { id: string; content: string } };
    };

    expect(payload.rundown_id).toBe(rundownId);
    expect(payload.change.op).toBe('added');
    expect(payload.change.note.content).toBe('Test broadcast');

    ws.close();
  });

  it('powinno broadcastować team-notes:delta po oznaczeniu jako resolved', async () => {
    const { ws } = await connectAndHandshake(port);

    const note = noteRepo.create({
      rundown_id: rundownId,
      author_name: 'Producent',
      content: 'Do rozwiązania',
    });
    const resolved = noteRepo.toggleResolved(note.id, true);
    server.broadcastTeamNoteDelta(rundownId, 'resolved', resolved);

    const envelope = await waitForEvent(ws, 'team-notes:delta', 2000);
    const payload = (envelope as Record<string, unknown>).payload as {
      change: { op: string; note: { resolved: boolean } };
    };

    expect(payload.change.op).toBe('resolved');
    expect(payload.change.note.resolved).toBe(true);

    ws.close();
  });

  it('powinno broadcastować team-notes:delta po usunięciu notatki', async () => {
    const { ws } = await connectAndHandshake(port);

    const note = noteRepo.create({
      rundown_id: rundownId,
      author_name: 'Operator',
      content: 'Do usunięcia',
    });
    server.broadcastTeamNoteDelta(rundownId, 'deleted', note);

    const envelope = await waitForEvent(ws, 'team-notes:delta', 2000);
    const payload = (envelope as Record<string, unknown>).payload as {
      change: { op: string; note: { id: string } };
    };

    expect(payload.change.op).toBe('deleted');
    expect(payload.change.note.id).toBe(note.id);

    ws.close();
  });

  it('envelope powinien mieć poprawny format (event, payload, sent_at, seq)', async () => {
    const { ws } = await connectAndHandshake(port);

    const note = noteRepo.create({
      rundown_id: rundownId,
      author_name: 'Test',
      content: 'Format check',
    });
    server.broadcastTeamNoteDelta(rundownId, 'added', note);

    const envelope = await waitForEvent(ws, 'team-notes:delta', 2000) as Record<string, unknown>;

    expect(envelope.event).toBe('team-notes:delta');
    expect(envelope.payload).toBeDefined();
    expect(typeof envelope.sent_at).toBe('number');
    expect(typeof envelope.seq).toBe('number');

    ws.close();
  });
});
