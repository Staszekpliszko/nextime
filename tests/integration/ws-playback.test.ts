import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { PlaybackEngine } from '../../electron/playback-engine';
import type { EngineRundownMsState } from '../../electron/playback-engine';
import { RundownWsServer } from '../../electron/ws-server';
import { MockClock } from '../helpers/mock-clock';
import {
  connectAndHandshake,
  sendCommand,
  collectEvents,
} from '../helpers/ws-test-helpers';

describe('Integracja: WsServer + PlaybackEngine', () => {
  let db: Database.Database;
  let engine: PlaybackEngine;
  let server: RundownWsServer;
  let port: number;
  let clock: MockClock;
  let rundownId: string;

  beforeEach(async () => {
    db = createTestDb();
    clock = new MockClock();
    const cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);

    cueRepo.create({ rundown_id: rundownId, title: 'Intro', duration_ms: 60_000, sort_order: 0 });
    cueRepo.create({ rundown_id: rundownId, title: 'Main', duration_ms: 120_000, sort_order: 1 });
    cueRepo.create({ rundown_id: rundownId, title: 'Outro', duration_ms: 30_000, sort_order: 2 });

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

  it('pełny flow: connect → play → timesnap → next → pause', async () => {
    // 1. Connect i handshake
    const { ws, welcome } = await connectAndHandshake(port);
    expect(welcome.event).toBe('server:welcome');
    const payload = (welcome as Record<string, Record<string, unknown>>).payload!;
    expect(payload?.initial_state).toHaveProperty('server_time_ms');

    // 2. Play
    const ackPlay = await sendCommand(ws, 'cmd:play');
    expect((ackPlay as Record<string, Record<string, unknown>>).payload).toHaveProperty('ok', true);

    // 3. Odbierz timesnap (ręczny broadcast)
    const snapPromise = collectEvents(ws, 'playback:timesnap', 1);
    server.broadcastTimesnap();
    const snaps = await snapPromise;
    expect((snaps[0] as Record<string, Record<string, unknown>>).payload).toHaveProperty('tc_mode', 'rundown_ms');

    // 4. Next
    const ackNext = await sendCommand(ws, 'cmd:next');
    expect((ackNext as Record<string, Record<string, unknown>>).payload).toHaveProperty('ok', true);
    expect((engine.getState() as EngineRundownMsState).currentCueTitle).toBe('Main');

    // 5. Pause
    const ackPause = await sendCommand(ws, 'cmd:pause');
    expect((ackPause as Record<string, Record<string, unknown>>).payload).toHaveProperty('ok', true);
    expect((engine.getState() as EngineRundownMsState).is_playing).toBe(false);

    ws.close();
  });

  it('wielu klientów: broadcast dociera do wszystkich', async () => {
    const { ws: ws1 } = await connectAndHandshake(port);
    const { ws: ws2 } = await connectAndHandshake(port);
    const { ws: ws3 } = await connectAndHandshake(port);

    expect(server.getSessionCount()).toBe(3);

    await sendCommand(ws1, 'cmd:play');

    // Broadcast timesnap
    const snap1P = collectEvents(ws1, 'playback:timesnap', 1);
    const snap2P = collectEvents(ws2, 'playback:timesnap', 1);
    const snap3P = collectEvents(ws3, 'playback:timesnap', 1);
    server.broadcastTimesnap();

    const [s1, s2, s3] = await Promise.all([snap1P, snap2P, snap3P]);
    expect((s1[0] as Record<string, Record<string, unknown>>).payload).toHaveProperty('tc_mode');
    expect((s2[0] as Record<string, Record<string, unknown>>).payload).toHaveProperty('tc_mode');
    expect((s3[0] as Record<string, Record<string, unknown>>).payload).toHaveProperty('tc_mode');

    ws1.close();
    ws2.close();
    ws3.close();
  });

  it('resync: klient żąda pełnego stanu po gap', async () => {
    const { ws } = await connectAndHandshake(port);
    await sendCommand(ws, 'cmd:play');

    // Żądaj resync — powinno dostać server:welcome z aktualnym stanem
    const resyncP = collectEvents(ws, 'server:welcome', 1);
    await sendCommand(ws, 'cmd:resync');
    const resyncMsgs = await resyncP;
    const state = resyncMsgs[0]!;
    expect(state).toHaveProperty('event', 'server:welcome');
    expect((state as Record<string, Record<string, unknown>>).payload).toHaveProperty('initial_state');

    ws.close();
  });
});
