import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Electron ─────────────────────────────────────────────

// Kolekcja utworzonych okien — do weryfikacji w testach
const createdWindows: MockBrowserWindow[] = [];

class MockBrowserWindow {
  private _destroyed = false;
  private _fullscreen = false;
  private _listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  webContents = {
    on: vi.fn(),
    openDevTools: vi.fn(),
  };
  opts: Record<string, unknown>;

  constructor(opts: Record<string, unknown>) {
    this.opts = opts;
    createdWindows.push(this);
  }

  loadURL = vi.fn();
  loadFile = vi.fn();
  close = vi.fn(() => {
    const closedListeners = this._listeners['closed'] ?? [];
    for (const fn of closedListeners) fn();
  });
  destroy = vi.fn(() => { this._destroyed = true; });
  isDestroyed = vi.fn(() => this._destroyed);
  isFullScreen = vi.fn(() => this._fullscreen);
  setFullScreen = vi.fn((val: boolean) => { this._fullscreen = val; });

  on(event: string, fn: (...args: unknown[]) => void) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event]!.push(fn);
    return this;
  }
}

const mockDisplays = [
  {
    id: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    size: { width: 1920, height: 1080 },
  },
  {
    id: 2,
    bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
    size: { width: 2560, height: 1440 },
  },
];

vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation((opts: Record<string, unknown>) => new MockBrowserWindow(opts)),
  screen: {
    getAllDisplays: vi.fn(() => mockDisplays),
    getPrimaryDisplay: vi.fn(() => mockDisplays[0]),
  },
}));

// ── Testy ─────────────────────────────────────────────────────

import { WindowManager } from '../../electron/window-manager';

describe('WindowManager', () => {
  let wm: WindowManager;

  beforeEach(() => {
    createdWindows.length = 0;
    wm = new WindowManager('/fake/preload.js');
  });

  it('getAvailableDisplays — zwraca listę monitorów', () => {
    const displays = wm.getAvailableDisplays();
    expect(displays).toHaveLength(2);
    expect(displays[0]!.isPrimary).toBe(true);
    expect(displays[0]!.label).toContain('główny');
    expect(displays[1]!.isPrimary).toBe(false);
    expect(displays[1]!.width).toBe(2560);
  });

  it('createPrompterWindow — tworzy okno i zwraca windowId', () => {
    const id = wm.createPrompterWindow(3142, 'abc-token');
    expect(id).toMatch(/^prompter-/);
    expect(wm.hasOpenWindows()).toBe(true);
    expect(wm.getOpenWindows()).toHaveLength(1);
    expect(wm.getOpenWindows()[0]!.type).toBe('prompter');
  });

  it('createPrompterWindow — ładuje URL z shareToken', () => {
    wm.createPrompterWindow(3142, 'test-token-123');
    const instance = createdWindows[createdWindows.length - 1]!;
    expect(instance.loadURL).toHaveBeenCalledWith('http://localhost:3142/output/test-token-123');
  });

  it('createPrompterWindow — wybiera secondary monitor domyślnie', () => {
    wm.createPrompterWindow(3142, 'tok');
    const instance = createdWindows[createdWindows.length - 1]!;
    // Powinien być na secondary (x=1920)
    expect(instance.opts.x).toBe(1920);
  });

  it('createPrompterWindow — wybiera podany monitor', () => {
    wm.createPrompterWindow(3142, 'tok', 1); // primary id=1
    const instance = createdWindows[createdWindows.length - 1]!;
    expect(instance.opts.x).toBe(0);
  });

  it('createOutputWindow — tworzy okno output', () => {
    const id = wm.createOutputWindow(3142, 'out-token', 'Monitor reżysera');
    expect(id).toMatch(/^output-/);
    const windows = wm.getOpenWindows();
    expect(windows).toHaveLength(1);
    expect(windows[0]!.type).toBe('output');
    expect(windows[0]!.title).toBe('Monitor reżysera');
  });

  it('closeWindow — zamyka okno i usuwa z registry', () => {
    const id = wm.createPrompterWindow(3142, 'tok');
    expect(wm.hasOpenWindows()).toBe(true);
    const closed = wm.closeWindow(id);
    expect(closed).toBe(true);
    expect(wm.hasOpenWindows()).toBe(false);
  });

  it('closeWindow — zwraca false dla nieistniejącego ID', () => {
    const closed = wm.closeWindow('nonexistent-id');
    expect(closed).toBe(false);
  });

  it('closeAll — zamyka wszystkie okna', () => {
    wm.createPrompterWindow(3142, 'tok1');
    wm.createOutputWindow(3142, 'tok2', 'Out 1');
    wm.createOutputWindow(3142, 'tok3', 'Out 2');
    expect(wm.getOpenWindows()).toHaveLength(3);

    wm.closeAll();
    expect(wm.hasOpenWindows()).toBe(false);
    expect(wm.getOpenWindows()).toHaveLength(0);
  });
});
