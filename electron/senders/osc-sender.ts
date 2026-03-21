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

// ── Wynik testu / walidacji ──────────────────────────────

export interface OscTestResult {
  ok: boolean;
  error?: string;
}

export interface OscValidationResult {
  valid: boolean;
  error?: string;
}

// ── Walidacja adresu IP i portu ─────────────────────────

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Sprawdza poprawność adresu IPv4 i portu UDP */
export function validateOscAddress(host: string, port: number): OscValidationResult {
  // Walidacja portu
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { valid: false, error: `Port musi być liczbą 1-65535, otrzymano: ${port}` };
  }

  // Walidacja hosta — IPv4
  const match = IPV4_REGEX.exec(host);
  if (!match) {
    return { valid: false, error: `Nieprawidłowy adres IPv4: ${host}` };
  }

  // Każdy oktet 0-255
  for (let i = 1; i <= 4; i++) {
    const octet = parseInt(match[i]!, 10);
    if (octet > 255) {
      return { valid: false, error: `Oktet ${i} poza zakresem (0-255): ${octet}` };
    }
  }

  return { valid: true };
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

  /**
   * Wysyła testowy pakiet OSC /nextime/ping z argem i:1.
   * Pozwala UI zweryfikować połączenie z urządzeniem docelowym.
   */
  testSend(): Promise<OscTestResult> {
    if (!this.config.enabled) {
      return Promise.resolve({ ok: false, error: 'OSC sender jest wyłączony' });
    }

    // Walidacja adresu przed wysyłką
    const validation = validateOscAddress(this.config.host, this.config.port);
    if (!validation.valid) {
      return Promise.resolve({ ok: false, error: validation.error });
    }

    const packet = buildOscMessage('/nextime/ping', [{ type: 'i', value: 1 }]);

    return new Promise<OscTestResult>((resolve) => {
      try {
        this.ensureSocket();
        this.socket!.send(packet, this.config.port, this.config.host, (err) => {
          if (err) {
            resolve({ ok: false, error: `Błąd wysyłania UDP: ${err.message}` });
          } else {
            console.log(`[OscSender] Test ping wysłany → ${this.config.host}:${this.config.port}`);
            resolve({ ok: true });
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        resolve({ ok: false, error: `Błąd socketa: ${msg}` });
      }
    });
  }

  /** Tworzy socket UDP jeśli jeszcze nie istnieje */
  private ensureSocket(): void {
    if (!this.socket) {
      this.socket = dgram.createSocket('udp4');
      this.socket.on('error', (err) => {
        console.error('[OscSender] Socket error:', err);
      });
      // unref() — socket nie blokuje zamknięcia procesu Electron
      this.socket.unref();
    }
  }

  /** Wysyła surowy pakiet UDP z callbackiem error */
  private send(packet: Buffer): void {
    this.ensureSocket();
    this.socket!.send(packet, this.config.port, this.config.host, (err) => {
      if (err) {
        console.error(`[OscSender] Błąd wysyłania UDP: ${err.message}`);
      }
    });
  }

  /** Aktualizuje konfigurację w runtime z walidacją */
  updateConfig(config: Partial<OscSenderConfig>): void {
    const newConfig = { ...this.config, ...config };
    // Walidacja adresu jeśli zmieniono host lub port
    if (config.host !== undefined || config.port !== undefined) {
      const validation = validateOscAddress(newConfig.host, newConfig.port);
      if (!validation.valid) {
        console.warn(`[OscSender] Nieprawidłowa konfiguracja: ${validation.error}`);
        return;
      }
    }
    this.config = newConfig;
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
