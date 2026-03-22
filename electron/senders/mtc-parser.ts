/**
 * Parser MTC (MIDI Timecode) Quarter Frame messages.
 *
 * MIDI Timecode używa wiadomości Quarter Frame (status 0xF1)
 * do przesyłania pełnego TC w 8 kolejnych wiadomościach.
 *
 * Każda QF zawiera 4 bity danych + 3-bitowy identyfikator pola:
 *   F1 0n_dddd — n=numer pola (0-7), dddd=dane
 *
 * Po zebraniu 8 QF (pola 0-7) parser emituje pełny timecode.
 *
 * Specyfikacja: MIDI 1.0 Detailed Specification 4.2.1
 */

// ── Typy ────────────────────────────────────────────────

/** Frame rate zakodowany w MTC */
export type MtcFrameRate = 24 | 25 | 29.97 | 30;

/** Pełny timecode z MTC */
export interface MtcTimecode {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  frameRate: MtcFrameRate;
}

/** Callback po zdekodowaniu pełnego TC */
export type MtcCallback = (tc: MtcTimecode, totalFrames: number) => void;

// ── Frame rate lookup ───────────────────────────────────

const FRAME_RATE_TABLE: Record<number, MtcFrameRate> = {
  0: 24,
  1: 25,
  2: 29.97,  // 30 drop-frame
  3: 30,
};

// ── MtcParser ───────────────────────────────────────────

export class MtcParser {
  /** Bufor na 8 pól QF (nibble values) */
  private qfData: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  /** Ostatnio otrzymany numer pola QF (0-7) */
  private lastQfIndex = -1;
  /** Ile pól zebrano w aktualnej sekwencji */
  private qfCount = 0;
  /** Callback po zdekodowaniu pełnego TC */
  onTimecode: MtcCallback | null = null;

  /**
   * Podaje bajt danych Quarter Frame (drugi bajt wiadomości F1).
   *
   * Format: 0nnn_dddd
   *   nnn = numer pola (0-7)
   *   dddd = 4 bity danych
   *
   * Pola:
   *   0: frames low nibble
   *   1: frames high nibble
   *   2: seconds low nibble
   *   3: seconds high nibble
   *   4: minutes low nibble
   *   5: minutes high nibble
   *   6: hours low nibble
   *   7: hours high nibble + frame rate (bity 5-6)
   */
  feedQuarterFrame(dataByte: number): void {
    const fieldIndex = (dataByte >> 4) & 0x07;
    const nibble = dataByte & 0x0F;

    this.qfData[fieldIndex] = nibble;

    // Sprawdź czy sekwencja jest ciągła (forward: 0→1→2→...→7)
    if (fieldIndex === 0) {
      // Początek nowej sekwencji
      this.qfCount = 1;
    } else if (fieldIndex === this.lastQfIndex + 1) {
      this.qfCount++;
    } else {
      // Przerwa w sekwencji — resetuj
      this.qfCount = 1;
    }

    this.lastQfIndex = fieldIndex;

    // Po zebraniu pełnych 8 QF (pola 0-7) — dekoduj TC
    if (this.qfCount >= 8 && fieldIndex === 7) {
      this._decodeFullTc();
    }
  }

  /**
   * Podaje pełną wiadomość MTC Full Frame (SysEx F0 7F 7F 01 01 ...).
   * Format: F0 7F 7F 01 01 hr mn sc fr F7
   * hr zawiera frame rate w bitach 5-6.
   */
  feedFullFrame(hr: number, mn: number, sc: number, fr: number): void {
    const rateCode = (hr >> 5) & 0x03;
    const frameRate = FRAME_RATE_TABLE[rateCode] ?? 30;
    const hours = hr & 0x1F;

    const tc: MtcTimecode = {
      hours,
      minutes: mn & 0x3F,
      seconds: sc & 0x3F,
      frames: fr & 0x1F,
      frameRate,
    };

    const totalFrames = this._tcToFrames(tc);
    if (this.onTimecode) {
      this.onTimecode(tc, totalFrames);
    }
  }

  /** Reset stanu parsera */
  reset(): void {
    this.qfData = [0, 0, 0, 0, 0, 0, 0, 0];
    this.lastQfIndex = -1;
    this.qfCount = 0;
  }

  /** Konwertuje TC na łańcuch HH:MM:SS:FF */
  static formatTc(tc: MtcTimecode): string {
    const h = String(tc.hours).padStart(2, '0');
    const m = String(tc.minutes).padStart(2, '0');
    const s = String(tc.seconds).padStart(2, '0');
    const f = String(tc.frames).padStart(2, '0');
    return `${h}:${m}:${s}:${f}`;
  }

  // ── Prywatne ────────────────────────────────────────────

  private _decodeFullTc(): void {
    // Składanie pełnych wartości z nibbles
    const frames = (this.qfData[0]!) | ((this.qfData[1]! & 0x01) << 4);
    const seconds = (this.qfData[2]!) | ((this.qfData[3]! & 0x03) << 4);
    const minutes = (this.qfData[4]!) | ((this.qfData[5]! & 0x03) << 4);
    const hoursLow = this.qfData[6]!;
    const hoursHigh = this.qfData[7]!;
    const hours = hoursLow | ((hoursHigh & 0x01) << 4);

    // Frame rate z bitów 1-2 pola 7
    const rateCode = (hoursHigh >> 1) & 0x03;
    const frameRate = FRAME_RATE_TABLE[rateCode] ?? 30;

    const tc: MtcTimecode = { hours, minutes, seconds, frames, frameRate };
    const totalFrames = this._tcToFrames(tc);

    // Wyzeruj count żeby nie emitować powtórnie
    this.qfCount = 0;

    if (this.onTimecode) {
      this.onTimecode(tc, totalFrames);
    }
  }

  /** Konwertuje timecode na liczbę klatek (linear frame count) */
  private _tcToFrames(tc: MtcTimecode): number {
    // Dla 29.97 drop-frame: pomijamy klatki 0 i 1 na początku każdej minuty,
    // z wyjątkiem co 10 minut. Ale dla uproszczenia liczymy liniowo.
    const nominalFps = tc.frameRate === 29.97 ? 30 : tc.frameRate;
    return tc.hours * 3600 * nominalFps
      + tc.minutes * 60 * nominalFps
      + tc.seconds * nominalFps
      + tc.frames;
  }
}
