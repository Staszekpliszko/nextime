import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlaybackEngine } from '../../electron/playback-engine';
import { MockClock } from '../helpers/mock-clock';

describe('PlaybackEngine — LTC mode (Faza 10)', () => {
  let engine: PlaybackEngine;
  let clock: MockClock;

  const mockCueRepo = {
    findByRundown: () => [],
  };
  const mockRundownRepo = {
    findById: () => ({ id: 'r1', name: 'R1' }),
  };
  const mockActRepo = {
    findById: (id: string) => id === 'act-1'
      ? { id: 'act-1', name: 'Test Act', duration_frames: 7500, fps: 25, tc_offset_frames: 0 }
      : undefined,
  };
  const mockTlCueRepo = {
    findActiveAtFrame: () => undefined,
    findByActAndType: () => [],
    findByAct: () => [],
  };

  beforeEach(() => {
    clock = new MockClock(1_000_000);
    engine = new PlaybackEngine(mockCueRepo, mockRundownRepo, clock);
    engine.setTimelineRepos(mockActRepo, mockTlCueRepo);
  });

  // ── setLtcSource ───────────────────────────────────────

  it('powinno ustawić ltcSource w state', () => {
    engine.loadAct('act-1');
    engine.setLtcSource('ltc');
    const state = engine.getState();
    expect(state).not.toBeNull();
    if (state && state.mode === 'timeline_frames') {
      expect(state.ltcSource).toBe('ltc');
    }
  });

  it('powinno emitować ltc-source-changed', () => {
    engine.loadAct('act-1');
    const spy = vi.fn();
    engine.on('ltc-source-changed', spy);
    engine.setLtcSource('mtc');
    expect(spy).toHaveBeenCalledWith('mtc');
  });

  it('powinno emitować state-changed', () => {
    engine.loadAct('act-1');
    const spy = vi.fn();
    engine.on('state-changed', spy);
    engine.setLtcSource('manual');
    expect(spy).toHaveBeenCalled();
  });

  it('powinno nie działać poza timeline mode', () => {
    // engine nie załadował aktu — state = null
    engine.setLtcSource('ltc'); // powinno nie rzucić błędu
    expect(engine.getState()).toBeNull();
  });

  // ── feedExternalTc ─────────────────────────────────────

  it('powinno ustawić pozycję w trybie manual', () => {
    engine.loadAct('act-1');
    engine.setLtcSource('manual');
    engine.feedExternalTc(500);

    const state = engine.getState();
    if (state && state.mode === 'timeline_frames') {
      expect(Math.floor(state.currentTcFrames)).toBe(500);
    }
  });

  it('powinno clampować pozycję do zakresu aktu', () => {
    engine.loadAct('act-1'); // duration = 7500
    engine.setLtcSource('manual');
    engine.feedExternalTc(99999);

    const state = engine.getState();
    if (state && state.mode === 'timeline_frames') {
      expect(state.currentTcFrames).toBe(7500);
    }
  });

  it('powinno ignorować feedExternalTc w trybie internal', () => {
    engine.loadAct('act-1');
    // ltcSource = 'internal' (domyślny)
    const initialState = engine.getState();
    if (!initialState || initialState.mode !== 'timeline_frames') return;
    const initialFrames = initialState.currentTcFrames;

    engine.feedExternalTc(999);

    const state = engine.getState();
    if (state && state.mode === 'timeline_frames') {
      expect(state.currentTcFrames).toBe(initialFrames);
    }
  });

  it('powinno emitować state-changed przy feedExternalTc', () => {
    engine.loadAct('act-1');
    engine.setLtcSource('ltc');
    const spy = vi.fn();
    engine.on('state-changed', spy);
    spy.mockClear();

    engine.feedExternalTc(100);
    expect(spy).toHaveBeenCalled();
  });

  // ── tickFrames w trybie LTC ────────────────────────────

  it('powinno nie advance pozycji w trybie ltc (tickFrames)', () => {
    engine.loadAct('act-1');
    engine.setLtcSource('ltc');
    engine.play();

    const state = engine.getState();
    if (!state || state.mode !== 'timeline_frames') return;
    const beforeFrames = state.currentTcFrames;

    // Advance zegar
    clock.advance(1000); // 1 sekunda
    engine.tickFrames();

    // Pozycja nie powinna się zmienić — czekamy na feedExternalTc
    const afterState = engine.getState();
    if (afterState && afterState.mode === 'timeline_frames') {
      expect(afterState.currentTcFrames).toBe(beforeFrames);
    }
  });

  it('powinno advance pozycji w trybie internal (tickFrames)', () => {
    engine.loadAct('act-1');
    // ltcSource = 'internal' (domyślny)
    engine.play();

    clock.advance(1000); // 1 sekunda @ 25fps = +25 klatek
    engine.tickFrames();

    const state = engine.getState();
    if (state && state.mode === 'timeline_frames') {
      // Powinno być ok. 25 klatek dalej
      expect(state.currentTcFrames).toBeGreaterThan(20);
    }
  });

  // ── Timesnap — ltc_source w payload ────────────────────

  it('powinno uwzględniać ltcSource w timesnap', () => {
    engine.loadAct('act-1');
    engine.setLtcSource('mtc');

    const snap = engine.buildTimesnap();
    expect(snap).not.toBeNull();
    if (snap && snap.tc_mode === 'timeline_frames') {
      expect(snap.tc.ltc_source).toBe('mtc');
    }
  });
});
