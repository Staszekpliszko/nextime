import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { executeAction } from '../../electron/streamdeck/streamdeck-actions';
import type { StreamDeckButtonConfig, ActionContext } from '../../electron/streamdeck/streamdeck-actions';

// ── Mock engine ─────────────────────────────────────────

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

// ── Mock senderManager z OBS i vMix ────────────────────

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

// ── Mock settingsManager ────────────────────────────────

function createMockSettingsManager(targetSwitcher: 'atem' | 'obs' | 'vmix' | 'none') {
  return {
    getSection: vi.fn().mockReturnValue({ targetSwitcher }),
  } as unknown as ActionContext['settingsManager'];
}

// ── Testy routingu switcher ─────────────────────────────

describe('StreamDeck Switcher Routing (Faza 37B)', () => {
  let engine: ReturnType<typeof createMockEngine>;
  let senderManager: ReturnType<typeof createMockSenderManager>;

  beforeEach(() => {
    engine = createMockEngine();
    senderManager = createMockSenderManager();
  });

  // ── cam_pgm routing ──────────────────────────────────

  it('cam_pgm → vmix.cut() gdy targetSwitcher=vmix', () => {
    const settings = createMockSettingsManager('vmix');
    const ctx: ActionContext = { engine: engine as unknown as ActionContext['engine'], senderManager, settingsManager: settings };
    const btn: StreamDeckButtonConfig = { action: 'cam_pgm', label: 'CAM 3', params: { camera: 3 } };
    executeAction(btn, ctx);
    expect(senderManager.vmix.cut).toHaveBeenCalledWith(3);
    expect(senderManager.atem.performCut).not.toHaveBeenCalled();
    expect(senderManager.obs.setScene).not.toHaveBeenCalled();
  });

  it('cam_pgm → obs.setScene() gdy targetSwitcher=obs', () => {
    const settings = createMockSettingsManager('obs');
    const ctx: ActionContext = { engine: engine as unknown as ActionContext['engine'], senderManager, settingsManager: settings };
    const btn: StreamDeckButtonConfig = { action: 'cam_pgm', label: 'CAM 2', params: { camera: 2 } };
    executeAction(btn, ctx);
    expect(senderManager.obs.setScene).toHaveBeenCalledWith('2');
    expect(senderManager.atem.performCut).not.toHaveBeenCalled();
    expect(senderManager.vmix.cut).not.toHaveBeenCalled();
  });

  it('cam_pgm → atem.performCut() gdy targetSwitcher=atem (regresja)', () => {
    const settings = createMockSettingsManager('atem');
    const ctx: ActionContext = { engine: engine as unknown as ActionContext['engine'], senderManager, settingsManager: settings };
    const btn: StreamDeckButtonConfig = { action: 'cam_pgm', label: 'CAM 1', params: { camera: 1 } };
    executeAction(btn, ctx);
    expect(senderManager.atem.performCut).toHaveBeenCalledWith(1);
    expect(senderManager.vmix.cut).not.toHaveBeenCalled();
    expect(senderManager.obs.setScene).not.toHaveBeenCalled();
  });

  // ── cam_pvw routing ──────────────────────────────────

  it('cam_pvw → vmix.setPreview() gdy targetSwitcher=vmix', () => {
    const settings = createMockSettingsManager('vmix');
    const ctx: ActionContext = { engine: engine as unknown as ActionContext['engine'], senderManager, settingsManager: settings };
    const btn: StreamDeckButtonConfig = { action: 'cam_pvw', label: 'PVW 2', params: { camera: 2 } };
    executeAction(btn, ctx);
    expect(senderManager.vmix.setPreview).toHaveBeenCalledWith(2);
    expect(senderManager.atem.setPreview).not.toHaveBeenCalled();
  });

  // ── play/pause → vMix routing ────────────────────────

  it('play → vmix.resumePlayback() gdy targetSwitcher=vmix', () => {
    const settings = createMockSettingsManager('vmix');
    const ctx: ActionContext = { engine: engine as unknown as ActionContext['engine'], senderManager, settingsManager: settings };
    const btn: StreamDeckButtonConfig = { action: 'play', label: 'Play' };
    executeAction(btn, ctx);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(senderManager.vmix.resumePlayback).toHaveBeenCalledTimes(1);
  });

  it('pause → vmix.pausePlayback() gdy targetSwitcher=vmix', () => {
    const settings = createMockSettingsManager('vmix');
    const ctx: ActionContext = { engine: engine as unknown as ActionContext['engine'], senderManager, settingsManager: settings };
    const btn: StreamDeckButtonConfig = { action: 'pause', label: 'Pauza' };
    executeAction(btn, ctx);
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(senderManager.vmix.pausePlayback).toHaveBeenCalledTimes(1);
  });

  // ── next/prev → vMix routing ─────────────────────────

  it('next → engine.next() + vmix.nextInput() gdy targetSwitcher=vmix', () => {
    const settings = createMockSettingsManager('vmix');
    const ctx: ActionContext = { engine: engine as unknown as ActionContext['engine'], senderManager, settingsManager: settings };
    const btn: StreamDeckButtonConfig = { action: 'next', label: 'Następny' };
    executeAction(btn, ctx);
    expect(engine.next).toHaveBeenCalledTimes(1);
    expect(senderManager.vmix.nextInput).toHaveBeenCalledTimes(1);
  });

  it('prev → engine.prev() + vmix.prevInput() gdy targetSwitcher=vmix', () => {
    const settings = createMockSettingsManager('vmix');
    const ctx: ActionContext = { engine: engine as unknown as ActionContext['engine'], senderManager, settingsManager: settings };
    const btn: StreamDeckButtonConfig = { action: 'prev', label: 'Poprzedni' };
    executeAction(btn, ctx);
    expect(engine.prev).toHaveBeenCalledTimes(1);
    expect(senderManager.vmix.prevInput).toHaveBeenCalledTimes(1);
  });
});
