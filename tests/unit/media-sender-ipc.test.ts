import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { MediaSender } from '../../electron/senders/media-sender';
import { MediaIpcBridge } from '../../electron/media/media-ipc';
import type { MediaFeedback, MediaCommand } from '../../electron/media/media-ipc';

describe('MediaSender z IPC Bridge (Faza 24)', () => {
  let sender: MediaSender;
  let bridge: MediaIpcBridge;
  let engine: EventEmitter;
  let sentCommands: MediaCommand[];

  beforeEach(() => {
    sender = new MediaSender({ enabled: true });
    bridge = new MediaIpcBridge();
    engine = new EventEmitter();
    sentCommands = [];

    // Mock: przechwytuj komendy wysyłane przez bridge
    const mockSend = vi.fn((_channel: string, cmd: MediaCommand) => {
      sentCommands.push(cmd);
    });
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: mockSend },
    } as unknown as import('electron').BrowserWindow;
    bridge.setMainWindow(mockWindow);

    // Podłącz bridge do sendera
    sender.setIpcBridge(bridge);
    sender.attach(engine);
  });

  afterEach(() => {
    sender.destroy();
    bridge.destroy();
  });

  // ── Trigger → IPC play ─────────────────────────────────

  it('powinno wysłać komendę play przez IPC po triggerze', () => {
    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3', volume: 75, loop: true },
    });

    expect(sentCommands).toHaveLength(1);
    expect(sentCommands[0]).toEqual({
      type: 'play',
      filePath: '/audio/bgm.mp3',
      volume: 75,
      loop: true,
      cueId: 'cue-1',
    });
  });

  // ── Stop → IPC stop ────────────────────────────────────

  it('powinno wysłać komendę stop przez IPC', () => {
    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });
    sentCommands.length = 0; // reset

    sender.stop();

    expect(sentCommands).toHaveLength(1);
    expect(sentCommands[0]).toEqual({ type: 'stop' });
  });

  // ── Pause / Resume → IPC ───────────────────────────────

  it('powinno wysłać komendę pause przez IPC', () => {
    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });
    sentCommands.length = 0;

    sender.pause();

    expect(sentCommands).toHaveLength(1);
    expect(sentCommands[0]).toEqual({ type: 'pause' });
  });

  it('powinno wysłać komendę resume przez IPC', () => {
    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });
    sender.pause();
    sentCommands.length = 0;

    sender.resume();

    expect(sentCommands).toHaveLength(1);
    expect(sentCommands[0]).toEqual({ type: 'resume' });
  });

  // ── Volume → IPC ───────────────────────────────────────

  it('powinno wysłać komendę volume przez IPC', () => {
    sender.setVolume(42);

    expect(sentCommands).toHaveLength(1);
    expect(sentCommands[0]).toEqual({ type: 'volume', volume: 42 });
  });

  // ── Seek → IPC ─────────────────────────────────────────

  it('powinno wysłać komendę seek przez IPC', () => {
    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });
    sentCommands.length = 0;

    sender.seek(30.5);

    expect(sentCommands).toHaveLength(1);
    expect(sentCommands[0]).toEqual({ type: 'seek', timeSec: 30.5 });
  });

  it('nie powinno seekować gdy brak aktywnego pliku', () => {
    sender.seek(10);
    expect(sentCommands).toHaveLength(0);
  });

  // ── Feedback z renderera ────────────────────────────────

  it('powinno aktualizować stan po feedback z renderera', () => {
    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });

    const feedback: MediaFeedback = {
      fileName: 'bgm.mp3',
      currentTimeSec: 15.5,
      durationSec: 120,
      isPlaying: true,
      ended: false,
      volume: 80,
    };

    // Symuluj feedback z bridge
    bridge.emit('feedback', feedback);

    const status = sender.getStatus();
    expect(status.currentTimeSec).toBe(15.5);
    expect(status.durationSec).toBe(120);
    expect(status.fileName).toBe('bgm.mp3');
    expect(status.volume).toBe(80);
  });

  it('powinno wyczyścić stan gdy feedback sygnalizuje ended', () => {
    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });

    const feedback: MediaFeedback = {
      fileName: 'bgm.mp3',
      currentTimeSec: 120,
      durationSec: 120,
      isPlaying: false,
      ended: true,
      volume: 80,
    };

    bridge.emit('feedback', feedback);

    const status = sender.getStatus();
    expect(status.playing).toBe(false);
    expect(status.currentFile).toBeNull();
  });

  // ── cue-exited → IPC stop ──────────────────────────────

  it('powinno wysłać stop przez IPC gdy media cue opuszcza zakres', () => {
    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });
    sentCommands.length = 0;

    engine.emit('cue-exited', { id: 'cue-1', type: 'media', data: {} });

    expect(sentCommands).toHaveLength(1);
    expect(sentCommands[0]).toEqual({ type: 'stop' });
  });

  // ── Bez bridge (fallback) ──────────────────────────────

  it('powinno działać bez crashu gdy brak bridge', () => {
    const senderNoBridge = new MediaSender({ enabled: true });

    expect(() => {
      senderNoBridge.handleTrigger({
        id: 'cue-1', type: 'media',
        data: { file_path: '/audio/bgm.mp3' },
      });
      senderNoBridge.stop();
      senderNoBridge.setVolume(50);
    }).not.toThrow();

    senderNoBridge.destroy();
  });

  // ── Rozszerzony status ─────────────────────────────────

  it('powinno zwracać rozszerzony status z currentTimeSec i durationSec', () => {
    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3', volume: 90 },
    });

    const status = sender.getStatus();
    expect(status).toHaveProperty('playing', true);
    expect(status).toHaveProperty('currentFile', '/audio/bgm.mp3');
    expect(status).toHaveProperty('volume', 90);
    expect(status).toHaveProperty('currentTimeSec', 0);
    expect(status).toHaveProperty('durationSec', 0);
    expect(status).toHaveProperty('fileName', 'bgm.mp3');
  });

  // ── fileName extraction ────────────────────────────────

  it('powinno wyciągnąć nazwę pliku ze ścieżki (backslash Windows)', () => {
    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: 'C:\\Users\\test\\music\\song.mp3' },
    });

    const status = sender.getStatus();
    expect(status.fileName).toBe('song.mp3');
  });

  it('powinno wyciągnąć nazwę pliku ze ścieżki (forward slash)', () => {
    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: '/home/user/music/song.wav' },
    });

    const status = sender.getStatus();
    expect(status.fileName).toBe('song.wav');
  });
});
