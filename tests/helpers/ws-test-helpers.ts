import WebSocket from 'ws';

/** Łączy się z WS i wykonuje handshake client:hello → server:welcome */
export function connectAndHandshake(
  port: number,
  options?: { client_type?: string; watch_rundown?: string },
): Promise<{ ws: WebSocket; welcome: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        event: 'client:hello',
        payload: {
          client_type: options?.client_type ?? 'editor',
          auth_token: 'test-token',
          client_version: '1.0.0',
          watch_rundown: options?.watch_rundown,
        },
      }));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'server:welcome') {
        resolve({ ws, welcome: msg });
      }
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Timeout')), 3000);
  });
}

/** Wysyła komendę C→S i czeka na server:ack z pasującym req_id */
export function sendCommand(
  ws: WebSocket,
  event: string,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const reqId = `req-${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    const handler = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'server:ack' && msg.payload?.req_id === reqId) {
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ event, payload, req_id: reqId }));
    setTimeout(() => reject(new Error('Ack timeout')), 3000);
  });
}

/** Czeka na konkretny event S→C */
export function waitForEvent(
  ws: WebSocket,
  eventName: string,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const handler = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === eventName) {
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
    setTimeout(() => reject(new Error(`Timeout waiting for ${eventName}`)), timeoutMs);
  });
}

/** Zbiera N eventów danego typu */
export function collectEvents(
  ws: WebSocket,
  eventName: string,
  count: number,
  timeoutMs = 3000,
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const events: Array<Record<string, unknown>> = [];
    const handler = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === eventName) {
        events.push(msg);
        if (events.length >= count) {
          ws.removeListener('message', handler);
          resolve(events);
        }
      }
    };
    ws.on('message', handler);
    setTimeout(() => {
      ws.removeListener('message', handler);
      if (events.length > 0) resolve(events);
      else reject(new Error(`Timeout collecting ${eventName}`));
    }, timeoutMs);
  });
}
