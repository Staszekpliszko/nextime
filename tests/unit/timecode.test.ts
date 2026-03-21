import { describe, it, expect } from 'vitest';
import {
  framesToTimecode,
  timecodeToFrames,
  framesToMs,
  msToFrames,
  getRealFps,
  isDropFrame,
  framesToShortTimecode,
} from '../../src/utils/timecode';

describe('framesToTimecode', () => {
  it('konwertuje 0 klatek na 00:00:00:00', () => {
    expect(framesToTimecode(0, 25)).toBe('00:00:00:00');
  });

  it('konwertuje klatki na poprawny TC przy 25fps', () => {
    expect(framesToTimecode(25, 25)).toBe('00:00:01:00');
    expect(framesToTimecode(50, 25)).toBe('00:00:02:00');
    expect(framesToTimecode(12, 25)).toBe('00:00:00:12');
    expect(framesToTimecode(1500, 25)).toBe('00:01:00:00'); // 60s
    expect(framesToTimecode(90000, 25)).toBe('01:00:00:00'); // 1h
  });

  it('konwertuje przy 30fps', () => {
    expect(framesToTimecode(30, 30)).toBe('00:00:01:00');
    expect(framesToTimecode(1800, 30)).toBe('00:01:00:00');
  });

  it('konwertuje przy 24fps', () => {
    expect(framesToTimecode(24, 24)).toBe('00:00:01:00');
    expect(framesToTimecode(48, 24)).toBe('00:00:02:00');
  });

  it('konwertuje przy 50fps', () => {
    expect(framesToTimecode(50, 50)).toBe('00:00:01:00');
    expect(framesToTimecode(3000, 50)).toBe('00:01:00:00');
  });

  it('konwertuje przy 60fps', () => {
    expect(framesToTimecode(60, 60)).toBe('00:00:01:00');
  });

  it('używa separatora ; dla drop-frame 29.97fps', () => {
    const tc = framesToTimecode(0, 29);
    expect(tc).toContain(';');
  });

  it('ujemne klatki traktuje jako 0', () => {
    expect(framesToTimecode(-10, 25)).toBe('00:00:00:00');
  });
});

describe('timecodeToFrames', () => {
  it('parsuje 00:00:00:00 na 0', () => {
    expect(timecodeToFrames('00:00:00:00', 25)).toBe(0);
  });

  it('parsuje poprawnie przy 25fps', () => {
    expect(timecodeToFrames('00:00:01:00', 25)).toBe(25);
    expect(timecodeToFrames('00:01:00:00', 25)).toBe(1500);
    expect(timecodeToFrames('01:00:00:00', 25)).toBe(90000);
    expect(timecodeToFrames('00:00:00:12', 25)).toBe(12);
  });

  it('parsuje poprawnie przy 30fps', () => {
    expect(timecodeToFrames('00:00:01:00', 30)).toBe(30);
    expect(timecodeToFrames('00:01:00:00', 30)).toBe(1800);
  });

  it('jest odwrotna do framesToTimecode (non-drop-frame)', () => {
    for (const fps of [24, 25, 30, 50, 60] as const) {
      for (const frames of [0, 1, 24, 100, 1500, 90000]) {
        const tc = framesToTimecode(frames, fps);
        expect(timecodeToFrames(tc, fps)).toBe(frames);
      }
    }
  });

  it('obsługuje separator ; (drop-frame)', () => {
    // Ręczny TC z drop-frame separator
    const frames = timecodeToFrames('00:01:00;02', 29);
    expect(frames).toBeGreaterThan(0);
  });

  it('zwraca 0 dla niepoprawnego formatu', () => {
    expect(timecodeToFrames('invalid', 25)).toBe(0);
    expect(timecodeToFrames('00:00:00', 25)).toBe(0);
  });
});

describe('drop-frame roundtrip (29.97fps)', () => {
  it('konwertuje i parsuje z powrotem poprawnie', () => {
    // Dla drop-frame ważne wartości testowe
    const testFrames = [0, 1, 29, 30, 1798, 1800, 17982, 17984];
    for (const frames of testFrames) {
      const tc = framesToTimecode(frames, 29);
      const back = timecodeToFrames(tc, 29);
      expect(back).toBe(frames);
    }
  });
});

describe('framesToMs', () => {
  it('konwertuje klatki na ms przy 25fps', () => {
    expect(framesToMs(25, 25)).toBe(1000);
    expect(framesToMs(50, 25)).toBe(2000);
    expect(framesToMs(0, 25)).toBe(0);
  });

  it('konwertuje przy 30fps', () => {
    expect(framesToMs(30, 30)).toBe(1000);
  });

  it('konwertuje przy 29.97fps (przybliżone)', () => {
    const ms = framesToMs(30, 29);
    // 30 klatek @ 29.97fps = ~1001ms
    expect(ms).toBeGreaterThanOrEqual(1000);
    expect(ms).toBeLessThanOrEqual(1002);
  });
});

describe('msToFrames', () => {
  it('konwertuje ms na klatki przy 25fps', () => {
    expect(msToFrames(1000, 25)).toBe(25);
    expect(msToFrames(2000, 25)).toBe(50);
  });

  it('konwertuje ms na klatki przy 30fps', () => {
    expect(msToFrames(1000, 30)).toBe(30);
  });

  it('jest przybliżona odwrotność framesToMs', () => {
    for (const fps of [24, 25, 30, 50, 60] as const) {
      const frames = 100;
      const ms = framesToMs(frames, fps);
      expect(msToFrames(ms, fps)).toBe(frames);
    }
  });
});

describe('getRealFps', () => {
  it('zwraca dokładne FPS', () => {
    expect(getRealFps(24)).toBe(24);
    expect(getRealFps(25)).toBe(25);
    expect(getRealFps(30)).toBe(30);
    expect(getRealFps(50)).toBe(50);
    expect(getRealFps(60)).toBe(60);
  });

  it('zwraca 29.97 dla fps=29', () => {
    expect(getRealFps(29)).toBeCloseTo(29.97, 1);
  });

  it('zwraca 59.94 dla fps=59', () => {
    // fps=59 nie jest w naszym FPS type, ale getRealFps akceptuje go
    // W rzeczywistości obsługujemy to przez wewnętrzne mapowanie
    expect(getRealFps(59 as any)).toBeCloseTo(59.94, 1);
  });
});

describe('isDropFrame', () => {
  it('zwraca true dla 29 i 59', () => {
    expect(isDropFrame(29)).toBe(true);
    expect(isDropFrame(59 as any)).toBe(true);
  });

  it('zwraca false dla innych wartości', () => {
    expect(isDropFrame(24)).toBe(false);
    expect(isDropFrame(25)).toBe(false);
    expect(isDropFrame(30)).toBe(false);
    expect(isDropFrame(50)).toBe(false);
    expect(isDropFrame(60)).toBe(false);
  });
});

describe('framesToShortTimecode', () => {
  it('zwraca MM:SS format', () => {
    expect(framesToShortTimecode(0, 25)).toBe('00:00');
    expect(framesToShortTimecode(1500, 25)).toBe('01:00');
    expect(framesToShortTimecode(3750, 25)).toBe('02:30');
  });
});
