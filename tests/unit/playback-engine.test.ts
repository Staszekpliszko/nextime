import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedTestUser, seedTestProject, seedTestRundown } from '../helpers/test-db';
import { createCueRepo } from '../../electron/db/repositories/cue.repo';
import { createRundownRepo } from '../../electron/db/repositories/rundown.repo';
import { PlaybackEngine } from '../../electron/playback-engine';
import type { EngineRundownMsState } from '../../electron/playback-engine';
import { MockClock } from '../helpers/mock-clock';

describe('PlaybackEngine', () => {
  let db: Database.Database;
  let engine: PlaybackEngine;
  let clock: MockClock;
  let rundownId: string;

  beforeEach(() => {
    db = createTestDb();
    clock = new MockClock(1_000_000_000_000); // stały punkt startowy

    const userId = seedTestUser(db);
    const projectId = seedTestProject(db, userId);
    rundownId = seedTestRundown(db, projectId);

    const cueRepo = createCueRepo(db);
    const rundownRepo = createRundownRepo(db);

    // Seed 3 cues: Opening (60s), Interview (120s, hard), Closing (30s, auto_start)
    cueRepo.create({
      rundown_id: rundownId, title: 'Opening', subtitle: 'Intro',
      duration_ms: 60_000, sort_order: 0,
    });
    cueRepo.create({
      rundown_id: rundownId, title: 'Interview', subtitle: 'Guest',
      duration_ms: 120_000, sort_order: 1,
      start_type: 'hard', hard_start_datetime: '2026-03-20T20:01:00.000Z',
    });
    cueRepo.create({
      rundown_id: rundownId, title: 'Closing', subtitle: 'Outro',
      duration_ms: 30_000, sort_order: 2, auto_start: true,
    });

    engine = new PlaybackEngine(cueRepo, rundownRepo, clock);
  });

  afterEach(() => {
    engine.destroy();
    db.close();
  });

  it('powinno wystartować w stanie idle', () => {
    const state = engine.getState();
    expect(state).toBeNull();
  });

  it('powinno załadować rundown i ustawić pierwszy cue', () => {
    engine.loadRundown(rundownId);
    const state = engine.getState() as EngineRundownMsState;
    expect(state).not.toBeNull();
    expect(state.mode).toBe('rundown_ms');
    expect(state.is_playing).toBe(false);
    expect(state.currentCueTitle).toBe('Opening');
  });

  it('powinno rozpocząć odtwarzanie (play)', () => {
    engine.loadRundown(rundownId);
    engine.play();
    const state = engine.getState() as EngineRundownMsState;
    expect(state.is_playing).toBe(true);
    expect(state.kickoff_epoch_ms).toBe(clock.now());
    expect(state.deadline_epoch_ms).toBe(clock.now() + 60_000);
  });

  it('powinno zatrzymać odtwarzanie (pause)', () => {
    engine.loadRundown(rundownId);
    engine.play();
    clock.advance(10_000); // 10s elapsed
    engine.pause();
    const state = engine.getState() as EngineRundownMsState;
    expect(state.is_playing).toBe(false);
    expect(state.last_stop_epoch_ms).toBe(clock.now());
  });

  it('powinno wznowić z zachowaniem remaining time', () => {
    engine.loadRundown(rundownId);
    engine.play();
    clock.advance(10_000); // 10s elapsed → remaining = 50s
    engine.pause();
    clock.advance(5_000); // 5s pauzy (nie liczy się)
    engine.play(); // resume
    const state = engine.getState() as EngineRundownMsState;
    expect(state.is_playing).toBe(true);
    // remaining powinno nadal wynosić 50s
    expect(state.deadline_epoch_ms - clock.now()).toBe(50_000);
  });

  it('powinno przejść do następnego cue (next)', () => {
    engine.loadRundown(rundownId);
    engine.play();
    engine.next();
    const state = engine.getState() as EngineRundownMsState;
    expect(state.currentCueTitle).toBe('Interview');
    expect(state.is_playing).toBe(true); // kontynuuje odtwarzanie
    expect(state.deadline_epoch_ms - state.kickoff_epoch_ms).toBe(120_000);
  });

  it('powinno zostać na ostatnim cue przy next', () => {
    engine.loadRundown(rundownId);
    engine.next(); // → Interview
    engine.next(); // → Closing
    engine.next(); // → nadal Closing
    const state = engine.getState() as EngineRundownMsState;
    expect(state.currentCueTitle).toBe('Closing');
  });

  it('powinno wrócić do poprzedniego cue (prev)', () => {
    engine.loadRundown(rundownId);
    engine.next(); // → Interview
    engine.prev(); // → Opening
    const state = engine.getState() as EngineRundownMsState;
    expect(state.currentCueTitle).toBe('Opening');
  });

  it('powinno zostać na pierwszym cue przy prev', () => {
    engine.loadRundown(rundownId);
    engine.prev(); // → nadal Opening
    const state = engine.getState() as EngineRundownMsState;
    expect(state.currentCueTitle).toBe('Opening');
  });

  it('powinno skakać do konkretnego cue (goto)', () => {
    engine.loadRundown(rundownId);
    const cueRepo = createCueRepo(db);
    const cues = cueRepo.findByRundown(rundownId);
    const closingId = cues[2]!.id;
    engine.goto(closingId);
    const state = engine.getState() as EngineRundownMsState;
    expect(state.currentCueTitle).toBe('Closing');
  });

  it('powinno rzucić błąd przy goto nieistniejącego cue', () => {
    engine.loadRundown(rundownId);
    expect(() => engine.goto('nonexistent-id')).toThrow();
  });

  it('powinno zbudować poprawny timesnap payload', () => {
    engine.loadRundown(rundownId);
    engine.play();
    clock.advance(5_000); // 5s elapsed
    const snap = engine.buildTimesnap();
    expect(snap).not.toBeNull();
    expect(snap!.tc_mode).toBe('rundown_ms');
    if (snap!.tc_mode === 'rundown_ms') {
      expect(snap!.tc.is_playing).toBe(true);
      expect(snap!.tc.kickoff_ms).toBeDefined();
      expect(snap!.tc.deadline_ms).toBeDefined();
      expect(snap!.rundown_id).toBe(rundownId);
      expect(snap!.next_cue_id).toBeDefined(); // Interview jest next
    }
  });

  it('powinno obliczać over/under poprawnie (ahead of schedule)', () => {
    engine.loadRundown(rundownId);
    engine.play();
    clock.advance(30_000); // 30s elapsed z 60s cue → 30s ahead
    const snap = engine.buildTimesnap();
    expect(snap).not.toBeNull();
    if (snap!.tc_mode === 'rundown_ms') {
      expect(snap!.over_under_ms).toBe(-30_000); // ujemny = ahead
    }
  });

  it('powinno obliczać over/under poprawnie (behind schedule)', () => {
    engine.loadRundown(rundownId);
    engine.play();
    clock.advance(70_000); // 70s elapsed z 60s cue → 10s behind
    const snap = engine.buildTimesnap();
    expect(snap).not.toBeNull();
    if (snap!.tc_mode === 'rundown_ms') {
      expect(snap!.over_under_ms).toBe(10_000); // dodatni = behind
    }
  });

  it('powinno emitować event state-changed przy play', () => {
    engine.loadRundown(rundownId);
    const handler = vi.fn();
    engine.on('state-changed', handler);
    engine.play();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('powinno emitować event cue-changed przy next', () => {
    engine.loadRundown(rundownId);
    const handler = vi.fn();
    engine.on('cue-changed', handler);
    engine.next();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Interview' }),
      expect.objectContaining({ title: 'Closing' }), // next cue
    );
  });

  it('powinno automatycznie startować cue z auto_start', () => {
    engine.loadRundown(rundownId);
    // engine NIE gra
    expect((engine.getState() as EngineRundownMsState).is_playing).toBe(false);
    engine.next(); // → Interview (brak auto_start)
    expect((engine.getState() as EngineRundownMsState).is_playing).toBe(false);
    engine.next(); // → Closing (auto_start: true)
    expect((engine.getState() as EngineRundownMsState).is_playing).toBe(true);
  });

  it('powinno rzucić błąd przy play bez załadowanego rundownu', () => {
    expect(() => engine.play()).toThrow('No rundown loaded');
  });

  it('powinno rzucić błąd przy loadRundown nieistniejącego rundownu', () => {
    expect(() => engine.loadRundown('nonexistent-id')).toThrow('not found');
  });

  it('powinno zwrócić null z buildTimesnap gdy idle', () => {
    expect(engine.buildTimesnap()).toBeNull();
  });

  it('powinno podać next_hard_start_ms dla najbliższego hard cue', () => {
    engine.loadRundown(rundownId);
    engine.play();
    const snap = engine.buildTimesnap();
    if (snap && snap.tc_mode === 'rundown_ms') {
      // Interview (sort_order=1) jest hard cue
      expect(snap.next_hard_start_cue_id).toBeDefined();
    }
  });
});
