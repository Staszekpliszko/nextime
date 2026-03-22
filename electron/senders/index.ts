import { EventEmitter } from 'events';
import { OscSender } from './osc-sender';
import type { OscSenderConfig, OscTestResult, OscValidationResult } from './osc-sender';
import { validateOscAddress } from './osc-sender';
import { MidiSender } from './midi-sender';
import type { MidiSenderConfig, MidiPortInfo, MidiResult, MidiOutputPort, MidiOutputConstructor } from './midi-sender';
import { GpiSender } from './gpi-sender';
import type { GpiSenderConfig } from './gpi-sender';
import type { SerialPortInfo, GpiSerialResult } from './gpi-serial';
import { MediaSender } from './media-sender';
import type { MediaSenderConfig } from './media-sender';
import { AtemSender } from './atem-sender';
import type { AtemSenderConfig, AtemStatus } from './atem-sender';
import { LtcReader } from './ltc-reader';
import type { LtcReaderConfig, LtcReaderStatus, LtcSourceType, MidiInputPortInfo } from './ltc-reader';
import { MtcParser } from './mtc-parser';
import type { MtcTimecode } from './mtc-parser';
import { PtzSender } from './ptz-sender';
import type { PtzSenderConfig } from './ptz-sender';

// Re-eksport wszystkich senderów
export { OscSender, MidiSender, GpiSender, MediaSender, AtemSender, LtcReader, PtzSender, MtcParser, validateOscAddress };
export type { OscSenderConfig, OscTestResult, OscValidationResult, MidiSenderConfig, MidiPortInfo, MidiResult, MidiOutputPort, MidiOutputConstructor, GpiSenderConfig, SerialPortInfo, GpiSerialResult, MediaSenderConfig, AtemSenderConfig, AtemStatus, LtcReaderConfig, LtcReaderStatus, LtcSourceType, MidiInputPortInfo, MtcTimecode, PtzSenderConfig };

// ── SenderManager ───────────────────────────────────────

export interface SenderManagerConfig {
  osc?: Partial<OscSenderConfig>;
  midi?: Partial<MidiSenderConfig>;
  gpi?: Partial<GpiSenderConfig>;
  media?: Partial<MediaSenderConfig>;
  atem?: Partial<AtemSenderConfig>;
  ltc?: Partial<LtcReaderConfig>;
  ptz?: Partial<PtzSenderConfig>;
}

/**
 * Zarządza wszystkimi senderami — podpina je do PlaybackEngine.
 * Centralny punkt konfiguracji i cleanup.
 */
export class SenderManager {
  readonly osc: OscSender;
  readonly midi: MidiSender;
  readonly gpi: GpiSender;
  readonly media: MediaSender;
  readonly atem: AtemSender;
  readonly ltc: LtcReader;
  readonly ptz: PtzSender;

  constructor(config: SenderManagerConfig = {}) {
    this.osc = new OscSender(config.osc);
    this.midi = new MidiSender(config.midi);
    this.gpi = new GpiSender(config.gpi);
    this.media = new MediaSender(config.media);
    this.atem = new AtemSender(config.atem);
    this.ltc = new LtcReader(config.ltc);
    this.ptz = new PtzSender(config.ptz);
  }

  /** Podpina wszystkie sendery do engine */
  attach(engine: EventEmitter): void {
    this.osc.attach(engine);
    this.midi.attach(engine);
    this.gpi.attach(engine);
    this.media.attach(engine);
    this.atem.attach(engine);
    this.ltc.attach(engine);
    this.ptz.attach(engine);
    console.log('[SenderManager] Wszystkie sendery podpięte do engine');
  }

  /** Niszczy wszystkie sendery */
  destroy(): void {
    this.osc.destroy();
    this.midi.destroy();
    this.gpi.destroy();
    this.media.destroy();
    this.atem.destroy();
    this.ltc.destroy();
    this.ptz.destroy();
    console.log('[SenderManager] Wszystkie sendery zniszczone');
  }
}
