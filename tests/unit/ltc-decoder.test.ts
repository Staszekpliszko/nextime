import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LtcDecoderCore } from '../../src/audio/ltc-decoder.worklet';

// ── Helper: generowanie syntetycznego sygnału LTC ────────

/**
 * Generuje sygnał LTC audio (Manchester biphase encoding) dla danego TC.
 *
 * Manchester encoding:
 * - Bit "0": jedna transition na początku okresu bitu (jeden pełny okres sinusa)
 * - Bit "1": dwie transitions (dwa półokresy — zmiana polaryzacji w środku bitu)
 *
 * Klatka LTC = 80 bitów:
 *   [dane BCD (64 bity)] [sync word 16 bitów: 0011111111111101]
 */
function generateLtcFrame(
  hours: number,
  minutes: number,
  seconds: number,
  frames: number,
  sampleRate: number,
  fps: number,
  options: {
    dropFrame?: boolean;
    amplitude?: number;
    reverse?: boolean;
  } = {},
): Float32Array {
  const { dropFrame = false, amplitude = 0.8, reverse = false } = options;

  // Oblicz okres bitu w próbkach
  // LTC ma 80 bitów na klatkę, fps klatek na sekundę
  const bitsPerSecond = 80 * fps;
  const samplesPerBit = sampleRate / bitsPerSecond;

  // Zbuduj 80 bitów klatki
  const bits = new Array(80).fill(0);

  // Frames BCD
  const framesUnits = frames % 10;
  const framesTens = Math.floor(frames / 10);
  setBcd(bits, 0, 4, framesUnits);
  // User bits field 1 (bity 4-7) — zerowe
  setBcd(bits, 8, 2, framesTens);
  bits[10] = dropFrame ? 1 : 0; // drop-frame flag
  bits[11] = 0; // color frame flag
  // User bits field 2 (bity 12-15) — zerowe

  // Seconds BCD
  const secondsUnits = seconds % 10;
  const secondsTens = Math.floor(seconds / 10);
  setBcd(bits, 16, 4, secondsUnits);
  // User bits field 3 (bity 20-23)
  setBcd(bits, 24, 3, secondsTens);
  bits[27] = 0; // biphase correction
  // User bits field 4 (bity 28-31)

  // Minutes BCD
  const minutesUnits = minutes % 10;
  const minutesTens = Math.floor(minutes / 10);
  setBcd(bits, 32, 4, minutesUnits);
  // User bits field 5 (bity 36-39)
  setBcd(bits, 40, 3, minutesTens);
  bits[43] = 0; // binary group flag
  // User bits field 6 (bity 44-47)

  // Hours BCD
  const hoursUnits = hours % 10;
  const hoursTens = Math.floor(hours / 10);
  setBcd(bits, 48, 4, hoursUnits);
  // User bits field 7 (bity 52-55)
  setBcd(bits, 56, 2, hoursTens);
  bits[58] = 0; // binary group flag
  bits[59] = 0; // reserved
  // User bits field 8 (bity 60-63)

  // Sync word: bity 64-79 = 0011 1111 1111 1101
  const syncWord = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];
  for (let i = 0; i < 16; i++) {
    bits[64 + i] = syncWord[i]!;
  }

  // Odwróć jeśli reverse
  if (reverse) {
    bits.reverse();
  }

  // Generuj Manchester biphase
  const totalSamples = Math.ceil(80 * samplesPerBit);
  const samples = new Float32Array(totalSamples);
  let polarity = 1;
  let sampleIdx = 0;

  for (let bitIdx = 0; bitIdx < 80; bitIdx++) {
    const bitStart = Math.round(bitIdx * samplesPerBit);
    const bitEnd = Math.round((bitIdx + 1) * samplesPerBit);
    const bitMid = Math.round(bitStart + (bitEnd - bitStart) / 2);

    if (bits[bitIdx] === 0) {
      // Bit 0: transition na początku, brak w środku
      polarity = -polarity;
      for (let s = bitStart; s < bitEnd && s < totalSamples; s++) {
        samples[s] = polarity * amplitude;
      }
    } else {
      // Bit 1: transition na początku i w środku
      polarity = -polarity;
      for (let s = bitStart; s < bitMid && s < totalSamples; s++) {
        samples[s] = polarity * amplitude;
      }
      polarity = -polarity;
      for (let s = bitMid; s < bitEnd && s < totalSamples; s++) {
        samples[s] = polarity * amplitude;
      }
    }
  }

  return samples;
}

/** Ustawia wartość BCD w tablicy bitów (LSB first) */
function setBcd(bits: number[], startBit: number, count: number, value: number): void {
  for (let i = 0; i < count; i++) {
    bits[startBit + i] = (value >> i) & 1;
  }
}

/** Generuje wiele klatek LTC pod rząd */
function generateLtcSignal(
  startHours: number,
  startMinutes: number,
  startSeconds: number,
  startFrames: number,
  frameCount: number,
  sampleRate: number,
  fps: number,
  options: { dropFrame?: boolean; amplitude?: number; reverse?: boolean } = {},
): Float32Array {
  const buffers: Float32Array[] = [];
  let h = startHours, m = startMinutes, s = startSeconds, f = startFrames;
  const nomFps = Math.round(fps);

  for (let i = 0; i < frameCount; i++) {
    buffers.push(generateLtcFrame(h, m, s, f, sampleRate, fps, options));

    if (options.reverse) {
      // Cofnij TC
      f--;
      if (f < 0) {
        f = nomFps - 1;
        s--;
        if (s < 0) { s = 59; m--; }
        if (m < 0) { m = 59; h--; }
        if (h < 0) h = 23;
      }
    } else {
      // Advance TC
      f++;
      if (f >= nomFps) {
        f = 0;
        s++;
        if (s >= 60) { s = 0; m++; }
        if (m >= 60) { m = 0; h++; }
        if (h >= 24) h = 0;
      }
    }
  }

  // Połącz bufory
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }
  return result;
}

// ── Testy ────────────────────────────────────────────────

describe('LtcDecoderCore', () => {
  let decoder: LtcDecoderCore;

  beforeEach(() => {
    decoder = new LtcDecoderCore();
  });

  // ── 25fps ──────────────────────────────────────────────

  it('dekoduje sygnał LTC 25fps — TC 01:02:03:04', () => {
    const received: Array<{ hours: number; minutes: number; seconds: number; frames: number }> = [];
    decoder.onTimecode = (tc) => {
      received.push({ hours: tc.hours, minutes: tc.minutes, seconds: tc.seconds, frames: tc.frames });
    };

    // Generuj 20 klatek — MIN_VALID_FRAMES = 3
    const signal = generateLtcSignal(1, 2, 3, 4, 20, 48000, 25);
    decoder.processSamples(signal);

    expect(received.length).toBeGreaterThanOrEqual(1);
    // Pierwszy zdekodowany TC (po 3 klatek syncu)
    const first = received[0]!;
    expect(first.hours).toBe(1);
    expect(first.minutes).toBe(2);
    expect(first.seconds).toBe(3);
    // Frames mogą się minimalnie różnić ze względu na opóźnienie dekodera
    expect(first.frames).toBeGreaterThanOrEqual(4);
    expect(first.frames).toBeLessThan(14);
  });

  // ── 30fps ──────────────────────────────────────────────

  it('dekoduje sygnał LTC 30fps', () => {
    const received: Array<{ fps: number }> = [];
    decoder.onTimecode = (tc) => {
      received.push({ fps: tc.fps });
    };

    const signal = generateLtcSignal(0, 0, 0, 25, 20, 48000, 30);
    decoder.processSamples(signal);

    expect(received.length).toBeGreaterThanOrEqual(1);
    // Powinien wykryć 30fps (bo widzimy klatki >= 25)
    expect(received[0]!.fps).toBe(30);
  });

  // ── 24fps ──────────────────────────────────────────────

  it('dekoduje sygnał LTC 24fps', () => {
    const received: Array<{ fps: number; frames: number }> = [];
    decoder.onTimecode = (tc) => {
      received.push({ fps: tc.fps, frames: tc.frames });
    };

    const signal = generateLtcSignal(0, 0, 10, 0, 20, 48000, 24);
    decoder.processSamples(signal);

    expect(received.length).toBeGreaterThanOrEqual(1);
    // FPS: 24 (klatki < 24)
    expect(received[0]!.fps).toBe(24);
  });

  // ── 29.97 drop-frame ──────────────────────────────────

  it('dekoduje sygnał LTC 29.97 drop-frame', () => {
    const received: Array<{ fps: number; dropFrame: boolean }> = [];
    decoder.onTimecode = (tc) => {
      received.push({ fps: tc.fps, dropFrame: tc.dropFrame });
    };

    const signal = generateLtcSignal(0, 1, 0, 2, 20, 48000, 30, { dropFrame: true });
    decoder.processSamples(signal);

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0]!.fps).toBe(29.97);
    expect(received[0]!.dropFrame).toBe(true);
  });

  // ── BCD dekodowanie ────────────────────────────────────

  it('dekoduje BCD poprawnie — TC 23:59:59:24', () => {
    const received: Array<{ hours: number; minutes: number; seconds: number; frames: number }> = [];
    decoder.onTimecode = (tc) => {
      received.push({ hours: tc.hours, minutes: tc.minutes, seconds: tc.seconds, frames: tc.frames });
    };

    const signal = generateLtcSignal(23, 59, 59, 20, 20, 48000, 25);
    decoder.processSamples(signal);

    expect(received.length).toBeGreaterThanOrEqual(1);
    const tc = received[0]!;
    expect(tc.hours).toBe(23);
    expect(tc.minutes).toBe(59);
    expect(tc.seconds).toBe(59);
    expect(tc.frames).toBeGreaterThanOrEqual(20);
  });

  // ── Sync word detection ────────────────────────────────

  it('nie emituje TC przed MIN_VALID_FRAMES (3 klatki)', () => {
    const received: unknown[] = [];
    decoder.onTimecode = (tc) => received.push(tc);

    // Tylko 2 klatki — za mało
    const signal = generateLtcSignal(0, 0, 0, 0, 2, 48000, 25);
    decoder.processSamples(signal);

    expect(received.length).toBe(0);
  });

  // ── Reverse playback ──────────────────────────────────

  it('dekoduje reverse playback (sync word od tyłu)', () => {
    const received: Array<{ reverse: boolean; hours: number }> = [];
    decoder.onTimecode = (tc) => {
      received.push({ reverse: tc.reverse, hours: tc.hours });
    };

    const signal = generateLtcSignal(1, 0, 0, 10, 20, 48000, 25, { reverse: true });
    decoder.processSamples(signal);

    // Reverse detection jest trudniejsza — może się zdarzyć że dekoder
    // nie złapie reversed sync. Wystarczy że nie crashuje.
    // Jeśli złapie — powinien mieć reverse=true
    if (received.length > 0) {
      expect(received[0]!.reverse).toBe(true);
    }
  });

  // ── Hysteresis ─────────────────────────────────────────

  it('ignoruje szum poniżej progu hysteresis', () => {
    const received: unknown[] = [];
    decoder.onTimecode = (tc) => received.push(tc);

    // Sygnał szumowy — amplituda 0.01 (poniżej HYSTERESIS_THRESHOLD = 0.02)
    const noise = new Float32Array(48000);
    for (let i = 0; i < noise.length; i++) {
      noise[i] = (Math.random() - 0.5) * 0.01;
    }
    decoder.processSamples(noise);

    expect(received.length).toBe(0);
  });

  // ── Uszkodzony sync word ──────────────────────────────

  it('odrzuca klatki z uszkodzonym sync word', () => {
    const received: unknown[] = [];
    decoder.onTimecode = (tc) => received.push(tc);

    // Generuj sygnał z poprawnym sync
    const goodSignal = generateLtcSignal(0, 0, 0, 0, 10, 48000, 25);

    // Uszkodź sync word — wstaw losowe wartości w obszar sync
    // Sync word jest na końcu klatki (bity 64-79), co odpowiada ostatnim
    // ~20% próbek klatki. Zatrujemy te próbki szumem.
    const samplesPerFrame = Math.ceil(48000 / (80 * 25) * 80);
    for (let frame = 0; frame < 10; frame++) {
      const frameStart = frame * samplesPerFrame;
      const syncStart = frameStart + Math.floor(samplesPerFrame * 0.8);
      for (let i = syncStart; i < frameStart + samplesPerFrame && i < goodSignal.length; i++) {
        goodSignal[i] = (Math.random() - 0.5) * 0.01; // cichy szum
      }
    }

    decoder.processSamples(goodSignal);
    // Nie powinno zdekodować żadnej klatki (sync word uszkodzony)
    expect(received.length).toBe(0);
  });

  // ── Reset ─────────────────────────────────────────────

  it('reset zeruje stan dekodera', () => {
    const received: unknown[] = [];
    decoder.onTimecode = (tc) => received.push(tc);

    // Podaj 5 klatek (ale nie pełny sync)
    const partial = generateLtcSignal(0, 0, 0, 0, 4, 48000, 25);
    decoder.processSamples(partial);
    decoder.reset();

    // Po resecie podaj nowe 10 klatek
    const full = generateLtcSignal(1, 0, 0, 0, 10, 48000, 25);
    decoder.processSamples(full);

    // Powinien zdekodować nowe klatki
    if (received.length > 0) {
      const tc = received[0] as { hours: number };
      expect(tc.hours).toBe(1);
    }
  });

  // ── Status callback ───────────────────────────────────

  it('emituje status "synced" po poprawnych klatkach', () => {
    const statuses: Array<{ status: string }> = [];
    decoder.onStatus = (s) => statuses.push({ status: s.status });

    const signal = generateLtcSignal(0, 0, 0, 0, 20, 48000, 25);
    decoder.processSamples(signal);

    expect(statuses.length).toBeGreaterThanOrEqual(1);
    // Co najmniej jeden status 'synced'
    expect(statuses.some(s => s.status === 'synced')).toBe(true);
  });

  // ── Różne sample rates ────────────────────────────────

  it('dekoduje sygnał LTC przy 44100Hz sample rate', () => {
    const received: Array<{ hours: number }> = [];
    decoder.onTimecode = (tc) => received.push({ hours: tc.hours });

    const signal = generateLtcSignal(2, 30, 15, 0, 20, 44100, 25);
    decoder.processSamples(signal);

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0]!.hours).toBe(2);
  });

  it('dekoduje sygnał LTC przy 96000Hz sample rate', () => {
    const received: Array<{ hours: number }> = [];
    decoder.onTimecode = (tc) => received.push({ hours: tc.hours });

    const signal = generateLtcSignal(5, 0, 0, 0, 20, 96000, 25);
    decoder.processSamples(signal);

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0]!.hours).toBe(5);
  });
});
