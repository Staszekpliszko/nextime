import { EventEmitter } from 'events';
import dgram from 'dgram';

// ── Typy ────────────────────────────────────────────────

export interface OscSenderConfig {
  /** Adres hosta docelowego (domyślnie: '127.0.0.1') */
  host: string;
  /** Port docelowy (domyślnie: 8000) */
  port: number;
  /** Czy sender jest aktywny */
  enabled: boolean;
}

interface OscTriggerCue {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

/** Argument OSC — zgodny z docs/types.ts OscArg */
interface OscArg {
  type: 'i' | 'f' | 's' | 'b';
  value: number | string | boolean;
}

// ── OSC binary encoding (minimal, bez zależności) ───────

/** Wyrównanie do 4 bajtów */
function pad4(len: number): number {
  return (4 - (len % 4)) % 4;
}

/** Kodowanie OSC string */
function encodeOscString(str: string): Buffer {
  const buf = Buffer.from(str + '\0', 'ascii');
  const padding = pad4(buf.length);
  return padding > 0 ? Buffer.concat([buf, Buffer.alloc(padding)]) : buf;
}

/** Kodowanie OSC int32 */
function encodeOscInt(val: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(val, 0);
  return buf;
}

/** Kodowanie OSC float32 */
function encodeOscFloat(val: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(val, 0);
  return buf;
}

/** Buduje pakiet OSC z adresu i argumentów */
export function buildOscMessage(address: string, args: OscArg[]): Buffer {
  // Type tag string: "," + typy
  const typeTag = ',' + args.map(a => a.type === 'b' ? 'i' : a.type).join('');

  const parts: Buffer[] = [
    encodeOscString(address),
    encodeOscString(typeTag),
  ];

  for (const arg of args) {
    switch (arg.type) {
      case 'i':
        parts.push(encodeOscInt(typeof arg.value === 'number' ? arg.value : 0));
        break;
      case 'f':
        parts.push(encodeOscFloat(typeof arg.value === 'number' ? arg.value : 0));
        break;
      case 's':
        parts.push(encodeOscString(String(arg.value)));
        break;
      case 'b':
        // Boolean jako int: true=1, false=0
        parts.push(encodeOscInt(arg.value ? 1 : 0));
        break;
    }
  }

  return Buffer.concat(parts);
}

// ── OscSender ───────────────────────────────────────────

const DEFAULT_CONFIG: OscSenderConfig = {
  host: '127.0.0.1',
  port: 8000,
  enabled: true,
};

/**
 * Wysyła wiadomości OSC via UDP w odpowiedzi na 'osc-trigger' z PlaybackEngine.
 * Minimalny encoder OSC — bez zewnętrznych zależności.
 */
export class OscSender {
  private config: OscSenderConfig;
  private socket: dgram.Socket | null = null;

  constructor(config: Partial<OscSenderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Podpina się do engine i nasłuchuje na 'osc-trigger' */
  attach(engine: EventEmitter): void {
    engine.on('osc-trigger', (cue: OscTriggerCue) => this.handleTrigger(cue));
  }

  /** Obsługuje trigger z engine — wysyła pakiet OSC */
  handleTrigger(cue: OscTriggerCue): void {
    if (!this.config.enabled) return;

    const data = cue.data as { address?: string; args?: OscArg[] };
    const address = data.address;
    if (!address) {
      console.warn(`[OscSender] Cue ${cue.id}: brak adresu OSC — pomijam`);
      return;
    }

    const args: OscArg[] = Array.isArray(data.args) ? data.args : [];

    try {
      const packet = buildOscMessage(address, args);
      this.send(packet);
      console.log(`[OscSender] Wysłano: ${address} → ${this.config.host}:${this.config.port} (${args.length} args)`);
    } catch (err) {
      console.error(`[OscSender] Błąd wysyłania do ${address}:`, err);
    }
  }

  /** Wysyła surowy pakiet UDP */
  private send(packet: Buffer): void {
    if (!this.socket) {
      this.socket = dgram.createSocket('udp4');
      this.socket.on('error', (err) => {
        console.error('[OscSender] Socket error:', err);
      });
    }
    this.socket.send(packet, this.config.port, this.config.host);
  }

  /** Aktualizuje konfigurację w runtime */
  updateConfig(config: Partial<OscSenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Zwraca aktualną konfigurację */
  getConfig(): OscSenderConfig {
    return { ...this.config };
  }

  /** Zamyka socket */
  destroy(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
