import { EventEmitter } from 'events';
import type { AtemSender, SuperSourceBoxConfig } from './atem-sender';

// ── Typy danych vision_fx cue ─────────────────────────

/** Akcja efektu wizji ATEM */
export type AtemFxAction = 'macro' | 'dsk' | 'usk' | 'supersource';

/** Dane cue typu vision_fx — discriminated union na fx_action */
export interface VisionFxData {
  /** Typ akcji FX */
  fx_action: AtemFxAction;
  /** Nazwa efektu (wyświetlana w UI) */
  effect_name?: string;

  // Macro
  macro_index?: number;

  // DSK (Downstream Key)
  dsk_key_index?: number;
  dsk_on_air?: boolean;

  // USK (Upstream Key)
  usk_me_index?: number;
  usk_key_index?: number;
  usk_on_air?: boolean;

  // SuperSource
  ss_box_index?: number;
  ss_source?: number;
  ss_enabled?: boolean;
  ss_x?: number;
  ss_y?: number;
  ss_size?: number;
}

/** Minimalna struktura cached timeline cue — kompatybilna z CachedTimelineCue */
interface FxCuePayload {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

// ── AtemFxHandler ─────────────────────────────────────

/**
 * Handler efektów wizji ATEM (Faza 30).
 *
 * Nasłuchuje na event 'vision-fx-trigger' z PlaybackEngine i wykonuje
 * odpowiednią akcję na ATEM: macro, DSK on/off, USK on/off, SuperSource.
 */
export class AtemFxHandler {
  private _atem: AtemSender;
  private _engine: EventEmitter | null = null;
  private _boundHandler: ((cue: FxCuePayload) => void) | null = null;

  /** Callback do przechwytywania akcji (testy) */
  onFxAction: ((action: { fx_action: AtemFxAction; data: VisionFxData }) => void) | null = null;

  constructor(atem: AtemSender) {
    this._atem = atem;
  }

  /** Podpina się do engine — nasłuchuje 'vision-fx-trigger' */
  attach(engine: EventEmitter): void {
    this._engine = engine;
    this._boundHandler = (cue: FxCuePayload) => {
      this.handleVisionFx(cue);
    };
    engine.on('vision-fx-trigger', this._boundHandler);
    console.log('[AtemFxHandler] Podpięty do engine');
  }

  /** Obsługuje cue vision_fx — routing do odpowiedniej metody ATEM */
  handleVisionFx(cue: FxCuePayload): void {
    const data = cue.data as Partial<VisionFxData>;
    const fxAction = data.fx_action;

    if (!fxAction) {
      console.warn('[AtemFxHandler] Brak fx_action w cue', cue.id);
      return;
    }

    // Sprawdź połączenie ATEM
    const status = this._atem.getStatus();
    if (!status.connected) {
      console.warn('[AtemFxHandler] ATEM niepodłączony — ignoruję', fxAction);
      return;
    }

    // Callback dla testów
    if (this.onFxAction) {
      this.onFxAction({ fx_action: fxAction, data: data as VisionFxData });
    }

    switch (fxAction) {
      case 'macro':
        this.executeMacro(data);
        break;
      case 'dsk':
        this.executeDsk(data);
        break;
      case 'usk':
        this.executeUsk(data);
        break;
      case 'supersource':
        this.executeSuperSource(data);
        break;
      default:
        console.warn(`[AtemFxHandler] Nieznana fx_action: ${fxAction}`);
    }
  }

  /** Uruchamia makro ATEM */
  private executeMacro(data: Partial<VisionFxData>): void {
    const macroIndex = data.macro_index;
    if (macroIndex === undefined || macroIndex === null) {
      console.warn('[AtemFxHandler] Brak macro_index');
      return;
    }
    this._atem.runMacro(macroIndex);
  }

  /** Włącza/wyłącza DSK */
  private executeDsk(data: Partial<VisionFxData>): void {
    const keyIndex = data.dsk_key_index ?? 0;
    const onAir = data.dsk_on_air ?? true;
    this._atem.setDownstreamKey(keyIndex, onAir);
  }

  /** Włącza/wyłącza USK */
  private executeUsk(data: Partial<VisionFxData>): void {
    const meIndex = data.usk_me_index ?? 0;
    const keyIndex = data.usk_key_index ?? 0;
    const onAir = data.usk_on_air ?? true;
    this._atem.setUpstreamKey(meIndex, keyIndex, onAir);
  }

  /** Konfiguruje SuperSource box */
  private executeSuperSource(data: Partial<VisionFxData>): void {
    const boxIndex = data.ss_box_index ?? 0;
    const config: Partial<SuperSourceBoxConfig> = {};

    if (data.ss_source !== undefined) config.source = data.ss_source;
    if (data.ss_enabled !== undefined) config.enabled = data.ss_enabled;
    if (data.ss_x !== undefined) config.x = data.ss_x;
    if (data.ss_y !== undefined) config.y = data.ss_y;
    if (data.ss_size !== undefined) config.size = data.ss_size;

    this._atem.setSuperSourceBox(boxIndex, config);
  }

  /** Cleanup */
  destroy(): void {
    if (this._engine && this._boundHandler) {
      this._engine.removeListener('vision-fx-trigger', this._boundHandler);
    }
    this._engine = null;
    this._boundHandler = null;
    this.onFxAction = null;
  }
}
