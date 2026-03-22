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
import { ObsSender } from './obs-sender';
import type { ObsSenderConfig, ObsStatus } from './obs-sender';
import { VmixSender } from './vmix-sender';
import type { VmixSenderConfig, VmixStatus, VmixTransitionType } from './vmix-sender';
import type { VmixInput, VmixState } from './vmix-xml-parser';
import { VisionRouter } from './vision-router';
import type { VisionRouterConfig, TargetSwitcher, VisionTransitionType } from './vision-router';

// Re-eksport wszystkich senderów
export { OscSender, MidiSender, GpiSender, MediaSender, AtemSender, LtcReader, PtzSender, MtcParser, ObsSender, VmixSender, VisionRouter, validateOscAddress };
export type { OscSenderConfig, OscTestResult, OscValidationResult, MidiSenderConfig, MidiPortInfo, MidiResult, MidiOutputPort, MidiOutputConstructor, GpiSenderConfig, SerialPortInfo, GpiSerialResult, MediaSenderConfig, AtemSenderConfig, AtemStatus, LtcReaderConfig, LtcReaderStatus, LtcSourceType, MidiInputPortInfo, MtcTimecode, PtzSenderConfig, ObsSenderConfig, ObsStatus, VmixSenderConfig, VmixStatus, VmixTransitionType, VmixInput, VmixState, VisionRouterConfig, TargetSwitcher, VisionTransitionType };

// ── SenderManager ───────────────────────────────────────

export interface SenderManagerConfig {
  osc?: Partial<OscSenderConfig>;
  midi?: Partial<MidiSenderConfig>;
  gpi?: Partial<GpiSenderConfig>;
  media?: Partial<MediaSenderConfig>;
  atem?: Partial<AtemSenderConfig>;
  ltc?: Partial<LtcReaderConfig>;
  ptz?: Partial<PtzSenderConfig>;
  obs?: Partial<ObsSenderConfig>;
  vmix?: Partial<VmixSenderConfig>;
  vision?: Partial<VisionRouterConfig>;
}

/**
 * Zarządza wszystkimi senderami — podpina je do PlaybackEngine.
 * Centralny punkt konfiguracji i cleanup.
 *
 * VisionRouter centralizuje routing vision cue → aktywny switcher (Faza 27).
 */
export class SenderManager {
  readonly osc: OscSender;
  readonly midi: MidiSender;
  readonly gpi: GpiSender;
  readonly media: MediaSender;
  readonly atem: AtemSender;
  readonly ltc: LtcReader;
  readonly ptz: PtzSender;
  readonly obs: ObsSender;
  readonly vmix: VmixSender;
  readonly visionRouter: VisionRouter;

  constructor(config: SenderManagerConfig = {}) {
    this.osc = new OscSender(config.osc);
    this.midi = new MidiSender(config.midi);
    this.gpi = new GpiSender(config.gpi);
    this.media = new MediaSender(config.media);
    this.atem = new AtemSender(config.atem);
    this.ltc = new LtcReader(config.ltc);
    this.ptz = new PtzSender(config.ptz);
    this.obs = new ObsSender(config.obs);
    this.vmix = new VmixSender(config.vmix);

    // VisionRouter — centralny routing vision cue → aktywny switcher
    this.visionRouter = new VisionRouter(config.vision);
    this.visionRouter.setSenders({ atem: this.atem, obs: this.obs, vmix: this.vmix });
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
    this.obs.attach(engine);
    this.vmix.attach(engine);
    // VisionRouter — centralny nasłuch vision-cue-changed
    this.visionRouter.attach(engine);
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
    this.obs.destroy();
    this.vmix.destroy();
    this.visionRouter.destroy();
    console.log('[SenderManager] Wszystkie sendery zniszczone');
  }
}
