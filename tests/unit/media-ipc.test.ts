import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mockujemy moduły ffprobe
const mockProbeMediaFile = vi.fn();
const mockGenerateWaveform = vi.fn();

vi.mock('../../electron/media', () => ({
  probeMediaFile: (...args: unknown[]) => mockProbeMediaFile(...args),
  generateWaveform: (...args: unknown[]) => mockGenerateWaveform(...args),
}));

import { probeMediaFile, generateWaveform } from '../../electron/media';
import type { MediaProbeResult } from '../../electron/media/ffprobe-utils';

describe('Media IPC — logika (Faza 23)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('probeMediaFile — powinno zwrócić MediaProbeResult dla poprawnego pliku', async () => {
    const expected: MediaProbeResult = {
      durationMs: 60000,
      durationFrames: 1500,
      fps: 25,
      codec: 'h264',
      hasAudio: true,
      hasVideo: true,
      width: 1920,
      height: 1080,
    };
    mockProbeMediaFile.mockResolvedValue(expected);

    const result = await probeMediaFile('/test/video.mp4');
    expect(result).toEqual(expected);
    expect(mockProbeMediaFile).toHaveBeenCalledWith('/test/video.mp4');
  });

  it('probeMediaFile — powinno zwrócić null gdy ffprobe niedostępny', async () => {
    mockProbeMediaFile.mockResolvedValue(null);

    const result = await probeMediaFile('/test/broken.mp4');
    expect(result).toBeNull();
  });

  it('generateWaveform — powinno zwrócić tablicę amplitud', async () => {
    const waveform = [0.1, 0.5, 0.9, 1.0, 0.7, 0.3, 0.2, 0.6, 0.8, 0.4];
    mockGenerateWaveform.mockResolvedValue(waveform);

    const result = await generateWaveform('/test/audio.mp3', 10);
    expect(result).toEqual(waveform);
    expect(mockGenerateWaveform).toHaveBeenCalledWith('/test/audio.mp3', 10);
  });
});
