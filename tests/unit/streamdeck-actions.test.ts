import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { executeAction, ACTION_CATALOG } from '../../electron/streamdeck/streamdeck-actions';
import type { StreamDeckButtonConfig, ActionContext } from '../../electron/streamdeck/streamdeck-actions';

// ── Mock engine i senderManager ─────────────────────────

function createMockEngine() {
  const engine = new EventEmitter() as EventEmitter & {
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    next: ReturnType<typeof vi.fn>;
    prev: ReturnType<typeof vi.fn>;
    goto: ReturnType<typeof vi.fn>;
    stepToNextCue: ReturnType<typeof vi.fn>;
    takeNextShot: ReturnType<typeof vi.fn>;
    toggleHoldMode: ReturnType<typeof vi.fn>;
    toggleStepMode: ReturnType<typeof vi.fn>;
    buildTimesnap: ReturnType<typeof vi.fn>;
    getState: ReturnType<typeof vi.fn>;
  };
  engine.play = vi.fn();
  engine.pause = vi.fn();
  engine.next = vi.fn();
  engine.prev = vi.fn();
  engine.goto = vi.fn();
  engine.stepToNextCue = vi.fn();
  engine.takeNextShot = vi.fn();
  engine.toggleHoldMode = vi.fn();
  engine.toggleStepMode = vi.fn();
  engine.buildTimesnap = vi.fn().mockReturnValue(null);
  engine.getState = vi.fn().mockReturnValue(null);
  return engine;
}

function createMockSenderManager() {
  return {
    atem: {
      performCut: vi.fn(),
      setPreview: vi.fn(),
      performMix: vi.fn(),
      setDownstreamKey: vi.fn(),
      runMacro: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ connected: true, programInput: 1, previewInput: 2 }),
    },
    obs: {
      setScene: vi.fn().mockResolvedValue(undefined),
      setPreviewScene: vi.fn().mockResolvedValue(undefined),
      triggerTransition: vi.fn().mockResolvedValue(undefined),
    },
    vmix: {
      cut: vi.fn().mockResolvedValue(undefined),
      fade: vi.fn().mockResolvedValue(undefined),
      setPreview: vi.fn().mockResolvedValue(undefined),
      resumePlayback: vi.fn().mockResolvedValue(undefined),
      pausePlayback: vi.fn().mockResolvedValue(undefined),
      nextInput: vi.fn().mockResolvedValue(undefined),
      prevInput: vi.fn().mockResolvedValue(undefined),
    },
    ptz: {
      recallPreset: vi.fn().mockResolvedValue(undefined),
    },
    visionRouter: {},
  } as unknown as ActionContext['senderManager'];
}

function createMockSettingsManager(targetSwitcher: 'atem' | 'obs' | 'vmix' | 'none' = 'atem') {
  return {
    getSection: vi.fn().mockReturnValue({ targetSwitcher }),
  } as unknown as ActionContext['settingsManager'];
}

// ── Testy ───────────────────────────────────────────────

describe('StreamDeck Actions', () => {
  let engine: ReturnType<typeof createMockEngine>;
  let senderManager: ReturnType<typeof createMockSenderManager>;
  let context: ActionContext;

  beforeEach(() => {
    engine = createMockEngine();
    senderManager = createMockSenderManager();
    context = { engine: engine as unknown as ActionContext['engine'], senderManager, settingsManager: createMockSettingsManager('atem') };
  });

  it('ACTION_CATALOG zawiera wszystkie zdefiniowane typy akcji', () => {
    expect(ACTION_CATALOG.length).toBeGreaterThan(20);
    const types = ACTION_CATALOG.map(a => a.type);
    expect(types).toContain('play');
    expect(types).toContain('pause');
    expect(types).toContain('next');
    expect(types).toContain('prev');
    expect(types).toContain('cam_pgm');
    expect(types).toContain('page_nav');
    expect(types).toContain('none');
  });

  it('executeAction play wywołuje engine.play()', () => {
    const btn: StreamDeckButtonConfig = { action: 'play', label: 'Play' };
    executeAction(btn, context);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('executeAction pause wywołuje engine.pause()', () => {
    const btn: StreamDeckButtonConfig = { action: 'pause', label: 'Pauza' };
    executeAction(btn, context);
    expect(engine.pause).toHaveBeenCalledTimes(1);
  });

  it('executeAction next wywołuje engine.next()', () => {
    const btn: StreamDeckButtonConfig = { action: 'next', label: 'Następny' };
    executeAction(btn, context);
    expect(engine.next).toHaveBeenCalledTimes(1);
  });

  it('executeAction prev wywołuje engine.prev()', () => {
    const btn: StreamDeckButtonConfig = { action: 'prev', label: 'Poprzedni' };
    executeAction(btn, context);
    expect(engine.prev).toHaveBeenCalledTimes(1);
  });

  it('executeAction cam_pgm wywołuje atem.performCut z numerem kamery', () => {
    const btn: StreamDeckButtonConfig = { action: 'cam_pgm', label: 'CAM 3', params: { camera: 3 } };
    executeAction(btn, context);
    expect(senderManager.atem.performCut).toHaveBeenCalledWith(3);
  });

  it('executeAction page_nav wywołuje onPageChange callback', () => {
    const onPageChange = vi.fn();
    const ctx: ActionContext = { ...context, onPageChange };
    const btn: StreamDeckButtonConfig = { action: 'page_nav', label: 'Strona →', params: { page: 2 } };
    executeAction(btn, ctx);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('executeAction none nie wywołuje żadnej metody', () => {
    const btn: StreamDeckButtonConfig = { action: 'none', label: '' };
    executeAction(btn, context);
    expect(engine.play).not.toHaveBeenCalled();
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.next).not.toHaveBeenCalled();
  });

  it('executeAction goto wywołuje engine.goto z cueId', () => {
    const btn: StreamDeckButtonConfig = { action: 'goto', label: 'Goto', params: { cueId: 'abc-123' } };
    executeAction(btn, context);
    expect(engine.goto).toHaveBeenCalledWith('abc-123');
  });
});
