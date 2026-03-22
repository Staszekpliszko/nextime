import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { VisionRouter } from '../../electron/senders/vision-router';
import type { TargetSwitcher, VisionTransitionType } from '../../electron/senders/vision-router';
import { AtemSender } from '../../electron/senders/atem-sender';
import { ObsSender } from '../../electron/senders/obs-sender';
import { VmixSender } from '../../electron/senders/vmix-sender';

// ── Helpery ─────────────────────────────────────────────

/** Tworzy fake engine (EventEmitter) */
function createEngine(): EventEmitter {
  return new EventEmitter();
}

/** Tworzy AtemSender w trybie placeholder z wymuszonym connected */
function createAtem(overrides: Partial<{ programInput: number; autoSwitch: boolean; transitionType: 'cut' | 'mix'; mixDurationFrames: number }> = {}): AtemSender {
  const atem = new AtemSender({
    enabled: true,
    autoSwitch: overrides.autoSwitch ?? true,
    transitionType: overrides.transitionType ?? 'cut',
    mixDurationFrames: overrides.mixDurationFrames ?? 25,
  }, { forcePlaceholder: true });
  atem.connect();
  return atem;
}

/** Tworzy ObsSender w trybie placeholder z wymuszonym connected */
async function createObs(overrides: Partial<{ sceneMap: Record<number, string>; autoSwitch: boolean }> = {}): Promise<ObsSender> {
  const obs = new ObsSender({
    enabled: true,
    autoSwitch: overrides.autoSwitch ?? true,
    sceneMap: overrides.sceneMap ?? { 1: 'Scena 1', 2: 'Scena 2' },
  }, { forcePlaceholder: true });
  await obs.connect();
  return obs;
}

/** Tworzy VmixSender (placeholder — nie łączy się naprawdę) */
function createVmix(overrides: Partial<{ inputMap: Record<number, number>; autoSwitch: boolean; transitionType: string; transitionDuration: number }> = {}): VmixSender {
  const vmix = new VmixSender({
    enabled: true,
    autoSwitch: overrides.autoSwitch ?? true,
    inputMap: overrides.inputMap ?? { 1: 1, 2: 2, 3: 5 },
    transitionType: (overrides.transitionType ?? 'Cut') as 'Cut',
    transitionDuration: overrides.transitionDuration ?? 0,
  });
  // Symuluj połączenie — ustawiamy _connected przez sendFunction mock
  // VmixSender nie ma placeholdera jak ATEM/OBS, więc użyjemy onCommand
  return vmix;
}

/** Emituje vision-cue-changed na engine z danymi */
function emitVisionCue(engine: EventEmitter, data: Record<string, unknown>): void {
  engine.emit('vision-cue-changed', { data }, null);
}

// ── Testy ───────────────────────────────────────────────

describe('VisionRouter', () => {
  let engine: EventEmitter;
  let router: VisionRouter;

  beforeEach(() => {
    engine = createEngine();
    router = new VisionRouter();
  });

  it('nie routuje gdy targetSwitcher = none', () => {
    router.updateConfig({ targetSwitcher: 'none' });
    router.attach(engine);

    const routes: unknown[] = [];
    router.onRoute = (info) => routes.push(info);

    emitVisionCue(engine, { camera_number: 1 });

    expect(routes).toHaveLength(0);
  });

  it('nie routuje gdy brak activeCue (null)', () => {
    router.updateConfig({ targetSwitcher: 'atem' });
    router.attach(engine);

    const routes: unknown[] = [];
    router.onRoute = (info) => routes.push(info);

    engine.emit('vision-cue-changed', null, null);

    expect(routes).toHaveLength(0);
  });

  it('nie routuje gdy brak camera_number w danych cue', () => {
    router.updateConfig({ targetSwitcher: 'atem' });
    router.attach(engine);

    const routes: unknown[] = [];
    router.onRoute = (info) => routes.push(info);

    emitVisionCue(engine, { shot_name: 'Test' });

    expect(routes).toHaveLength(0);
  });

  it('routuje do ATEM z CUT gdy targetSwitcher = atem', () => {
    const atem = createAtem();
    const commands: unknown[] = [];
    atem.onCommand = (cmd) => commands.push(cmd);

    router.updateConfig({ targetSwitcher: 'atem' });
    router.setSenders({ atem });
    router.attach(engine);

    emitVisionCue(engine, { camera_number: 3 });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ type: 'cut', input: 3 });
  });

  it('routuje do ATEM z MIX gdy transition_type = Fade', () => {
    const atem = createAtem();
    const commands: unknown[] = [];
    atem.onCommand = (cmd) => commands.push(cmd);

    router.updateConfig({ targetSwitcher: 'atem' });
    router.setSenders({ atem });
    router.attach(engine);

    emitVisionCue(engine, { camera_number: 2, transition_type: 'Fade', transition_duration_ms: 1000 });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ type: 'mix', input: 2 });
    // 1000ms / 40 = 25 frames
    expect((commands[0] as { duration: number }).duration).toBe(25);
  });

  it('routuje do OBS gdy targetSwitcher = obs', async () => {
    const obs = await createObs({ sceneMap: { 1: 'Kamera Wide', 2: 'Close-up' } });
    const commands: unknown[] = [];
    obs.onCommand = (cmd) => commands.push(cmd);

    router.updateConfig({ targetSwitcher: 'obs' });
    router.setSenders({ obs });
    router.attach(engine);

    emitVisionCue(engine, { camera_number: 2 });

    // OBS placeholder nie jest w studio mode — bezpośrednia zmiana sceny
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ type: 'setScene', scene: 'Close-up' });
  });

  it('routuje do vMix gdy targetSwitcher = vmix', () => {
    const vmix = createVmix({ inputMap: { 1: 1, 2: 3 } });
    const commands: unknown[] = [];
    vmix.onCommand = (cmd) => commands.push(cmd);

    // Symuluj połączenie — VmixSender wymaga connected
    // Użyjemy handleVisionCueChanged bezpośrednio — nie przechodzi przez router bo vmix nie jest connected
    // Zamiast tego testujemy callback onRoute
    router.updateConfig({ targetSwitcher: 'vmix' });
    router.setSenders({ vmix });
    router.attach(engine);

    const routes: { target: TargetSwitcher; cameraNumber: number; transitionType: VisionTransitionType; durationMs: number }[] = [];
    router.onRoute = (info) => routes.push(info);

    emitVisionCue(engine, { camera_number: 2, transition_type: 'Wipe', transition_duration_ms: 800 });

    // Callback onRoute powinien być wywołany
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      target: 'vmix',
      cameraNumber: 2,
      transitionType: 'Wipe',
      durationMs: 800,
    });
  });

  it('fallback na domyślny transition gdy cue nie ma transition_type', () => {
    const atem = createAtem({ transitionType: 'mix', mixDurationFrames: 50 });
    const commands: unknown[] = [];
    atem.onCommand = (cmd) => commands.push(cmd);

    router.updateConfig({ targetSwitcher: 'atem' });
    router.setSenders({ atem });
    router.attach(engine);

    const routes: { transitionType: VisionTransitionType; durationMs: number }[] = [];
    router.onRoute = (info) => routes.push(info);

    // Cue BEZ transition_type — powinien użyć domyślnego ATEM (mix)
    emitVisionCue(engine, { camera_number: 5 });

    expect(routes[0]!.transitionType).toBe('Fade'); // mix → Fade
    expect(routes[0]!.durationMs).toBe(2000); // 50 frames * 40ms = 2000ms

    // ATEM: powinien wykonać mix (bo fallback = Fade)
    expect(commands[0]).toMatchObject({ type: 'mix', input: 5 });
  });

  it('zmiana targetSwitcher w runtime zmienia routing', async () => {
    const atem = createAtem();
    const obs = await createObs({ sceneMap: { 1: 'Scena 1', 2: 'Close-up' } });

    const atemCmds: unknown[] = [];
    const obsCmds: unknown[] = [];
    atem.onCommand = (cmd) => atemCmds.push(cmd);
    obs.onCommand = (cmd) => obsCmds.push(cmd);

    router.updateConfig({ targetSwitcher: 'atem' });
    router.setSenders({ atem, obs });
    router.attach(engine);

    // ATEM: kamera 3 (nie 1, bo placeholder ma PGM=1)
    emitVisionCue(engine, { camera_number: 3 });
    expect(atemCmds).toHaveLength(1);
    expect(obsCmds).toHaveLength(0);

    // Zmień switcher na OBS
    router.updateConfig({ targetSwitcher: 'obs' });

    // OBS: kamera 2 → 'Close-up' (placeholder ma currentScene='Scena 1', więc inna scena)
    emitVisionCue(engine, { camera_number: 2 });
    expect(obsCmds).toHaveLength(1);
    expect(obsCmds[0]).toMatchObject({ type: 'setScene', scene: 'Close-up' });
  });

  it('destroy odpina listener z engine', () => {
    router.updateConfig({ targetSwitcher: 'atem' });
    router.attach(engine);

    const routes: unknown[] = [];
    router.onRoute = (info) => routes.push(info);

    router.destroy();

    emitVisionCue(engine, { camera_number: 1 });
    expect(routes).toHaveLength(0);
  });

  it('ATEM: nie przełącza gdy input już na PGM', () => {
    const atem = createAtem();
    const commands: unknown[] = [];
    atem.onCommand = (cmd) => commands.push(cmd);

    router.updateConfig({ targetSwitcher: 'atem' });
    router.setSenders({ atem });
    router.attach(engine);

    // Placeholder: programInput = 1 po connect
    emitVisionCue(engine, { camera_number: 1 });

    // Nie powinien przełączyć — już na PGM 1
    expect(commands).toHaveLength(0);
  });

  it('OBS: nie routuje gdy brak mappingu w sceneMap', async () => {
    const obs = await createObs({ sceneMap: { 1: 'Scena 1' } });
    const commands: unknown[] = [];
    obs.onCommand = (cmd) => commands.push(cmd);

    router.updateConfig({ targetSwitcher: 'obs' });
    router.setSenders({ obs });
    router.attach(engine);

    // Kamera 99 — brak w sceneMap
    emitVisionCue(engine, { camera_number: 99 });

    expect(commands).toHaveLength(0);
  });

  it('OBS: nie przełącza gdy scena już aktywna', async () => {
    const obs = await createObs({ sceneMap: { 1: 'Scena 1' } });
    const commands: unknown[] = [];
    obs.onCommand = (cmd) => commands.push(cmd);

    router.updateConfig({ targetSwitcher: 'obs' });
    router.setSenders({ obs });
    router.attach(engine);

    // Placeholder: currentScene = 'Scena 1' po connect
    emitVisionCue(engine, { camera_number: 1 });

    // Nie powinien przełączyć — już na tej scenie
    expect(commands).toHaveLength(0);
  });

  it('ATEM: Wipe/Zoom/Merge → fallback na Mix', () => {
    const atem = createAtem();
    const commands: unknown[] = [];
    atem.onCommand = (cmd) => commands.push(cmd);

    router.updateConfig({ targetSwitcher: 'atem' });
    router.setSenders({ atem });
    router.attach(engine);

    emitVisionCue(engine, { camera_number: 5, transition_type: 'Wipe', transition_duration_ms: 500 });

    // ATEM nie ma Wipe — fallback na Mix
    expect(commands[0]).toMatchObject({ type: 'mix', input: 5 });
    // 500ms / 40 = 12.5 → zaokrąglone 13
    expect((commands[0] as { duration: number }).duration).toBe(13);
  });
});
