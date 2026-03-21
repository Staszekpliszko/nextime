import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlaybackEngine } from '../../electron/playback-engine';
import { RundownWsServer } from '../../electron/ws-server';
import { MockClock } from '../helpers/mock-clock';
import { connectAndHandshake, waitForEvent } from '../helpers/ws-test-helpers';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';

describe('Connected Clients (WS)', () => {
  let engine: PlaybackEngine;
  let server: RundownWsServer;
  let clock: MockClock;
  let port: number;

  beforeEach(async () => {
    const db = createTestDb();
    clock = new MockClock(1_000_000_000_000);
    const cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);
    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    seedTestRundown(db, projectId);
    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
    server = new RundownWsServer(engine, clock);
    port = await server.start(0);
  });

  afterEach(async () => {
    await server.stop();
    engine.destroy();
  });

  it('welcome zawiera connected_clients', async () => {
    const { ws, welcome } = await connectAndHandshake(port);
    const payload = welcome.payload as { initial_state: { connected_clients: unknown[] } };
    expect(payload.initial_state).toHaveProperty('connected_clients');
    const clients = payload.initial_state.connected_clients;
    expect(Array.isArray(clients)).toBe(true);
    expect(clients.length).toBeGreaterThanOrEqual(1);
    ws.close();
  });

  it('getConnectedClients zwraca liste po polaczeniu', async () => {
    const { ws } = await connectAndHandshake(port);
    const clients = server.getConnectedClients();
    expect(clients.length).toBe(1);
    expect(clients[0]).toHaveProperty('session_id');
    expect(clients[0]).toHaveProperty('client_type', 'editor');
    expect(clients[0]).toHaveProperty('connected_at');
    ws.close();
  });

  it('getSessionCount zwraca prawidlowa liczbe', async () => {
    expect(server.getSessionCount()).toBe(0);
    const { ws: ws1 } = await connectAndHandshake(port);
    expect(server.getSessionCount()).toBe(1);
    const { ws: ws2 } = await connectAndHandshake(port);
    expect(server.getSessionCount()).toBe(2);
    ws1.close();
    ws2.close();
  });

  it('server:clients_changed broadcastowany po polaczeniu', async () => {
    const { ws: ws1 } = await connectAndHandshake(port);

    // Czekaj na clients_changed po drugim połączeniu
    const clientsChangedPromise = waitForEvent(ws1, 'server:clients_changed', 2000);
    const { ws: ws2 } = await connectAndHandshake(port);

    const msg = await clientsChangedPromise;
    const msgPayload = msg.payload as { clients: unknown[] };
    expect(msgPayload).toHaveProperty('clients');
    expect(msgPayload.clients.length).toBe(2);

    ws1.close();
    ws2.close();
  });
});
