import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { PlaybackEngine } from '../../electron/playback-engine';
import { RundownWsServer } from '../../electron/ws-server';
import { MockClock } from '../helpers/mock-clock';
import { connectAndHandshake, waitForEvent } from '../helpers/ws-test-helpers';
import type Database from 'better-sqlite3';
import type { RundownChange } from '../../electron/ws-protocol-types';

/**
 * Testy integracyjne: CRUD cue → WS broadcast rundown:delta.
 * Weryfikują że zmiany w bazie są widoczne przez WS.
 */

let db: Database.Database;
let cueRepo: ReturnType<typeof createCueRepo>;
let rundownRepo: ReturnType<typeof createRundownRepo>;
let engine: PlaybackEngine;
let wsServer: RundownWsServer;
let clock: MockClock;
let port: number;
let rundownId: string;

beforeEach(async () => {
  db = createTestDb();
  cueRepo = createCueRepo(db);
  rundownRepo = createRundownRepo(db);

  const userId = seedTestUser(db);
  const projectId = seedTestProject(db, userId);
  rundownId = seedTestRundown(db, projectId);

  // Seed: 2 cue'y w rundownie (engine wymaga min. 1)
  cueRepo.create({ rundown_id: rundownId, title: 'Cue Initial 1', sort_order: 0, duration_ms: 30_000 });
  cueRepo.create({ rundown_id: rundownId, title: 'Cue Initial 2', sort_order: 1, duration_ms: 45_000 });

  clock = new MockClock(1_000_000_000_000);
  engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
  engine.loadRundown(rundownId);

  wsServer = new RundownWsServer(engine, clock);
  port = await wsServer.start(0);
});

afterEach(async () => {
  await wsServer.stop();
  db.close();
});

describe('WS broadcast po CRUD cue', () => {
  it('powinno broadcastować cue_added po dodaniu cue', async () => {
    // Podłącz klienta WS
    const { ws } = await connectAndHandshake(port);

    // Nasłuchuj na rundown:delta
    const deltaPromise = waitForEvent(ws, 'rundown:delta', 2000);

    // Dodaj cue i wyślij broadcast
    const newCue = cueRepo.create({
      rundown_id: rundownId,
      title: 'Nowy Cue',
      duration_ms: 60_000,
    });

    const change: RundownChange = {
      op: 'cue_added',
      cue: {
        id: newCue.id,
        title: newCue.title,
        subtitle: newCue.subtitle,
        duration_ms: newCue.duration_ms,
        start_type: newCue.start_type,
        auto_start: newCue.auto_start,
        locked: newCue.locked,
        background_color: newCue.background_color,
        sort_order: newCue.sort_order,
      },
    };
    wsServer.broadcastDelta(rundownId, [change]);

    // Weryfikuj odbiór delty
    const delta = await deltaPromise;
    const payload = delta.payload as { rundown_id: string; changes: RundownChange[] };

    expect(payload.rundown_id).toBe(rundownId);
    expect(payload.changes).toHaveLength(1);
    expect(payload.changes[0]!.op).toBe('cue_added');
    if (payload.changes[0]!.op === 'cue_added') {
      expect(payload.changes[0]!.cue.title).toBe('Nowy Cue');
      expect(payload.changes[0]!.cue.duration_ms).toBe(60_000);
    }

    ws.close();
  });

  it('powinno broadcastować cue_updated po edycji cue', async () => {
    const { ws } = await connectAndHandshake(port);
    const deltaPromise = waitForEvent(ws, 'rundown:delta', 2000);

    // Pobierz istniejący cue i zaktualizuj
    const cues = cueRepo.findByRundown(rundownId);
    const updated = cueRepo.update(cues[0]!.id, { title: 'Zaktualizowany' });

    const change: RundownChange = {
      op: 'cue_updated',
      cue: {
        id: updated!.id,
        title: updated!.title,
        subtitle: updated!.subtitle,
        duration_ms: updated!.duration_ms,
        start_type: updated!.start_type,
        auto_start: updated!.auto_start,
        locked: updated!.locked,
        background_color: updated!.background_color,
        sort_order: updated!.sort_order,
      },
    };
    wsServer.broadcastDelta(rundownId, [change]);

    const delta = await deltaPromise;
    const payload = delta.payload as { rundown_id: string; changes: RundownChange[] };

    expect(payload.changes[0]!.op).toBe('cue_updated');
    if (payload.changes[0]!.op === 'cue_updated') {
      expect(payload.changes[0]!.cue.title).toBe('Zaktualizowany');
    }

    ws.close();
  });

  it('powinno broadcastować cue_deleted po usunięciu cue', async () => {
    const { ws } = await connectAndHandshake(port);
    const deltaPromise = waitForEvent(ws, 'rundown:delta', 2000);

    const cues = cueRepo.findByRundown(rundownId);
    const cueId = cues[1]!.id;
    cueRepo.delete(cueId);

    const change: RundownChange = { op: 'cue_deleted', cue_id: cueId };
    wsServer.broadcastDelta(rundownId, [change]);

    const delta = await deltaPromise;
    const payload = delta.payload as { rundown_id: string; changes: RundownChange[] };

    expect(payload.changes[0]!.op).toBe('cue_deleted');
    if (payload.changes[0]!.op === 'cue_deleted') {
      expect(payload.changes[0]!.cue_id).toBe(cueId);
    }

    ws.close();
  });

  it('powinno broadcastować do wielu klientów', async () => {
    const { ws: ws1 } = await connectAndHandshake(port);
    const { ws: ws2 } = await connectAndHandshake(port);

    const delta1 = waitForEvent(ws1, 'rundown:delta', 2000);
    const delta2 = waitForEvent(ws2, 'rundown:delta', 2000);

    const change: RundownChange = {
      op: 'cue_added',
      cue: {
        id: 'test-broadcast-cue',
        title: 'Broadcast Test',
        subtitle: '',
        duration_ms: 30_000,
        start_type: 'soft',
        auto_start: false,
        locked: false,
        sort_order: 10,
      },
    };
    wsServer.broadcastDelta(rundownId, [change]);

    const [d1, d2] = await Promise.all([delta1, delta2]);
    const p1 = d1.payload as { changes: RundownChange[] };
    const p2 = d2.payload as { changes: RundownChange[] };

    expect(p1.changes[0]!.op).toBe('cue_added');
    expect(p2.changes[0]!.op).toBe('cue_added');

    ws1.close();
    ws2.close();
  });
});
