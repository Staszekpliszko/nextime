import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaIpcBridge } from '../../electron/media/media-ipc';
import type { MediaFeedback, MediaCommand } from '../../electron/media/media-ipc';

describe('MediaIpcBridge (Faza 24)', () => {
  let bridge: MediaIpcBridge;

  beforeEach(() => {
    bridge = new MediaIpcBridge();
  });

  afterEach(() => {
    bridge.destroy();
  });

  // ── sendCommand ─────────────────────────────────────────

  it('powinno wysłać komendę do mainWindow przez webContents.send', () => {
    const mockSend = vi.fn();
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: mockSend },
    } as unknown as import('electron').BrowserWindow;

    bridge.setMainWindow(mockWindow);

    const cmd: MediaCommand = {
      type: 'play',
      filePath: '/test/audio.mp3',
      volume: 80,
      loop: false,
      cueId: 'cue-1',
    };
    bridge.sendCommand(cmd);

    expect(mockSend).toHaveBeenCalledWith('media:command', cmd);
  });

  it('nie powinno crashować gdy brak mainWindow', () => {
    expect(() => {
      bridge.sendCommand({ type: 'stop' });
    }).not.toThrow();
  });

  it('nie powinno wysyłać gdy okno jest zniszczone', () => {
    const mockSend = vi.fn();
    const mockWindow = {
      isDestroyed: () => true,
      webContents: { send: mockSend },
    } as unknown as import('electron').BrowserWindow;

    bridge.setMainWindow(mockWindow);
    bridge.sendCommand({ type: 'stop' });

    expect(mockSend).not.toHaveBeenCalled();
  });

  // ── handleFeedback ──────────────────────────────────────

  it('powinno emitować event "feedback" po handleFeedback', () => {
    const spy = vi.fn();
    bridge.on('feedback', spy);

    const feedback: MediaFeedback = {
      fileName: 'test.mp3',
      currentTimeSec: 10,
      durationSec: 120,
      isPlaying: true,
      ended: false,
      volume: 80,
    };

    bridge.handleFeedback(feedback);

    expect(spy).toHaveBeenCalledWith(feedback);
  });

  // ── registerIpcHandlers ─────────────────────────────────

  it('powinno rejestrować IPC handler "media:feedback"', () => {
    const mockOn = vi.fn();
    const mockIpcMain = { on: mockOn } as unknown as import('electron').IpcMain;

    bridge.registerIpcHandlers(mockIpcMain);

    expect(mockOn).toHaveBeenCalledWith('media:feedback', expect.any(Function));
  });

  it('powinno wywołać handleFeedback gdy IPC handler odbierze feedback', () => {
    const spy = vi.fn();
    bridge.on('feedback', spy);

    let registeredHandler: ((_event: unknown, feedback: MediaFeedback) => void) | null = null;
    const mockIpcMain = {
      on: (_channel: string, handler: (_event: unknown, feedback: MediaFeedback) => void) => {
        registeredHandler = handler;
      },
    } as unknown as import('electron').IpcMain;

    bridge.registerIpcHandlers(mockIpcMain);
    expect(registeredHandler).not.toBeNull();

    const feedback: MediaFeedback = {
      fileName: 'music.mp3',
      currentTimeSec: 5,
      durationSec: 200,
      isPlaying: true,
      ended: false,
      volume: 50,
    };

    registeredHandler!({}, feedback);
    expect(spy).toHaveBeenCalledWith(feedback);
  });

  // ── destroy ─────────────────────────────────────────────

  it('powinno wyczyścić mainWindow i listenery po destroy', () => {
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    } as unknown as import('electron').BrowserWindow;

    bridge.setMainWindow(mockWindow);
    bridge.destroy();

    // Po destroy — sendCommand nie powinno wysyłać
    bridge.sendCommand({ type: 'stop' });
    expect(mockWindow.webContents.send).not.toHaveBeenCalled();
  });
});
