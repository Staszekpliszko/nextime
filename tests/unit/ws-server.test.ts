import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { PlaybackEngine } from '../../electron/playback-engine';
import type { EngineRundownMsState } from '../../electron/playback-engine';
import { RundownWsServer } from '../../electron/ws-server';
import { MockClock } from '../helpers/mock-clock';
import { connectAndHandshake, sendCommand, waitForEvent } from '../helpers/ws-test-helpers';

describe('RundownWsServer', () => {
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
    cueRepo.create({ rundown_id: rundownId, title: 'Cue 1', duration_ms: 60_000, sort_order: 0 });
    cueRepo.create({ rundown_id: rundownId, title: 'Cue 2', duration_ms: 30_000, sort_order: 1 });

    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
    engine.loadRundown(rundownId);

    server = new RundownWsServer(engine, clock);
    port = await server.start(0); // port 0 = auto-assign
  });

  afterEach(async () => {
    await server.stop();
    engine.destroy();
    db.close();
  });

  it('powinno przyjąć handshake i odpowiedzieć server:welcome', async () => {
    const { ws, welcome } = await connectAndHandshake(port);
    expect(welcome.event).toBe('server:welcome');
    expect((welcome as Record<string, Record<string, unknown>>).payload).toHaveProperty('session_id');
    expect((welcome as Record<string, Record<string, unknown>>).payload).toHaveProperty('initial_state');
    ws.close();
  });

  it('powinno odrzucić połączenie bez client:hello', async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const error = await new Promise<Record<string, unknown>>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ event: 'cmd:play', payload: {}, req_id: '1' }));
      });
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'server:error') resolve(msg);
      });
    });
    expect((error as Record<string, Record<string, unknown>>).payload).toHaveProperty('code', 'AUTH_FAILED');
    ws.close();
  });

  it('powinno odpowiadać pong na ping z RTT', async () => {
    const { ws } = await connectAndHandshake(port);
    const clientTs = Date.now();
    ws.send(JSON.stringify({
      event: 'client:ping',
      payload: { client_ts: clientTs },
    }));
    const pong = await waitForEvent(ws, 'server:pong');
    expect((pong as Record<string, Record<string, unknown>>).payload).toHaveProperty('client_ts', clientTs);
    expect((pong as Record<string, Record<string, unknown>>).payload).toHaveProperty('server_ts');
    ws.close();
  });

  it('powinno obsłużyć cmd:play i zwrócić ack', async () => {
    const { ws } = await connectAndHandshake(port);
    const ack = await sendCommand(ws, 'cmd:play');
    expect((ack as Record<string, Record<string, unknown>>).payload).toHaveProperty('ok', true);
    expect((engine.getState() as EngineRundownMsState).is_playing).toBe(true);
    ws.close();
  });

  it('powinno obsłużyć cmd:pause i zwrócić ack', async () => {
    const { ws } = await connectAndHandshake(port);
    await sendCommand(ws, 'cmd:play');
    const ack = await sendCommand(ws, 'cmd:pause');
    expect((ack as Record<string, Record<string, unknown>>).payload).toHaveProperty('ok', true);
    expect((engine.getState() as EngineRundownMsState).is_playing).toBe(false);
    ws.close();
  });

  it('powinno obsłużyć cmd:next i zwrócić ack', async () => {
    const { ws } = await connectAndHandshake(port);
    const ack = await sendCommand(ws, 'cmd:next');
    expect((ack as Record<string, Record<string, unknown>>).payload).toHaveProperty('ok', true);
    expect((engine.getState() as EngineRundownMsState).currentCueTitle).toBe('Cue 2');
    ws.close();
  });

  it('powinno obsłużyć cmd:prev i zwrócić ack', async () => {
    const { ws } = await connectAndHandshake(port);
    await sendCommand(ws, 'cmd:next'); // → Cue 2
    const ack = await sendCommand(ws, 'cmd:prev');
    expect((ack as Record<string, Record<string, unknown>>).payload).toHaveProperty('ok', true);
    expect((engine.getState() as EngineRundownMsState).currentCueTitle).toBe('Cue 1');
    ws.close();
  });

  it('powinno obsłużyć cmd:goto i zwrócić ack', async () => {
    const { ws } = await connectAndHandshake(port);
    const cueRepo = createCueRepo(db);
    const cues = cueRepo.findByRundown(rundownId);
    const ack = await sendCommand(ws, 'cmd:goto', { cue_id: cues[1]!.id });
    expect((ack as Record<string, Record<string, unknown>>).payload).toHaveProperty('ok', true);
    expect((engine.getState() as EngineRundownMsState).currentCueTitle).toBe('Cue 2');
    ws.close();
  });

  it('powinno obsłużyć cmd:resync i odesłać pełny state', async () => {
    const { ws } = await connectAndHandshake(port);
    await sendCommand(ws, 'cmd:play');
    // Resync — powinno odesłać server:welcome z aktualnym stanem
    const resyncP = waitForEvent(ws, 'server:welcome');
    await sendCommand(ws, 'cmd:resync');
    const resync = await resyncP;
    expect(resync.event).toBe('server:welcome');
    expect((resync as Record<string, Record<string, unknown>>).payload).toHaveProperty('initial_state');
    ws.close();
  });

  it('powinno inkrementować seq per sesja', async () => {
    const { ws } = await connectAndHandshake(port);
    // welcome ma seq=0, ping response będzie seq=1
    ws.send(JSON.stringify({
      event: 'client:ping',
      payload: { client_ts: Date.now() },
    }));
    const pong = await waitForEvent(ws, 'server:pong');
    expect((pong as Record<string, number>).seq).toBeGreaterThan(0);
    ws.close();
  });

  it('powinno rozgłaszać timesnap do wszystkich klientów', async () => {
    const { ws: ws1 } = await connectAndHandshake(port);
    const { ws: ws2 } = await connectAndHandshake(port);

    await sendCommand(ws1, 'cmd:play');

    // Wymuś broadcast timesnap
    const snap1P = waitForEvent(ws1, 'playback:timesnap');
    const snap2P = waitForEvent(ws2, 'playback:timesnap');
    server.broadcastTimesnap();

    const [snap1, snap2] = await Promise.all([snap1P, snap2P]);
    expect((snap1 as Record<string, Record<string, unknown>>).payload).toHaveProperty('tc_mode', 'rundown_ms');
    expect((snap2 as Record<string, Record<string, unknown>>).payload).toHaveProperty('tc_mode', 'rundown_ms');

    ws1.close();
    ws2.close();
  });

  it('powinno usunąć sesję po rozłączeniu', async () => {
    const { ws } = await connectAndHandshake(port);
    expect(server.getSessionCount()).toBe(1);
    ws.close();
    // Poczekaj na zamknięcie
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(server.getSessionCount()).toBe(0);
  });
});
