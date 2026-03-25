import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LtcAudioBridge } from '../../src/audio/ltc-audio-bridge';

// ── Mock Web Audio API ──────────────────────────────────

class MockAnalyserNode {
  fftSize = 256;
  smoothingTimeConstant = 0.3;
  frequencyBinCount = 128;
  connect() { return this; }
  disconnect() {}
  getByteFrequencyData(arr: Uint8Array) {
    for (let i = 0; i < arr.length; i++) arr[i] = 0;
  }
}

class MockAudioWorkletNode {
  port = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    postMessage: vi.fn(),
  };
  connect() { return this; }
  disconnect() {}

  // Symuluje wiadomość z workleta
  simulateMessage(data: unknown) {
    if (this.port.onmessage) {
      this.port.onmessage(new MessageEvent('message', { data }));
    }
  }
}

class MockMediaStreamSource {
  connect() { return this; }
  disconnect() {}
}

class MockMediaStream {
  getTracks() { return [{ stop: vi.fn() }]; }
}

let mockWorkletNode: MockAudioWorkletNode;

class MockAudioContext {
  state = 'running';
  sampleRate = 48000;

  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  };

  createMediaStreamSource() { return new MockMediaStreamSource(); }
  createAnalyser() { return new MockAnalyserNode(); }

  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

// ── Setup globals ──────────────────────────────────────

function setupMocks() {
  mockWorkletNode = new MockAudioWorkletNode();

  // Globalne mock obiektów Web Audio
  const originalAudioContext = globalThis.AudioContext;
  const originalAudioWorkletNode = globalThis.AudioWorkletNode;
  const originalNavigator = globalThis.navigator;

  // @ts-expect-error — mock
  globalThis.AudioContext = MockAudioContext;
  // @ts-expect-error — mock
  globalThis.AudioWorkletNode = function() { return mockWorkletNode; };

  // Mock navigator.mediaDevices
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'device-1', label: 'Mikrofon wbudowany' },
          { kind: 'audioinput', deviceId: 'device-2', label: 'Focusrite Scarlett 2i2' },
          { kind: 'videoinput', deviceId: 'cam-1', label: 'Kamera' },
        ]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    },
    writable: true,
    configurable: true,
  });

  // Mock window.nextime
  Object.defineProperty(globalThis, 'window', {
    value: {
      nextime: {
        feedLtcAudio: vi.fn(),
      },
    },
    writable: true,
    configurable: true,
  });

  return () => {
    globalThis.AudioContext = originalAudioContext;
    globalThis.AudioWorkletNode = originalAudioWorkletNode;
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, writable: true, configurable: true });
  };
}

// ── Testy ────────────────────────────────────────────────

describe('LtcAudioBridge', () => {
  let bridge: LtcAudioBridge;
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = setupMocks();
    bridge = new LtcAudioBridge();
  });

  afterEach(async () => {
    await bridge.stop();
    cleanup();
  });

  // ── listAudioInputs ──────────────────────────────────

  it('listAudioInputs zwraca tylko urządzenia audioinput', async () => {
    const inputs = await bridge.listAudioInputs();
    expect(inputs).toHaveLength(2);
    expect(inputs[0]!.deviceId).toBe('device-1');
    expect(inputs[0]!.label).toBe('Mikrofon wbudowany');
    expect(inputs[1]!.deviceId).toBe('device-2');
  });

  // ── start / stop lifecycle ────────────────────────────

  it('start uruchamia AudioContext i getUserMedia', async () => {
    const result = await bridge.start('device-1');
    expect(result.ok).toBe(true);
    expect(bridge.isRunning()).toBe(true);
  });

  it('stop zatrzymuje i czyści stan', async () => {
    await bridge.start();
    expect(bridge.isRunning()).toBe(true);

    await bridge.stop();
    expect(bridge.isRunning()).toBe(false);

    const status = bridge.getStatus();
    expect(status.running).toBe(false);
    expect(status.signalStatus).toBe('none');
  });

  it('podwójny start zatrzymuje poprzedni', async () => {
    await bridge.start('device-1');
    const result = await bridge.start('device-2');
    expect(result.ok).toBe(true);
    expect(bridge.isRunning()).toBe(true);
  });

  // ── Status ────────────────────────────────────────────

  it('getStatus zwraca poprawny stan początkowy', () => {
    const status = bridge.getStatus();
    expect(status.running).toBe(false);
    expect(status.deviceId).toBeNull();
    expect(status.lastTcFormatted).toBeNull();
    expect(status.fps).toBeNull();
    expect(status.signalStatus).toBe('none');
    expect(status.peakLevel).toBe(0);
  });

  // ── Timecode message handling ─────────────────────────

  it('obsługuje wiadomość timecode z workleta', async () => {
    const received: number[] = [];
    bridge.onTimecodeReceived = (frames) => received.push(frames);

    await bridge.start();

    // Symuluj wiadomość z workleta
    mockWorkletNode.simulateMessage({
      type: 'timecode',
      hours: 1, minutes: 2, seconds: 3, frames: 4,
      fps: 25,
      dropFrame: false,
    });

    expect(received).toHaveLength(1);
    // 1*3600*25 + 2*60*25 + 3*25 + 4 = 90000 + 3000 + 75 + 4 = 93079
    expect(received[0]).toBe(93079);

    const status = bridge.getStatus();
    expect(status.lastTcFormatted).toBe('01:02:03:04');
    expect(status.fps).toBe(25);
  });

  // ── Debounce ──────────────────────────────────────────

  it('nie wysyła duplikatów TC (debounce)', async () => {
    const received: number[] = [];
    bridge.onTimecodeReceived = (frames) => received.push(frames);

    await bridge.start();

    const tcMsg = {
      type: 'timecode',
      hours: 0, minutes: 0, seconds: 0, frames: 10,
      fps: 25, dropFrame: false,
    };

    // Wyślij ten sam TC 3 razy
    mockWorkletNode.simulateMessage(tcMsg);
    mockWorkletNode.simulateMessage(tcMsg);
    mockWorkletNode.simulateMessage(tcMsg);

    // Powinien być wysłany tylko raz
    expect(received).toHaveLength(1);
  });

  it('wysyła różne TC (nie debounce)', async () => {
    const received: number[] = [];
    bridge.onTimecodeReceived = (frames) => received.push(frames);

    await bridge.start();

    mockWorkletNode.simulateMessage({
      type: 'timecode',
      hours: 0, minutes: 0, seconds: 0, frames: 10,
      fps: 25, dropFrame: false,
    });
    mockWorkletNode.simulateMessage({
      type: 'timecode',
      hours: 0, minutes: 0, seconds: 0, frames: 11,
      fps: 25, dropFrame: false,
    });

    expect(received).toHaveLength(2);
  });

  // ── Level message ─────────────────────────────────────

  it('obsługuje wiadomość level z workleta', async () => {
    await bridge.start();

    mockWorkletNode.simulateMessage({
      type: 'level',
      peak: 0.75,
    });

    const status = bridge.getStatus();
    expect(status.peakLevel).toBe(0.75);
  });

  // ── Status message ────────────────────────────────────

  it('obsługuje wiadomość status z workleta', async () => {
    const statuses: string[] = [];
    bridge.onStatusChanged = (s) => statuses.push(s.signalStatus);

    await bridge.start();

    mockWorkletNode.simulateMessage({
      type: 'status',
      status: 'synced',
      errorRate: 0.02,
    });

    expect(bridge.getStatus().signalStatus).toBe('synced');
    expect(bridge.getStatus().errorRate).toBe(0.02);
  });

  // ── getUserMedia constraints ──────────────────────────

  it('wywołuje getUserMedia z wyłączonymi efektami audio', async () => {
    await bridge.start('device-1');

    const getUserMedia = navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>;
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    const constraints = getUserMedia.mock.calls[0]![0] as MediaStreamConstraints;
    const audio = constraints.audio as MediaTrackConstraints;
    expect(audio.echoCancellation).toBe(false);
    expect(audio.noiseSuppression).toBe(false);
    expect(audio.autoGainControl).toBe(false);
    expect(constraints.video).toBe(false);
  });
});
