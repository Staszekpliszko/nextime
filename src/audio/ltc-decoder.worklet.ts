/**
 * LTC Audio Decoder — AudioWorkletProcessor
 *
 * Dekoduje sygnał LTC (Linear Timecode, SMPTE 12M) z wejścia audio.
 * Manchester biphase encoding → 80-bitowe klatki → BCD → HH:MM:SS:FF.
 *
 * Architektura:
 *   AudioContext → getUserMedia → AudioWorkletNode (ten plik) → port.postMessage
 *
 * Nie importujemy żadnych modułów — AudioWorklet działa w izolowanym kontekście.
 */

// AudioWorklet API — w kontekście worklet te globale istnieją,
// w Node.js (testy) nie — definiujemy fallback polyfill
/* eslint-disable @typescript-eslint/no-extraneous-class */
interface AudioWorkletProcessorLike {
  readonly port: MessagePort;
}

const BaseProcessor: { new(): AudioWorkletProcessorLike } =
  typeof globalThis !== 'undefined' && 'AudioWorkletProcessor' in globalThis
    ? (globalThis as Record<string, unknown>)['AudioWorkletProcessor'] as { new(): AudioWorkletProcessorLike }
    : class { readonly port = { onmessage: null, postMessage: () => {} } as unknown as MessagePort; };

const _registerProcessor =
  typeof globalThis !== 'undefined' && 'registerProcessor' in globalThis
    ? (globalThis as Record<string, unknown>)['registerProcessor'] as (name: string, ctor: unknown) => void
    : (_name: string, _ctor: unknown): void => {};

// ── Stałe ────────────────────────────────────────────────

/** Próg hysteresis do wykrywania zero-crossings (eliminacja szumu) */
const HYSTERESIS_THRESHOLD = 0.02;
/** Tolerancja okresu bitu — 30% */
const BIT_PERIOD_TOLERANCE = 0.3;
/** Ile poprawnych klatek do uznania synchronizacji za stabilną */
const MIN_VALID_FRAMES = 3;
/** Liczba bitów w klatce LTC */
const LTC_FRAME_BITS = 80;
/** Sync word SMPTE — ostatnie 16 bitów klatki: 0011 1111 1111 1101 */
const SYNC_WORD = 0b0011111111111101;
/** Sync word odwrócony (reverse playback): 1011 1111 1111 1100 */
const SYNC_WORD_REVERSE = 0b1011111111111100;

// ── Typy (brak importów w worklet) ───────────────────────

interface LtcTimecodeMessage {
  type: 'timecode';
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  fps: number;
  dropFrame: boolean;
  reverse: boolean;
}

interface LtcStatusMessage {
  type: 'status';
  status: 'synced' | 'lost' | 'weak';
  validFrameCount: number;
  errorRate: number;
}

interface LtcLevelMessage {
  type: 'level';
  peak: number;
}

type LtcWorkerMessage = LtcTimecodeMessage | LtcStatusMessage | LtcLevelMessage;

// ── Dekoder ──────────────────────────────────────────────

class LtcDecoderProcessor extends BaseProcessor {
  // Stan zero-crossing
  private lastSample = 0;
  private lastCrossingFrame = 0;
  private isPositive = false;

  // Bit clock recovery
  private bitPeriodSamples = 0; // adaptacyjny okres jednego bitu (w próbkach)
  private bitPeriodAccum = 0;
  private bitPeriodCount = 0;
  private halfPeriodSamples: number[] = []; // bufor ostatnich half-periods

  // Składanie bitów i klatek
  private bitBuffer: number[] = [];
  private frameBuffer: number[] = new Array(LTC_FRAME_BITS).fill(0);

  // Sync & status
  private validFrameCount = 0;
  private totalTransitions = 0;
  private errorTransitions = 0;
  private lastTcSentAt = 0;
  private sampleCounter = 0;
  private lastLevelSentAt = 0;

  // Flaga aktywności
  private active = true;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data === 'stop') {
        this.active = false;
      }
    };
  }

  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    if (!this.active) return false;

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    // Peak level — wysyłaj co ~100ms (ok. 4410 samples @ 44100)
    let peak = 0;
    for (let i = 0; i < channel.length; i++) {
      const abs = Math.abs(channel[i]!);
      if (abs > peak) peak = abs;
    }

    this.sampleCounter += channel.length;
    if (this.sampleCounter - this.lastLevelSentAt > 4410) {
      this.lastLevelSentAt = this.sampleCounter;
      const msg: LtcLevelMessage = { type: 'level', peak };
      this.port.postMessage(msg);
    }

    // Przetwarzaj próbki
    for (let i = 0; i < channel.length; i++) {
      this.processSample(channel[i]!);
    }

    return true;
  }

  private processSample(sample: number): void {
    this.sampleCounter++;

    // Zero-crossing z hysteresis
    const wasPositive = this.isPositive;
    if (sample > HYSTERESIS_THRESHOLD) {
      this.isPositive = true;
    } else if (sample < -HYSTERESIS_THRESHOLD) {
      this.isPositive = false;
    }
    // else: w strefie hysteresis — nie zmieniaj

    if (wasPositive !== this.isPositive) {
      this.onZeroCrossing();
    }

    this.lastSample = sample;
  }

  private onZeroCrossing(): void {
    const interval = this.sampleCounter - this.lastCrossingFrame;
    this.lastCrossingFrame = this.sampleCounter;

    if (interval < 2) return; // szum, za krótki

    this.totalTransitions++;

    // Jeśli nie mamy jeszcze estymaty okresu bitu — zbieraj dane
    if (this.bitPeriodSamples === 0) {
      this.halfPeriodSamples.push(interval);
      if (this.halfPeriodSamples.length >= 40) {
        this.estimateInitialBitPeriod();
      }
      return;
    }

    // Klasyfikuj half-period jako "krótki" (1/2 bitu) lub "długi" (1 bitu)
    const halfBit = this.bitPeriodSamples / 2;
    const toleranceHalf = halfBit * BIT_PERIOD_TOLERANCE;
    const toleranceFull = this.bitPeriodSamples * BIT_PERIOD_TOLERANCE;

    if (Math.abs(interval - halfBit) < toleranceHalf) {
      // Krótki — to jest połowa bitu (Manchester transition w środku)
      this.halfPeriodSamples.push(interval);
      if (this.halfPeriodSamples.length === 2) {
        // Dwa krótkie = bit "1"
        this.pushBit(1);
        this.updateBitPeriod(this.halfPeriodSamples[0]! + this.halfPeriodSamples[1]!);
        this.halfPeriodSamples = [];
      }
    } else if (Math.abs(interval - this.bitPeriodSamples) < toleranceFull) {
      // Długi — to jest pełny bit "0" (brak transition w środku)
      if (this.halfPeriodSamples.length === 1) {
        // Jeden krótki + jeden długi — to był bit "1" + początek bitu "0"
        this.pushBit(1);
        this.halfPeriodSamples = [];
      }
      this.pushBit(0);
      this.updateBitPeriod(interval);
    } else {
      // Poza tolerancją — błąd, reset half-period buffer
      this.errorTransitions++;
      this.halfPeriodSamples = [];
    }
  }

  private estimateInitialBitPeriod(): void {
    // Sortujemy intervały i szukamy dwóch klastrów (krótkie = half-bit, długie = full-bit)
    const sorted = [...this.halfPeriodSamples].sort((a, b) => a - b);

    // Odrzuć outliers (dolne/górne 10%)
    const trimStart = Math.floor(sorted.length * 0.1);
    const trimEnd = Math.ceil(sorted.length * 0.9);
    const trimmed = sorted.slice(trimStart, trimEnd);

    if (trimmed.length < 4) {
      // Za mało danych — zbierz więcej
      return;
    }

    // Metoda: znajdź największą lukę w posortowanych wartościach
    // Luka dzieli dwa klastry: half-bit i full-bit
    let maxGap = 0;
    let gapIndex = 0;
    for (let i = 1; i < trimmed.length; i++) {
      const gap = trimmed[i]! - trimmed[i - 1]!;
      if (gap > maxGap) {
        maxGap = gap;
        gapIndex = i;
      }
    }

    const min = trimmed[0]!;
    const max = trimmed[trimmed.length - 1]!;

    // Jeśli znaleźliśmy znaczącą lukę (>30% zakresu) — mamy dwa klastry
    if (maxGap > (max - min) * 0.2 && gapIndex > 0 && gapIndex < trimmed.length) {
      const shortCluster = trimmed.slice(0, gapIndex);
      const longCluster = trimmed.slice(gapIndex);

      if (shortCluster.length > 0 && longCluster.length > 0) {
        const avgShort = shortCluster.reduce((a, b) => a + b, 0) / shortCluster.length;
        const avgLong = longCluster.reduce((a, b) => a + b, 0) / longCluster.length;

        // Długie powinny być ~2x krótkie
        if (avgLong > avgShort * 1.4 && avgLong < avgShort * 2.6) {
          this.bitPeriodSamples = avgLong; // długi = pełny bit period
          this.halfPeriodSamples = [];
          return;
        }
      }
    }

    // Fallback: wszystkie wartości zbliżone — mogą to być same full-bit (0) lub same half-bit (1)
    // Heurystyka: wartości to pełne okresy bitów (najczęstszy przypadek przy dużej ilości zer w user bits)
    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

    if (max / min < 1.5) {
      // Mała rozpiętość — wszystkie wartości to ten sam typ (full-bit lub half-bit)
      // Przyjmij jako full-bit period (bezpieczniejsze)
      this.bitPeriodSamples = avg;
    } else {
      // Umiarkowana rozpiętość — użyj mediany jako full-bit period
      this.bitPeriodSamples = trimmed[Math.floor(trimmed.length / 2)]!;
    }
    this.halfPeriodSamples = [];
  }

  private updateBitPeriod(fullPeriod: number): void {
    // Adaptacyjna średnia krocząca
    this.bitPeriodAccum += fullPeriod;
    this.bitPeriodCount++;
    if (this.bitPeriodCount >= 16) {
      this.bitPeriodSamples = this.bitPeriodAccum / this.bitPeriodCount;
      this.bitPeriodAccum = 0;
      this.bitPeriodCount = 0;
    }
  }

  private pushBit(bit: number): void {
    this.bitBuffer.push(bit);

    // Sprawdź sync word w ostatnich 16 bitach
    if (this.bitBuffer.length >= LTC_FRAME_BITS) {
      const last16 = this.getLast16Bits();

      if (last16 === SYNC_WORD) {
        this.decodeFrame(false);
        this.bitBuffer = [];
      } else if (last16 === SYNC_WORD_REVERSE) {
        this.decodeFrame(true);
        this.bitBuffer = [];
      } else if (this.bitBuffer.length > LTC_FRAME_BITS * 2) {
        // Za dużo bitów bez sync — resetuj
        this.bitBuffer = this.bitBuffer.slice(-LTC_FRAME_BITS);
      }
    }
  }

  private getLast16Bits(): number {
    let val = 0;
    const start = this.bitBuffer.length - 16;
    for (let i = 0; i < 16; i++) {
      val = (val << 1) | (this.bitBuffer[start + i]! & 1);
    }
    return val;
  }

  private decodeFrame(reverse: boolean): void {
    // Weź ostatnie 80 bitów
    const start = this.bitBuffer.length - LTC_FRAME_BITS;
    if (start < 0) return;

    for (let i = 0; i < LTC_FRAME_BITS; i++) {
      this.frameBuffer[i] = this.bitBuffer[start + i]!;
    }

    // Jeśli reverse — odwróć kolejność bitów
    if (reverse) {
      this.frameBuffer.reverse();
    }

    // Dekoduj BCD z 80-bitowej klatki SMPTE 12M
    // Layout (bity 0-79):
    //  0-3:   frames units (BCD)
    //  4-7:   user bits field 1
    //  8-9:   frames tens (BCD, 2 bity)
    // 10:     drop-frame flag
    // 11:     color frame flag
    // 12-15:  user bits field 2
    // 16-19:  seconds units (BCD)
    // 20-23:  user bits field 3
    // 24-26:  seconds tens (BCD, 3 bity)
    // 27:     biphase correction bit
    // 28-31:  user bits field 4
    // 32-35:  minutes units (BCD)
    // 36-39:  user bits field 5
    // 40-42:  minutes tens (BCD, 3 bity)
    // 43:     binary group flag
    // 44-47:  user bits field 6
    // 48-51:  hours units (BCD)
    // 52-55:  user bits field 7
    // 56-57:  hours tens (BCD, 2 bity)
    // 58:     binary group flag
    // 59:     reserved
    // 60-63:  user bits field 8
    // 64-79:  sync word

    const framesUnits = this.bcdFromBits(0, 4);
    const framesTens = this.bcdFromBits(8, 2);
    const dropFrame = this.frameBuffer[10] === 1;
    const secondsUnits = this.bcdFromBits(16, 4);
    const secondsTens = this.bcdFromBits(24, 3);
    const minutesUnits = this.bcdFromBits(32, 4);
    const minutesTens = this.bcdFromBits(40, 3);
    const hoursUnits = this.bcdFromBits(48, 4);
    const hoursTens = this.bcdFromBits(56, 2);

    const frames = framesTens * 10 + framesUnits;
    const seconds = secondsTens * 10 + secondsUnits;
    const minutes = minutesTens * 10 + minutesUnits;
    const hours = hoursTens * 10 + hoursUnits;

    // Walidacja zakresu
    if (hours > 23 || minutes > 59 || seconds > 59 || frames > 30) {
      return; // Uszkodzona klatka
    }

    // Wykryj fps na podstawie max frames i drop-frame
    const fps = this.detectFps(frames, dropFrame);

    this.validFrameCount++;

    // Wyślij timecode gdy mamy stabilny sync
    if (this.validFrameCount >= MIN_VALID_FRAMES) {
      const msg: LtcTimecodeMessage = {
        type: 'timecode',
        hours, minutes, seconds, frames,
        fps,
        dropFrame,
        reverse,
      };
      this.port.postMessage(msg);
    }

    // Status
    const errorRate = this.totalTransitions > 0
      ? this.errorTransitions / this.totalTransitions
      : 0;

    const statusMsg: LtcStatusMessage = {
      type: 'status',
      status: errorRate > 0.1 ? 'weak' : 'synced',
      validFrameCount: this.validFrameCount,
      errorRate,
    };
    this.port.postMessage(statusMsg);

    // Resetuj error countery co 1000 transitions
    if (this.totalTransitions > 1000) {
      this.totalTransitions = 0;
      this.errorTransitions = 0;
    }
  }

  /** Odczytuje wartość BCD z frameBuffer od pozycji bitStart, count bitów */
  private bcdFromBits(bitStart: number, count: number): number {
    let val = 0;
    for (let i = 0; i < count; i++) {
      val |= (this.frameBuffer[bitStart + i]! & 1) << i;
    }
    return val;
  }

  /** Wykrywa FPS na podstawie wartości frames i flagi drop-frame */
  private detectFps(maxFramesSeen: number, dropFrame: boolean): number {
    if (dropFrame) {
      return 29.97;
    }
    // Heurystyka: jeśli widzimy klatki >= 25 to 30fps, inaczej 25fps
    // Dokładniejsze wykrywanie wymaga obserwacji wielu klatek
    if (maxFramesSeen >= 25) return 30;
    if (maxFramesSeen >= 24) return 25;
    return 24;
  }
}

// Rejestracja procesora (w kontekście AudioWorklet)
_registerProcessor('ltc-decoder-processor', LtcDecoderProcessor);

// ── Eksport do testów (logika dekodera jako czyste funkcje) ──

/**
 * Eksportowana klasa dekodera do testów unit — bez AudioWorklet API.
 * Symuluje process() i emituje zdekodowane TC.
 */
export class LtcDecoderCore {
  // Stan zero-crossing
  private lastSample = 0;
  private sampleCounter = 0;
  private lastCrossingFrame = 0;
  private isPositive = false;

  // Bit clock recovery
  private bitPeriodSamples = 0;
  private bitPeriodAccum = 0;
  private bitPeriodCount = 0;
  private halfPeriodSamples: number[] = [];

  // Bity i klatki
  private bitBuffer: number[] = [];
  private frameBuffer: number[] = new Array(LTC_FRAME_BITS).fill(0);

  // Status
  private validFrameCount = 0;
  private totalTransitions = 0;
  private errorTransitions = 0;

  /** Callback przy zdekodowaniu TC */
  onTimecode: ((tc: LtcTimecodeMessage) => void) | null = null;
  /** Callback przy zmianie statusu */
  onStatus: ((status: LtcStatusMessage) => void) | null = null;

  /** Podaj blok próbek audio (Float32Array lub number[]) */
  processSamples(samples: ArrayLike<number>): void {
    for (let i = 0; i < samples.length; i++) {
      this.processSample(samples[i]!);
    }
  }

  /** Reset stanu dekodera */
  reset(): void {
    this.lastSample = 0;
    this.sampleCounter = 0;
    this.lastCrossingFrame = 0;
    this.isPositive = false;
    this.bitPeriodSamples = 0;
    this.bitPeriodAccum = 0;
    this.bitPeriodCount = 0;
    this.halfPeriodSamples = [];
    this.bitBuffer = [];
    this.frameBuffer = new Array(LTC_FRAME_BITS).fill(0);
    this.validFrameCount = 0;
    this.totalTransitions = 0;
    this.errorTransitions = 0;
  }

  private processSample(sample: number): void {
    this.sampleCounter++;

    const wasPositive = this.isPositive;
    if (sample > HYSTERESIS_THRESHOLD) {
      this.isPositive = true;
    } else if (sample < -HYSTERESIS_THRESHOLD) {
      this.isPositive = false;
    }

    if (wasPositive !== this.isPositive) {
      this.onZeroCrossing();
    }

    this.lastSample = sample;
  }

  private onZeroCrossing(): void {
    const interval = this.sampleCounter - this.lastCrossingFrame;
    this.lastCrossingFrame = this.sampleCounter;

    if (interval < 2) return;

    this.totalTransitions++;

    if (this.bitPeriodSamples === 0) {
      this.halfPeriodSamples.push(interval);
      if (this.halfPeriodSamples.length >= 40) {
        this.estimateInitialBitPeriod();
      }
      return;
    }

    const halfBit = this.bitPeriodSamples / 2;
    const toleranceHalf = halfBit * BIT_PERIOD_TOLERANCE;
    const toleranceFull = this.bitPeriodSamples * BIT_PERIOD_TOLERANCE;

    if (Math.abs(interval - halfBit) < toleranceHalf) {
      this.halfPeriodSamples.push(interval);
      if (this.halfPeriodSamples.length === 2) {
        this.pushBit(1);
        this.updateBitPeriod(this.halfPeriodSamples[0]! + this.halfPeriodSamples[1]!);
        this.halfPeriodSamples = [];
      }
    } else if (Math.abs(interval - this.bitPeriodSamples) < toleranceFull) {
      if (this.halfPeriodSamples.length === 1) {
        this.pushBit(1);
        this.halfPeriodSamples = [];
      }
      this.pushBit(0);
      this.updateBitPeriod(interval);
    } else {
      this.errorTransitions++;
      this.halfPeriodSamples = [];
    }
  }

  private estimateInitialBitPeriod(): void {
    const sorted = [...this.halfPeriodSamples].sort((a, b) => a - b);

    const trimStart = Math.floor(sorted.length * 0.1);
    const trimEnd = Math.ceil(sorted.length * 0.9);
    const trimmed = sorted.slice(trimStart, trimEnd);

    if (trimmed.length < 4) return;

    let maxGap = 0;
    let gapIndex = 0;
    for (let i = 1; i < trimmed.length; i++) {
      const gap = trimmed[i]! - trimmed[i - 1]!;
      if (gap > maxGap) {
        maxGap = gap;
        gapIndex = i;
      }
    }

    const min = trimmed[0]!;
    const max = trimmed[trimmed.length - 1]!;

    if (maxGap > (max - min) * 0.2 && gapIndex > 0 && gapIndex < trimmed.length) {
      const shortCluster = trimmed.slice(0, gapIndex);
      const longCluster = trimmed.slice(gapIndex);

      if (shortCluster.length > 0 && longCluster.length > 0) {
        const avgShort = shortCluster.reduce((a, b) => a + b, 0) / shortCluster.length;
        const avgLong = longCluster.reduce((a, b) => a + b, 0) / longCluster.length;

        if (avgLong > avgShort * 1.4 && avgLong < avgShort * 2.6) {
          this.bitPeriodSamples = avgLong;
          this.halfPeriodSamples = [];
          return;
        }
      }
    }

    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    if (max / min < 1.5) {
      this.bitPeriodSamples = avg;
    } else {
      this.bitPeriodSamples = trimmed[Math.floor(trimmed.length / 2)]!;
    }
    this.halfPeriodSamples = [];
  }

  private updateBitPeriod(fullPeriod: number): void {
    this.bitPeriodAccum += fullPeriod;
    this.bitPeriodCount++;
    if (this.bitPeriodCount >= 16) {
      this.bitPeriodSamples = this.bitPeriodAccum / this.bitPeriodCount;
      this.bitPeriodAccum = 0;
      this.bitPeriodCount = 0;
    }
  }

  private pushBit(bit: number): void {
    this.bitBuffer.push(bit);

    if (this.bitBuffer.length >= LTC_FRAME_BITS) {
      const last16 = this.getLast16Bits();

      if (last16 === SYNC_WORD) {
        this.decodeFrame(false);
        this.bitBuffer = [];
      } else if (last16 === SYNC_WORD_REVERSE) {
        this.decodeFrame(true);
        this.bitBuffer = [];
      } else if (this.bitBuffer.length > LTC_FRAME_BITS * 2) {
        this.bitBuffer = this.bitBuffer.slice(-LTC_FRAME_BITS);
      }
    }
  }

  private getLast16Bits(): number {
    let val = 0;
    const start = this.bitBuffer.length - 16;
    for (let i = 0; i < 16; i++) {
      val = (val << 1) | (this.bitBuffer[start + i]! & 1);
    }
    return val;
  }

  private decodeFrame(reverse: boolean): void {
    const start = this.bitBuffer.length - LTC_FRAME_BITS;
    if (start < 0) return;

    for (let i = 0; i < LTC_FRAME_BITS; i++) {
      this.frameBuffer[i] = this.bitBuffer[start + i]!;
    }

    if (reverse) {
      this.frameBuffer.reverse();
    }

    const framesUnits = this.bcdFromBits(0, 4);
    const framesTens = this.bcdFromBits(8, 2);
    const dropFrame = this.frameBuffer[10] === 1;
    const secondsUnits = this.bcdFromBits(16, 4);
    const secondsTens = this.bcdFromBits(24, 3);
    const minutesUnits = this.bcdFromBits(32, 4);
    const minutesTens = this.bcdFromBits(40, 3);
    const hoursUnits = this.bcdFromBits(48, 4);
    const hoursTens = this.bcdFromBits(56, 2);

    const frames = framesTens * 10 + framesUnits;
    const seconds = secondsTens * 10 + secondsUnits;
    const minutes = minutesTens * 10 + minutesUnits;
    const hours = hoursTens * 10 + hoursUnits;

    if (hours > 23 || minutes > 59 || seconds > 59 || frames > 30) {
      return;
    }

    const fps = this.detectFps(frames, dropFrame);
    this.validFrameCount++;

    if (this.validFrameCount >= MIN_VALID_FRAMES && this.onTimecode) {
      this.onTimecode({
        type: 'timecode',
        hours, minutes, seconds, frames,
        fps,
        dropFrame,
        reverse,
      });
    }

    const errorRate = this.totalTransitions > 0
      ? this.errorTransitions / this.totalTransitions
      : 0;

    if (this.onStatus) {
      this.onStatus({
        type: 'status',
        status: errorRate > 0.1 ? 'weak' : 'synced',
        validFrameCount: this.validFrameCount,
        errorRate,
      });
    }

    if (this.totalTransitions > 1000) {
      this.totalTransitions = 0;
      this.errorTransitions = 0;
    }
  }

  private bcdFromBits(bitStart: number, count: number): number {
    let val = 0;
    for (let i = 0; i < count; i++) {
      val |= (this.frameBuffer[bitStart + i]! & 1) << i;
    }
    return val;
  }

  private detectFps(maxFramesSeen: number, dropFrame: boolean): number {
    if (dropFrame) return 29.97;
    if (maxFramesSeen >= 25) return 30;
    if (maxFramesSeen >= 24) return 25;
    return 24;
  }
}
