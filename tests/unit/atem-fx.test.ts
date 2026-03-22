import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { AtemSender } from '../../electron/senders/atem-sender';
import { AtemFxHandler } from '../../electron/senders/atem-fx-handler';

describe('AtemSender — Faza 30: Macro, DSK, USK, SuperSource', () => {
  let sender: AtemSender;

  beforeEach(() => {
    sender = new AtemSender({ enabled: true }, { forcePlaceholder: true });
    sender.connect();
  });

  afterEach(() => {
    sender.destroy();
  });

  it('runMacro() powinno wywołać onCommand z type=macro', () => {
    const spy = vi.fn();
    sender.onCommand = spy;
    sender.runMacro(5);
    expect(spy).toHaveBeenCalledWith({ type: 'macro', macroIndex: 5 });
  });

  it('setDownstreamKey() powinno wywołać onCommand z type=dsk', () => {
    const spy = vi.fn();
    sender.onCommand = spy;
    sender.setDownstreamKey(1, true);
    expect(spy).toHaveBeenCalledWith({ type: 'dsk', keyIndex: 1, onAir: true });
  });

  it('setDownstreamKey() off powinno przekazać onAir=false', () => {
    const spy = vi.fn();
    sender.onCommand = spy;
    sender.setDownstreamKey(0, false);
    expect(spy).toHaveBeenCalledWith({ type: 'dsk', keyIndex: 0, onAir: false });
  });

  it('setUpstreamKey() powinno wywołać onCommand z type=usk', () => {
    const spy = vi.fn();
    sender.onCommand = spy;
    sender.setUpstreamKey(0, 2, true);
    expect(spy).toHaveBeenCalledWith({ type: 'usk', me: 0, keyIndex: 2, onAir: true });
  });

  it('setSuperSourceBox() powinno wywołać onCommand z type=supersource', () => {
    const spy = vi.fn();
    sender.onCommand = spy;
    sender.setSuperSourceBox(1, { source: 3, enabled: true, x: 100, y: -200, size: 500 });
    expect(spy).toHaveBeenCalledWith({
      type: 'supersource',
      boxIndex: 1,
      config: { source: 3, enabled: true, x: 100, y: -200, size: 500 },
    });
  });

  it('nie powinno wykonywać komend gdy disconnected', () => {
    sender.disconnect();
    const spy = vi.fn();
    sender.onCommand = spy;
    sender.runMacro(0);
    sender.setDownstreamKey(0, true);
    sender.setUpstreamKey(0, 0, true);
    sender.setSuperSourceBox(0, { source: 1 });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('AtemFxHandler', () => {
  let sender: AtemSender;
  let handler: AtemFxHandler;
  let engine: EventEmitter;

  beforeEach(() => {
    sender = new AtemSender({ enabled: true }, { forcePlaceholder: true });
    sender.connect();
    handler = new AtemFxHandler(sender);
    engine = new EventEmitter();
    handler.attach(engine);
  });

  afterEach(() => {
    handler.destroy();
    sender.destroy();
  });

  it('attach powinno nasłuchiwać vision-fx-trigger', () => {
    expect(engine.listenerCount('vision-fx-trigger')).toBe(1);
  });

  it('macro trigger → atem.runMacro()', () => {
    const spy = vi.fn();
    sender.onCommand = spy;
    engine.emit('vision-fx-trigger', {
      id: 'cue-1', type: 'vision_fx',
      data: { fx_action: 'macro', macro_index: 7 },
    });
    expect(spy).toHaveBeenCalledWith({ type: 'macro', macroIndex: 7 });
  });

  it('dsk trigger → atem.setDownstreamKey()', () => {
    const spy = vi.fn();
    sender.onCommand = spy;
    engine.emit('vision-fx-trigger', {
      id: 'cue-2', type: 'vision_fx',
      data: { fx_action: 'dsk', dsk_key_index: 1, dsk_on_air: false },
    });
    expect(spy).toHaveBeenCalledWith({ type: 'dsk', keyIndex: 1, onAir: false });
  });

  it('usk trigger → atem.setUpstreamKey()', () => {
    const spy = vi.fn();
    sender.onCommand = spy;
    engine.emit('vision-fx-trigger', {
      id: 'cue-3', type: 'vision_fx',
      data: { fx_action: 'usk', usk_me_index: 1, usk_key_index: 0, usk_on_air: true },
    });
    expect(spy).toHaveBeenCalledWith({ type: 'usk', me: 1, keyIndex: 0, onAir: true });
  });

  it('supersource trigger → atem.setSuperSourceBox()', () => {
    const spy = vi.fn();
    sender.onCommand = spy;
    engine.emit('vision-fx-trigger', {
      id: 'cue-4', type: 'vision_fx',
      data: { fx_action: 'supersource', ss_box_index: 2, ss_source: 5, ss_enabled: true, ss_x: 100, ss_y: 200, ss_size: 750 },
    });
    expect(spy).toHaveBeenCalledWith({
      type: 'supersource',
      boxIndex: 2,
      config: { source: 5, enabled: true, x: 100, y: 200, size: 750 },
    });
  });

  it('ignoruje cue bez fx_action', () => {
    const spy = vi.fn();
    sender.onCommand = spy;
    engine.emit('vision-fx-trigger', {
      id: 'cue-5', type: 'vision_fx',
      data: { effect_name: 'test' }, // brak fx_action
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('ignoruje gdy ATEM disconnected', () => {
    sender.disconnect();
    const spy = vi.fn();
    sender.onCommand = spy;
    engine.emit('vision-fx-trigger', {
      id: 'cue-6', type: 'vision_fx',
      data: { fx_action: 'macro', macro_index: 1 },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('onFxAction callback powinno być wywołane', () => {
    const fxSpy = vi.fn();
    handler.onFxAction = fxSpy;
    engine.emit('vision-fx-trigger', {
      id: 'cue-7', type: 'vision_fx',
      data: { fx_action: 'dsk', dsk_key_index: 0, dsk_on_air: true },
    });
    expect(fxSpy).toHaveBeenCalledWith({
      fx_action: 'dsk',
      data: { fx_action: 'dsk', dsk_key_index: 0, dsk_on_air: true },
    });
  });

  it('destroy() powinno odłączyć listener', () => {
    handler.destroy();
    expect(engine.listenerCount('vision-fx-trigger')).toBe(0);
  });
});

describe('PlaybackEngine — vision_fx event', () => {
  it('emituje vision-fx-trigger dla cue typu vision_fx', async () => {
    const { PlaybackEngine } = await import('../../electron/playback-engine');
    const { MockClock } = await import('../helpers/mock-clock');

    const clock = new MockClock(1_000_000_000_000);
    const cueRepo = { findByRundown: vi.fn().mockReturnValue([]) };
    const rundownRepo = { findById: vi.fn().mockReturnValue(undefined) };
    const engine = new PlaybackEngine(cueRepo, rundownRepo, clock);

    const actRepo = {
      findById: vi.fn().mockReturnValue({
        id: 'act-1', name: 'Test', duration_frames: 1000, fps: 25, tc_offset_frames: 0,
      }),
    };
    const timelineCueRepo = {
      findActiveAtFrame: vi.fn(),
      findByActAndType: vi.fn().mockReturnValue([]),
      findByAct: vi.fn().mockReturnValue([
        { id: 'fx-1', track_id: 't1', type: 'vision_fx', tc_in_frames: 10, data: { fx_action: 'macro', macro_index: 3 } },
      ]),
    };

    engine.setTimelineRepos(actRepo, timelineCueRepo);
    engine.loadAct('act-1');

    const spy = vi.fn();
    engine.on('vision-fx-trigger', spy);

    // Point cue @ klatka 10 — muszę precyzyjnie trafić w tę klatkę
    // 10 klatek @ 25fps = 400ms
    engine.scrub(0);
    engine.play();
    clock.advance(400); // dokładnie 10 klatek @ 25fps
    engine.tickFrames();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0].data.fx_action).toBe('macro');
    expect(spy.mock.calls[0]![0].data.macro_index).toBe(3);

    engine.destroy();
  });
});
