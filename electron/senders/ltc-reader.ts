import { EventEmitter } from 'events';
import { MtcParser } from './mtc-parser';
import type { MtcTimecode } from './mtc-parser';

// ── Typy ────────────────────────────────────────────────

export type LtcSourceType = 'internal' | 'ltc' | 'mtc' | 'manual';

export interface LtcReaderConfig {
  /** Czy reader jest aktywny */
  enabled: boolean;
  /** Aktualny źródło TC */
  source: LtcSourceType;
  /** Indeks portu MIDI input (dla MTC) */
  mtcPortIndex: number;
}

/** Status LTC readera */
export interface LtcReaderStatus {
  /** Aktualny źródło TC */
  source: LtcSourceType;
  /** Czy jest połączony z zewnętrznym źródłem (LTC/MTC) */
  connected: boolean;
  /** Ostatnia odebrana pozycja w klatkach */
  lastTcFrames: number | null;
  /** Ostatni odebrany TC w formacie HH:MM:SS:FF */
  lastTcFormatted: string | null;
  /** Timestamp ostatniego odbioru TC */
  lastReceivedAt: number | null;
  /** Czy moduł MIDI jest dostępny (dla MTC) */
  midiAvailable: boolean;
}

/** Info o porcie MIDI input */
export interface MidiInputPortInfo {
  index: number;
  name: string;
}

// ── Interfejs MidiInput (DI) ────────────────────────────

/** Minimalna abstrakcja nad @julusian/midi Input */
export interface MidiInputPort {
  getPortCount(): number;
  getPortName(index: number): string;
  openPort(index: number): void;
  closePort(): void;
  on(event: string, listener: (...args: unknown[]) => void): this;
  isPortOpen(): boolean;
  ignoreTypes(sysex: boolean, timing: boolean, activeSensing: boolean): void;
}

/** Konstruktor MidiInputPort */
export type MidiInputConstructor = new () => MidiInputPort;

// ── Dynamiczny import @julusian/midi Input ──────────────

let DefaultMidiInputClass: MidiInputConstructor | null = null;
let defaultMidiInputLoadError: string | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const midiModule = require('@julusian/midi') as { Input: MidiInputConstructor };
  DefaultMidiInputClass = midiModule.Input;
  console.log('[LtcReader] Moduł @julusian/midi Input załadowany pomyślnie');
} catch (err) {
  defaultMidiInputLoadError = err instanceof Error ? err.message : String(err);
  console.warn(`[LtcReader] Moduł MIDI Input niedostępny: ${defaultMidiInputLoadError}`);
}

// ── LtcReader ──────────────────────────────────────────

const DEFAULT_CONFIG: LtcReaderConfig = {
  enabled: true,
  source: 'internal',
  mtcPortIndex: -1,
};

/**
 * Czytnik zewnętrznego timecodu (LTC audio / MTC MIDI / manual).
 *
 * Tryb MTC: otwiera port MIDI Input, nasłuchuje Quarter Frame messages (F1)
 * i dekoduje pełny TC przy pomocy MtcParser.
 *
 * Emituje:
 * - 'tc-received' (frames: number) — nowa pozycja TC
 * - 'tc-lost' — brak sygnału TC
 * - 'source-changed' (source: LtcSourceType) — zmiana źródła
 * - 'mtc-timecode' (tc: MtcTimecode) — pełny TC z MTC
 */
export class LtcReader extends EventEmitter {
  private config: LtcReaderConfig;
  private _connected = false;
  private _lastTcFrames: number | null = null;
  private _lastTcFormatted: string | null = null;
  private _lastReceivedAt: number | null = null;

  /** Parser MTC Quarter Frame */
  private readonly mtcParser: MtcParser;
  /** Port MIDI Input (dla MTC) */
  private midiInput: MidiInputPort | null = null;
  /** Klasa Input — z @julusian/midi lub wstrzyknięta (DI) */
  private readonly MidiInputClass: MidiInputConstructor | null;
  private readonly midiLoadError: string | null;

  /** Callback do testów — przechwytuje tc-received */
  onTcReceived: ((frames: number) => void) | null = null;

  constructor(
    config: Partial<LtcReaderConfig> = {},
    MidiInputClass?: MidiInputConstructor | null,
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // DI: jeśli podano MidiInputClass, używaj go; inaczej — domyślny
    if (MidiInputClass !== undefined) {
      this.MidiInputClass = MidiInputClass;
      this.midiLoadError = MidiInputClass ? null : 'Moduł MIDI Input nie został podany';
    } else {
      this.MidiInputClass = DefaultMidiInputClass;
      this.midiLoadError = defaultMidiInputLoadError;
    }

    // Parser MTC
    this.mtcParser = new MtcParser();
    this.mtcParser.onTimecode = (tc, totalFrames) => {
      this._handleMtcTimecode(tc, totalFrames);
    };
  }

  /** Podpina się do engine — LTC reader nie nasłuchuje engine, ale KARMIA go danymi */
  attach(_engine: EventEmitter): void {
    console.log(`[LtcReader] Podpięty (source: ${this.config.source})`);
  }

  /** Czy moduł MIDI Input jest załadowany (potrzebny dla MTC) */
  isMidiAvailable(): boolean {
    return this.MidiInputClass !== null;
  }

  /** Lista portów MIDI Input (dla MTC) */
  listMtcPorts(): MidiInputPortInfo[] {
    if (!this.MidiInputClass) return [];

    try {
      const tempInput = new this.MidiInputClass();
      const count = tempInput.getPortCount();
      const ports: MidiInputPortInfo[] = [];

      for (let i = 0; i < count; i++) {
        ports.push({ index: i, name: tempInput.getPortName(i) });
      }

      tempInput.closePort();
      return ports;
    } catch (err) {
      console.error('[LtcReader] Błąd listowania portów MIDI Input:', err);
      return [];
    }
  }

  /** Łączy z MTC na danym porcie MIDI Input */
  connectMtc(portIndex: number): { ok: boolean; error?: string } {
    if (!this.MidiInputClass) {
      return { ok: false, error: `Moduł MIDI niedostępny: ${this.midiLoadError ?? 'nieznany błąd'}` };
    }

    // Rozłącz poprzedni
    this.disconnectMtc();

    try {
      this.midiInput = new this.MidiInputClass();
      const count = this.midiInput.getPortCount();

      if (portIndex < 0 || portIndex >= count) {
        this.midiInput.closePort();
        this.midiInput = null;
        return { ok: false, error: `Port ${portIndex} nie istnieje (dostępne: 0-${count - 1})` };
      }

      // Otwórz port i włącz odbieranie MTC (timing messages)
      this.midiInput.openPort(portIndex);
      // ignoreTypes: sysex=true (nie potrzebujemy Full Frame SysEx na razie),
      // timing=false (chcemy Quarter Frame!), activeSensing=true
      this.midiInput.ignoreTypes(true, false, true);

      // Nasłuchuj wiadomości MIDI
      this.midiInput.on('message', (_deltaTime: unknown, message: unknown) => {
        this._handleMidiMessage(message as number[]);
      });

      this.config.mtcPortIndex = portIndex;
      this._connected = true;
      this.mtcParser.reset();
      this.emit('connected');

      const portName = this.midiInput.getPortName(portIndex);
      console.log(`[LtcReader] MTC połączony: port ${portIndex} (${portName})`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[LtcReader] Błąd otwierania portu MTC ${portIndex}:`, err);
      this.midiInput = null;
      return { ok: false, error: msg };
    }
  }

  /** Rozłącza MTC */
  disconnectMtc(): void {
    if (this.midiInput) {
      try {
        this.midiInput.closePort();
      } catch {
        // Ignoruj błędy zamykania
      }
      this.midiInput = null;
    }
    if (this._connected && this.config.source === 'mtc') {
      this._connected = false;
      this.emit('disconnected');
      console.log('[LtcReader] MTC rozłączony');
    }
  }

  /** Łączy z zewnętrznym źródłem LTC/MTC */
  connect(): void {
    if (!this.config.enabled) return;
    if (this.config.source === 'internal' || this.config.source === 'manual') {
      return;
    }

    if (this.config.source === 'mtc') {
      // Połącz MTC na zapisanym porcie
      if (this.config.mtcPortIndex >= 0) {
        this.connectMtc(this.config.mtcPortIndex);
      }
      return;
    }

    // LTC audio — placeholder (wymaga dedykowanego hardware/library)
    console.log(`[LtcReader] Łączę z ${this.config.source.toUpperCase()} (placeholder)...`);
    this._connected = true;
    this.emit('connected');
    console.log(`[LtcReader] Połączono z ${this.config.source.toUpperCase()} (placeholder)`);
  }

  /** Rozłącza zewnętrzne źródło */
  disconnect(): void {
    this.disconnectMtc();
    this._connected = false;
    this._lastTcFrames = null;
    this._lastTcFormatted = null;
    this._lastReceivedAt = null;
    this.emit('disconnected');
    console.log('[LtcReader] Rozłączono');
  }

  /** Zmienia źródło TC */
  setSource(source: LtcSourceType): void {
    const prev = this.config.source;
    this.config.source = source;

    // Rozłącz jeśli zmienił się source i byliśmy połączeni
    if (prev !== source && this._connected) {
      this.disconnect();
    }

    this.emit('source-changed', source);
    console.log(`[LtcReader] Źródło zmienione: ${prev} → ${source}`);
  }

  /** Ręczne ustawienie pozycji TC (manual mode lub symulowany odbiór) */
  feedTc(frames: number): void {
    if (!this.config.enabled) return;

    this._lastTcFrames = frames;
    this._lastReceivedAt = Date.now();

    this.emit('tc-received', frames);
    if (this.onTcReceived) {
      this.onTcReceived(frames);
    }
  }

  /** Zwraca aktualny status */
  getStatus(): LtcReaderStatus {
    return {
      source: this.config.source,
      connected: this._connected,
      lastTcFrames: this._lastTcFrames,
      lastTcFormatted: this._lastTcFormatted,
      lastReceivedAt: this._lastReceivedAt,
      midiAvailable: this.isMidiAvailable(),
    };
  }

  /** Zwraca aktualną konfigurację */
  getConfig(): LtcReaderConfig {
    return { ...this.config };
  }

  /** Aktualizuje konfigurację */
  updateConfig(config: Partial<LtcReaderConfig>): void {
    if (config.source !== undefined && config.source !== this.config.source) {
      this.setSource(config.source);
    }
    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
    }
    if (config.mtcPortIndex !== undefined) {
      this.config.mtcPortIndex = config.mtcPortIndex;
    }
  }

  /** Cleanup */
  destroy(): void {
    this.disconnect();
    this.onTcReceived = null;
    this.mtcParser.onTimecode = null;
    this.removeAllListeners();
  }

  // ── Prywatne ────────────────────────────────────────────

  /** Obsługuje surową wiadomość MIDI */
  private _handleMidiMessage(message: number[]): void {
    if (!message || message.length < 2) return;

    // Quarter Frame: status = 0xF1
    if (message[0] === 0xF1 && message.length >= 2) {
      this.mtcParser.feedQuarterFrame(message[1]!);
    }
  }

  /** Obsługuje zdekodowany TC z MTC parsera */
  private _handleMtcTimecode(tc: MtcTimecode, totalFrames: number): void {
    this._lastTcFrames = totalFrames;
    this._lastTcFormatted = MtcParser.formatTc(tc);
    this._lastReceivedAt = Date.now();

    this.emit('tc-received', totalFrames);
    this.emit('mtc-timecode', tc);

    if (this.onTcReceived) {
      this.onTcReceived(totalFrames);
    }
  }
}
