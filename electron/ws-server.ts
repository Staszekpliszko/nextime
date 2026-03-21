import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import type { PlaybackEngine, EngineTimelineFramesState, CachedTimelineCue } from './playback-engine';
import type { Clock } from './playback-engine';
import type { RundownChange } from './ws-protocol-types';

// ── Typy sesji (zgodne z docs/ws-protocol.ts) ────────────

interface WsSession {
  id: string;
  ws: WebSocket;
  seq: number;
  clientType: string;
  cameraFilter?: number;
  watchRundown?: string;
  watchAct?: string;
  connectedAt: string;
}

interface WsEnvelope {
  event: string;
  payload: unknown;
  sent_at: number;
  seq: number;
  from?: string;
}

// ── Serwer ───────────────────────────────────────────────

const HANDSHAKE_TIMEOUT_MS = 5_000;

const systemClock: Clock = { now: () => Date.now() };

export class RundownWsServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, WsSession>();
  private tickTimer?: ReturnType<typeof setInterval>;
  private timesnapTimer?: ReturnType<typeof setInterval>;
  private serverTimeTimer?: ReturnType<typeof setInterval>;
  private clientsChangedTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private engine: PlaybackEngine,
    private clock: Clock = systemClock,
  ) {
    // Nasłuchuj na zmianę vision cue — broadcast do klientów
    this.engine.on('vision-cue-changed', (activeCue, nextCue) => {
      this.broadcast('act:active_vision_cue', {
        act_id: this.getActiveActId(),
        current_cue: activeCue ?? null,
        next_cue: nextCue ?? null,
        next_in_ms: null, // obliczane w UI
      });

      // Faza 9: filtrowany broadcast cueapp:view do klientów CueApp
      this.broadcastCueAppView(activeCue, nextCue);
    });

    // Faza 6: nowe eventy engine → broadcast
    this.engine.on('cue-entered', (cue: CachedTimelineCue) => {
      this.broadcast('act:cue_executed', {
        act_id: this.getActiveActId(), cue_id: cue.id,
        cue_type: cue.type, action: 'entered', data: cue.data,
      });
    });

    this.engine.on('cue-exited', (cue: CachedTimelineCue) => {
      this.broadcast('act:cue_executed', {
        act_id: this.getActiveActId(), cue_id: cue.id,
        cue_type: cue.type, action: 'exited', data: cue.data,
      });
    });

    this.engine.on('lyric-changed', (text: string | null) => {
      this.broadcast('act:lyric_changed', {
        act_id: this.getActiveActId(), text,
      });
    });

    this.engine.on('mode-changed', (modes: { stepMode: boolean; holdMode: boolean }) => {
      this.broadcast('act:mode_changed', {
        act_id: this.getActiveActId(),
        step_mode: modes.stepMode, hold_mode: modes.holdMode,
      });
    });

    // Faza 10: LTC source changed
    this.engine.on('ltc-source-changed', (source: string) => {
      this.broadcast('act:ltc_source_changed', {
        act_id: this.getActiveActId(),
        source,
      });
    });

    this.engine.on('cue-pre-warning', (cue: CachedTimelineCue, framesUntil: number) => {
      this.broadcast('act:marker_warning', {
        act_id: this.getActiveActId(),
        marker: {
          id: cue.id,
          label: (cue.data as Record<string, unknown>).label ?? '',
          color: (cue.data as Record<string, unknown>).color ?? '#ef4444',
        },
        frames_until: framesUntil,
      });
    });
  }

  /** Callback: ręczny ATEM CUT z klienta WS */
  onAtemCut: ((input: number) => void) | null = null;
  /** Callback: ręczny ATEM PREVIEW z klienta WS */
  onAtemPreview: ((input: number) => void) | null = null;

  /** Broadcast statusu ATEM do wszystkich klientów */
  broadcastAtemStatus(status: { connected: boolean; programInput: number | null; previewInput: number | null; modelName: string | null }): void {
    this.broadcast('atem:status', status);
  }

  /** Startuje serwer na podanym porcie (0 = auto-assign). Zwraca faktyczny port. */
  start(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port });
      this.wss.on('listening', () => {
        const addr = this.wss!.address();
        const actualPort = typeof addr === 'object' && addr !== null ? addr.port : port;
        // Tick engine co 40ms (~25fps) — oddzielony od broadcastu
        this.tickTimer = setInterval(() => this.engine.tick(), 40);
        // Broadcast timesnap co 100ms
        this.timesnapTimer = setInterval(() => this.broadcastTimesnap(), 100);
        this.serverTimeTimer = setInterval(() => this.broadcastServerTime(), 30_000);
        resolve(actualPort);
      });
      this.wss.on('error', reject);
      this.wss.on('connection', (ws) => this.handleConnection(ws));
    });
  }

  /** Zatrzymuje serwer i zamyka wszystkie połączenia */
  stop(): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.timesnapTimer) clearInterval(this.timesnapTimer);
    if (this.serverTimeTimer) clearInterval(this.serverTimeTimer);
    if (this.clientsChangedTimer) clearTimeout(this.clientsChangedTimer);

    return new Promise((resolve) => {
      // Zamknij wszystkie sesje
      for (const session of this.sessions.values()) {
        session.ws.close();
      }
      this.sessions.clear();

      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /** Zwraca liczbę aktywnych sesji */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /** Zwraca listę podłączonych klientów (do UI i welcome) */
  getConnectedClients(): Array<{ session_id: string; client_type: string; connected_at: string; camera_filter?: number }> {
    const clients: Array<{ session_id: string; client_type: string; connected_at: string; camera_filter?: number }> = [];
    for (const session of this.sessions.values()) {
      clients.push({
        session_id: session.id,
        client_type: session.clientType,
        connected_at: session.connectedAt,
        camera_filter: session.cameraFilter,
      });
    }
    return clients;
  }

  /** Broadcast zmian rundownu (CRUD cue) do wszystkich klientów */
  broadcastDelta(rundownId: string, changes: RundownChange[]): void {
    this.broadcast('rundown:delta', {
      rundown_id: rundownId,
      changes,
    });
  }

  /** Ręczne wymuszenie broadcastu timesnap (do testów) */
  broadcastTimesnap(): void {
    const snap = this.engine.buildTimesnap();
    if (snap) {
      this.broadcast('playback:timesnap', snap);
    }
  }

  /** Broadcast listy podłączonych klientów (debounced — max 1 na 500ms) */
  private scheduleBroadcastClientsChanged(): void {
    if (this.clientsChangedTimer) return; // już zaplanowany
    this.clientsChangedTimer = setTimeout(() => {
      this.clientsChangedTimer = undefined;
      this.broadcast('server:clients_changed', {
        clients: this.getConnectedClients(),
      });
    }, 500);
  }

  // ── Private ────────────────────────────────────────────

  private handleConnection(ws: WebSocket): void {
    let handshakeComplete = false;
    const sessionId = crypto.randomUUID();

    const timeout = setTimeout(() => {
      if (!handshakeComplete) {
        this.sendToWs(ws, 'server:error', {
          code: 'AUTH_FAILED',
          message: 'Handshake timeout',
          fatal: true,
        }, 0);
        ws.close();
      }
    }, HANDSHAKE_TIMEOUT_MS);

    ws.on('message', (raw) => {
      let msg: { event: string; payload?: Record<string, unknown>; req_id?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // ignoruj niepoprawny JSON
      }

      if (!handshakeComplete) {
        if (msg.event === 'client:hello') {
          clearTimeout(timeout);
          handshakeComplete = true;

          const session: WsSession = {
            id: sessionId,
            ws,
            seq: 0,
            clientType: String(msg.payload?.client_type ?? 'editor'),
            cameraFilter: msg.payload?.camera_filter as number | undefined,
            watchRundown: msg.payload?.watch_rundown as string | undefined,
            watchAct: msg.payload?.watch_act as string | undefined,
            connectedAt: new Date(this.clock.now()).toISOString(),
          };
          this.sessions.set(sessionId, session);
          this.sendWelcome(session);
          // Faza 11: broadcast listy klientów po nowym połączeniu
          this.scheduleBroadcastClientsChanged();
        } else {
          clearTimeout(timeout);
          this.sendToWs(ws, 'server:error', {
            code: 'AUTH_FAILED',
            message: 'Expected client:hello as first message',
            fatal: true,
          }, 0);
          ws.close();
        }
        return;
      }

      // Po handshake — komendy
      const session = this.sessions.get(sessionId);
      if (session) {
        this.handleMessage(session, msg);
      }
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      this.sessions.delete(sessionId);
      // Faza 11: broadcast listy klientów po rozłączeniu
      this.scheduleBroadcastClientsChanged();
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      this.sessions.delete(sessionId);
      // Faza 11: broadcast listy klientów po błędzie
      this.scheduleBroadcastClientsChanged();
    });
  }

  private handleMessage(
    session: WsSession,
    msg: { event: string; payload?: Record<string, unknown>; req_id?: string },
  ): void {
    switch (msg.event) {
      case 'client:ping':
        this.send(session, 'server:pong', {
          client_ts: msg.payload?.client_ts,
          server_ts: this.clock.now(),
        });
        break;

      case 'cmd:play':
        this.handleCommand(session, msg, () => this.engine.play());
        break;

      case 'cmd:pause':
        this.handleCommand(session, msg, () => this.engine.pause());
        break;

      case 'cmd:next':
        this.handleCommand(session, msg, () => this.engine.next());
        break;

      case 'cmd:prev':
        this.handleCommand(session, msg, () => this.engine.prev());
        break;

      case 'cmd:goto':
        this.handleCommand(session, msg, () => {
          const cueId = msg.payload?.cue_id as string;
          if (!cueId) throw new Error('Missing cue_id');
          this.engine.goto(cueId);
        });
        break;

      case 'cmd:scrub':
        this.handleCommand(session, msg, () => {
          const frames = msg.payload?.frames as number;
          if (frames === undefined) throw new Error('Missing frames');
          this.engine.scrub(frames);
        });
        break;

      case 'cmd:set_speed':
        this.handleCommand(session, msg, () => {
          const speed = msg.payload?.speed as number;
          if (speed === undefined) throw new Error('Missing speed');
          this.engine.setSpeed(speed);
        });
        break;

      // Faza 6: nowe komendy C→S
      case 'cmd:step_mode':
        this.handleCommand(session, msg, () => this.engine.toggleStepMode());
        break;

      case 'cmd:hold_mode':
        this.handleCommand(session, msg, () => this.engine.toggleHoldMode());
        break;

      case 'cmd:step_next':
        this.handleCommand(session, msg, () => this.engine.stepToNextCue());
        break;

      case 'cmd:take_shot':
        this.handleCommand(session, msg, () => this.engine.takeNextShot());
        break;

      // Faza 8: ATEM komendy C→S
      case 'cmd:atem_cut': {
        this.handleCommand(session, msg, () => {
          const input = msg.payload?.input as number;
          if (input === undefined) throw new Error('Missing input');
          this.onAtemCut?.(input);
        });
        break;
      }
      case 'cmd:atem_preview': {
        this.handleCommand(session, msg, () => {
          const input = msg.payload?.input as number;
          if (input === undefined) throw new Error('Missing input');
          this.onAtemPreview?.(input);
        });
        break;
      }

      // Faza 10: LTC source control
      case 'cmd:set_ltc_source': {
        this.handleCommand(session, msg, () => {
          const source = msg.payload?.source as string;
          if (!source) throw new Error('Missing source');
          if (!['internal', 'ltc', 'mtc', 'manual'].includes(source)) {
            throw new Error(`Invalid LTC source: ${source}`);
          }
          this.engine.setLtcSource(source as 'internal' | 'ltc' | 'mtc' | 'manual');
        });
        break;
      }

      case 'cmd:set_manual_tc': {
        this.handleCommand(session, msg, () => {
          const frames = msg.payload?.frames as number;
          if (frames === undefined) throw new Error('Missing frames');
          this.engine.feedExternalTc(frames);
        });
        break;
      }

      // Faza 9: prompter sync
      case 'cmd:prompter_update':
        this.handleCommand(session, msg, () => {
          // Re-broadcast do wszystkich prompterów (synchronizacja)
          this.broadcastToType('prompter', 'prompter:sync', {
            output_config_id: msg.payload?.output_config_id ?? null,
            scroll_y: msg.payload?.scroll_y ?? 0,
            is_playing: msg.payload?.is_playing ?? false,
            speed: msg.payload?.speed ?? 1,
            settings: msg.payload?.settings ?? {},
          });
        });
        break;

      case 'cmd:resync':
        this.sendWelcome(session);
        this.handleCommand(session, msg, () => {});
        break;

      default:
        this.send(session, 'server:ack', {
          req_id: msg.req_id,
          ok: false,
          error: `Unknown command: ${msg.event}`,
        });
    }
  }

  private handleCommand(
    session: WsSession,
    msg: { req_id?: string },
    action: () => void,
  ): void {
    try {
      action();
      this.send(session, 'server:ack', { req_id: msg.req_id, ok: true });
    } catch (err) {
      this.send(session, 'server:ack', {
        req_id: msg.req_id,
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  private sendWelcome(session: WsSession): void {
    const snap = this.engine.buildTimesnap();
    this.send(session, 'server:welcome', {
      session_id: session.id,
      server_version: '1.0.0',
      initial_state: {
        server_time_ms: this.clock.now(),
        playback: snap ?? null,
        connected_clients: this.getConnectedClients(),
      },
    });
  }

  private broadcastServerTime(): void {
    this.broadcast('server:time', {
      server_time_ms: this.clock.now(),
    });
  }

  /** Wysyła wiadomość do jednej sesji z envelope */
  private send(session: WsSession, event: string, payload: unknown): void {
    if (session.ws.readyState !== WebSocket.OPEN) return;
    const envelope: WsEnvelope = {
      event,
      payload,
      sent_at: this.clock.now(),
      seq: session.seq++,
    };
    session.ws.send(JSON.stringify(envelope));
  }

  /** Wysyła do surowego WebSocket (przed handshake) */
  private sendToWs(ws: WebSocket, event: string, payload: unknown, seq: number): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    const envelope: WsEnvelope = {
      event,
      payload,
      sent_at: this.clock.now(),
      seq,
    };
    ws.send(JSON.stringify(envelope));
  }

  /** Broadcast do wszystkich sesji */
  private broadcast(event: string, payload: unknown): void {
    for (const session of this.sessions.values()) {
      this.send(session, event, payload);
    }
  }

  /** Broadcast filtrowany po client_type */
  private broadcastToType(clientType: string, event: string, payload: unknown): void {
    for (const session of this.sessions.values()) {
      if (session.clientType === clientType) {
        this.send(session, event, payload);
      }
    }
  }

  /** Faza 9: broadcast cueapp:view z filtrem camera_filter per sesja */
  private broadcastCueAppView(
    activeCue: CachedTimelineCue | null,
    nextCue: CachedTimelineCue | null,
  ): void {
    for (const session of this.sessions.values()) {
      if (session.clientType !== 'cueapp') continue;

      const cameraFilter = session.cameraFilter;

      // Filtrowanie po camera_filter — jeśli ustawiony, sprawdź czy cue jest dla tej kamery
      let currentShot = activeCue;
      let nextShot = nextCue;

      if (cameraFilter !== undefined) {
        if (currentShot) {
          const camNum = (currentShot.data as Record<string, unknown>).camera_number;
          if (typeof camNum === 'number' && camNum !== cameraFilter) {
            currentShot = null;
          }
        }
        if (nextShot) {
          const camNum = (nextShot.data as Record<string, unknown>).camera_number;
          if (typeof camNum === 'number' && camNum !== cameraFilter) {
            nextShot = null;
          }
        }
      }

      this.send(session, 'cueapp:view', {
        current_shot: currentShot ? {
          id: currentShot.id,
          tc_in_frames: currentShot.tc_in_frames,
          tc_out_frames: currentShot.tc_out_frames,
          camera_number: (currentShot.data as Record<string, unknown>).camera_number ?? null,
          shot_name: (currentShot.data as Record<string, unknown>).shot_name ?? '',
          operator_note: (currentShot.data as Record<string, unknown>).operator_note ?? '',
        } : null,
        next_shot: nextShot ? {
          id: nextShot.id,
          tc_in_frames: nextShot.tc_in_frames,
          tc_out_frames: nextShot.tc_out_frames,
          camera_number: (nextShot.data as Record<string, unknown>).camera_number ?? null,
          shot_name: (nextShot.data as Record<string, unknown>).shot_name ?? '',
          operator_note: (nextShot.data as Record<string, unknown>).operator_note ?? '',
        } : null,
        next_in_ms: null,
      });
    }
  }

  /** Zwraca actId z aktywnego stanu timeline (jeśli w trybie timeline) */
  private getActiveActId(): string | null {
    const state = this.engine.getState();
    if (state && state.mode === 'timeline_frames') {
      return (state as EngineTimelineFramesState).actId;
    }
    return null;
  }
}
