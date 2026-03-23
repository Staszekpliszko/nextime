import { useEffect, useRef, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import type { TimesnapPayload, TimesnapRundownMs, TimesnapTimelineFrames, CueSummary, RundownChange, VisionCueSummary } from '@/store/playback.store';

// ── Typy WS envelope (zgodne z docs/ws-protocol.ts) ─────────

interface WsEnvelope {
  event: string;
  payload: unknown;
  sent_at: number;
  seq: number;
  from?: string;
}

interface WelcomePayload {
  session_id: string;
  server_version: string;
  initial_state: {
    server_time_ms: number;
    playback: TimesnapPayload | null;
    rundown?: {
      cues?: CueSummary[];
    };
    connected_clients?: Array<{ session_id: string; client_type: string; connected_at: string; camera_filter?: number }>;
  };
}

interface ServerTimePayload {
  server_time_ms: number;
}

interface CurrentCuePayload {
  cue: CueSummary;
  next_cue: CueSummary | null;
}

interface DeltaPayload {
  rundown_id: string;
  changes: RundownChange[];
}

interface ActiveVisionCuePayload {
  act_id: string;
  current_cue: VisionCueSummary | null;
  next_cue: VisionCueSummary | null;
  next_in_ms: number | null;
}

// ── Konfiguracja reconnect ───────────────────────────────────

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10_000;

// ── Hook ─────────────────────────────────────────────────────

export function useRundownSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const expectedSeqRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const portRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const setPlayback = usePlaybackStore(s => s.setPlayback);
  const setCurrentCue = usePlaybackStore(s => s.setCurrentCue);
  const setNextCue = usePlaybackStore(s => s.setNextCue);
  const setClockDrift = usePlaybackStore(s => s.setClockDrift);
  const setConnected = usePlaybackStore(s => s.setConnected);
  const applyDelta = usePlaybackStore(s => s.applyDelta);
  const setActiveVisionCue = usePlaybackStore(s => s.setActiveVisionCue);
  const setNextVisionCue = usePlaybackStore(s => s.setNextVisionCue);
  const connected = usePlaybackStore(s => s.connected);

  // Dispatch WS event do store
  const dispatch = useCallback((envelope: WsEnvelope) => {
    switch (envelope.event) {
      case 'server:welcome': {
        const payload = envelope.payload as WelcomePayload;
        // Sync zegar
        const drift = payload.initial_state.server_time_ms - Date.now();
        setClockDrift(drift);
        // Załaduj stan początkowy
        if (payload.initial_state.playback) {
          setPlayback(payload.initial_state.playback);
        }
        // Faza 11: załaduj listę podłączonych klientów
        if (payload.initial_state.connected_clients) {
          usePlaybackStore.getState().setConnectedClients(payload.initial_state.connected_clients);
        }
        break;
      }

      case 'server:time': {
        const payload = envelope.payload as ServerTimePayload;
        const drift = payload.server_time_ms - Date.now();
        setClockDrift(drift);
        break;
      }

      case 'playback:timesnap': {
        const payload = envelope.payload as TimesnapPayload;
        setPlayback(payload);
        break;
      }

      case 'rundown:current_cue': {
        const payload = envelope.payload as CurrentCuePayload;
        setCurrentCue(payload.cue);
        setNextCue(payload.next_cue);
        break;
      }

      case 'rundown:delta': {
        const payload = envelope.payload as DeltaPayload;
        applyDelta(payload.changes);
        break;
      }

      case 'act:active_vision_cue': {
        const payload = envelope.payload as ActiveVisionCuePayload;
        setActiveVisionCue(payload.current_cue);
        setNextVisionCue(payload.next_cue);
        break;
      }

      // Faza 6: nowe eventy
      case 'act:lyric_changed': {
        const p = envelope.payload as { text: string | null };
        usePlaybackStore.getState().setActiveLyricText(p.text);
        break;
      }
      case 'act:mode_changed': {
        const p = envelope.payload as { step_mode: boolean; hold_mode: boolean };
        usePlaybackStore.getState().setStepMode(p.step_mode);
        usePlaybackStore.getState().setHoldMode(p.hold_mode);
        break;
      }
      case 'act:marker_warning': {
        const p = envelope.payload as { marker: { id: string; label: string; color: string } };
        usePlaybackStore.getState().setActiveMarker({
          cueId: p.marker.id, label: p.marker.label, color: p.marker.color,
        });
        setTimeout(() => usePlaybackStore.getState().setActiveMarker(null), 3000);
        break;
      }
      case 'act:cue_executed': {
        const cp = envelope.payload as {
          cue_type: string; action: 'entered' | 'exited';
          data: Record<string, unknown>; cue_id: string;
        };
        // Marker enter/exit — aktualizacja activeMarker w store
        if (cp.cue_type === 'marker' && cp.action === 'entered') {
          usePlaybackStore.getState().setActiveMarker({
            cueId: cp.cue_id,
            label: (cp.data.label as string) ?? '',
            color: (cp.data.color as string) ?? '#ef4444',
          });
        } else if (cp.cue_type === 'marker' && cp.action === 'exited') {
          const current = usePlaybackStore.getState().activeMarker;
          if (current && current.cueId === cp.cue_id) {
            usePlaybackStore.getState().setActiveMarker(null);
          }
        }
        break;
      }

      // Faza 10: LTC source changed
      case 'act:ltc_source_changed': {
        const lp = envelope.payload as { source: 'internal' | 'ltc' | 'mtc' | 'manual' };
        usePlaybackStore.getState().setLtcSource(lp.source);
        break;
      }

      // Faza 35: team notes delta — emituj custom event do App
      case 'team-notes:delta': {
        const tnp = envelope.payload as {
          rundown_id: string;
          change: { op: string; note: unknown };
        };
        document.dispatchEvent(new CustomEvent('nextime:team-notes-delta', { detail: tnp }));
        break;
      }

      // Faza 11: lista podłączonych klientów
      case 'server:clients_changed': {
        const cc = envelope.payload as { clients: Array<{ session_id: string; client_type: string; connected_at: string; camera_filter?: number }> };
        usePlaybackStore.getState().setConnectedClients(cc.clients);
        break;
      }

      // Faza 8: ATEM status
      case 'atem:status': {
        const ap = envelope.payload as {
          connected: boolean;
          programInput: number | null;
          previewInput: number | null;
          modelName: string | null;
        };
        usePlaybackStore.getState().setAtemStatus(ap);
        break;
      }
    }
  }, [setPlayback, setCurrentCue, setNextCue, setClockDrift, applyDelta, setActiveVisionCue, setNextVisionCue]);

  // Połącz z WebSocket serwerem
  const connect = useCallback((port: number) => {
    if (!mountedRef.current) return;

    // Zamknij istniejące połączenie
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(`ws://localhost:${port}`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      expectedSeqRef.current = 0;

      // Handshake: client:hello
      ws.send(JSON.stringify({
        event: 'client:hello',
        payload: {
          client_type: 'editor',
          auth_token: 'local',
          client_version: '1.0.0',
        },
      }));
    };

    ws.onmessage = (event) => {
      let envelope: WsEnvelope;
      try {
        envelope = JSON.parse(event.data as string);
      } catch {
        return;
      }

      // Gap detection — sprawdź seq
      if (envelope.event !== 'server:welcome' && envelope.seq !== expectedSeqRef.current) {
        // Luka w sekwencji — żądaj pełnego resync
        const reqId = `resync-${Date.now()}`;
        ws.send(JSON.stringify({
          event: 'cmd:resync',
          payload: {},
          req_id: reqId,
        }));
        expectedSeqRef.current = envelope.seq + 1;
      } else {
        expectedSeqRef.current = envelope.seq + 1;
      }

      // Po welcome jesteśmy połączeni
      if (envelope.event === 'server:welcome') {
        setConnected(true);
        expectedSeqRef.current = envelope.seq + 1;
      }

      dispatch(envelope);
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      if (!mountedRef.current) return;

      // Faza 11: ustaw stan reconnecting
      usePlaybackStore.getState().setReconnecting(true);

      // Auto-reconnect z exponential backoff
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, reconnectAttemptRef.current),
        RECONNECT_MAX_MS,
      );
      reconnectAttemptRef.current++;

      reconnectTimerRef.current = setTimeout(() => {
        connect(port);
      }, delay);
    };

    ws.onerror = () => {
      // onclose wywoła się automatycznie po onerror
    };
  }, [dispatch, setConnected]);

  // Inicjalizacja — pobierz port WS i połącz
  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      try {
        const port = await window.nextime.getWsPort();
        portRef.current = port;
        connect(port);
      } catch (err) {
        console.error('[NextTime] Nie udało się uzyskać portu WS:', err);
      }
    }

    init();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Wysyłanie komendy C→S
  const sendCommand = useCallback((
    event: string,
    payload: Record<string, unknown> = {},
  ) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const reqId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    ws.send(JSON.stringify({ event, payload, req_id: reqId }));
  }, []);

  return { sendCommand, connected };
}
