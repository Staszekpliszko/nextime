import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { ObsSender } from '../../electron/senders/obs-sender';

describe('ObsSender', () => {
  let sender: ObsSender;
  let engine: EventEmitter;

  beforeEach(() => {
    // forcePlaceholder: true — testy nie łączą się z prawdziwym OBS
    sender = new ObsSender(
      { enabled: true, ip: '127.0.0.1', port: 4455, password: '', autoSwitch: true, sceneMap: { 1: 'Kamera Wide', 2: 'Close-up', 3: 'Grafika' } },
      { forcePlaceholder: true },
    );
    engine = new EventEmitter();
  });

  afterEach(() => {
    sender.destroy();
  });

  // ── Połączenie ──────────────────────────────────────────

  it('powinno połączyć się z OBS (placeholder)', async () => {
    await sender.connect();
    const status = sender.getStatus();
    expect(status.connected).toBe(true);
    expect(status.currentScene).toBe('Scena 1');
    expect(status.scenes).toEqual(['Scena 1', 'Scena 2', 'Scena 3']);
    expect(status.ip).toBe('127.0.0.1');
    expect(status.port).toBe(4455);
  });

  it('powinno emitować event connected', async () => {
    const spy = vi.fn();
    sender.on('connected', spy);
    await sender.connect();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('powinno rozłączyć się z OBS', async () => {
    await sender.connect();
    sender.disconnect();
    const status = sender.getStatus();
    expect(status.connected).toBe(false);
    expect(status.currentScene).toBeNull();
    expect(status.previewScene).toBeNull();
    expect(status.scenes).toEqual([]);
  });

  it('powinno emitować event disconnected', async () => {
    await sender.connect();
    const spy = vi.fn();
    sender.on('disconnected', spy);
    sender.disconnect();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('powinno nie łączyć gdy disabled', async () => {
    sender.updateConfig({ enabled: false });
    await sender.connect();
    expect(sender.getStatus().connected).toBe(false);
  });

  // ── setScene ──────────────────────────────────────────

  it('powinno przełączyć scenę na Program (placeholder)', async () => {
    await sender.connect();
    await sender.setScene('Close-up');
    expect(sender.getCurrentScene()).toBe('Close-up');
  });

  it('powinno wywołać onCommand przy setScene', async () => {
    const cmdSpy = vi.fn();
    sender.onCommand = cmdSpy;
    await sender.connect();
    await sender.setScene('Grafika');
    expect(cmdSpy).toHaveBeenCalledWith({ type: 'setScene', scene: 'Grafika' });
  });

  it('powinno emitować scene-changed przy setScene (placeholder)', async () => {
    await sender.connect();
    const spy = vi.fn();
    sender.on('scene-changed', spy);
    await sender.setScene('Scena 2');
    expect(spy).toHaveBeenCalledWith({ scene: 'Scena 2', type: 'program' });
  });

  // ── setPreviewScene ───────────────────────────────────

  it('powinno ustawić scenę na Preview (placeholder)', async () => {
    await sender.connect();
    await sender.setPreviewScene('Scena 3');
    expect(sender.getStatus().previewScene).toBe('Scena 3');
  });

  it('powinno wywołać onCommand przy setPreview', async () => {
    const cmdSpy = vi.fn();
    sender.onCommand = cmdSpy;
    await sender.connect();
    await sender.setPreviewScene('Scena 2');
    expect(cmdSpy).toHaveBeenCalledWith({ type: 'setPreview', scene: 'Scena 2' });
  });

  // ── triggerTransition ─────────────────────────────────

  it('powinno wykonać transition (placeholder — preview → program)', async () => {
    await sender.connect();
    await sender.setPreviewScene('Scena 3');
    await sender.triggerTransition('Fade', 500);
    expect(sender.getCurrentScene()).toBe('Scena 3');
    expect(sender.getStatus().previewScene).toBeNull();
  });

  it('powinno wywołać onCommand przy triggerTransition', async () => {
    const cmdSpy = vi.fn();
    sender.onCommand = cmdSpy;
    await sender.connect();
    await sender.triggerTransition('Cut', 0);
    expect(cmdSpy).toHaveBeenCalledWith({ type: 'transition', transition: 'Cut', duration: 0 });
  });

  // ── getSceneList ──────────────────────────────────────

  it('powinno zwrócić listę scen', async () => {
    await sender.connect();
    const scenes = sender.getSceneList();
    expect(scenes).toEqual(['Scena 1', 'Scena 2', 'Scena 3']);
  });

  it('powinno zwrócić pustą listę gdy niepołączone', () => {
    const scenes = sender.getSceneList();
    expect(scenes).toEqual([]);
  });

  // ── handleVisionCueChanged ────────────────────────────

  it('powinno przełączyć scenę na vision cue change (autoSwitch)', async () => {
    await sender.connect();
    const cmdSpy = vi.fn();
    sender.onCommand = cmdSpy;

    sender.handleVisionCueChanged({ data: { camera_number: 2 } });
    // Poczekaj na async setScene
    await new Promise(r => setTimeout(r, 50));

    expect(cmdSpy).toHaveBeenCalledWith({ type: 'setScene', scene: 'Close-up' });
  });

  it('powinno zignorować vision cue bez mappingu', async () => {
    await sender.connect();
    const cmdSpy = vi.fn();
    sender.onCommand = cmdSpy;

    sender.handleVisionCueChanged({ data: { camera_number: 99 } });
    await new Promise(r => setTimeout(r, 50));

    expect(cmdSpy).not.toHaveBeenCalled();
  });

  it('powinno zignorować vision cue gdy autoSwitch wyłączony', async () => {
    sender.updateConfig({ autoSwitch: false });
    await sender.connect();
    const cmdSpy = vi.fn();
    sender.onCommand = cmdSpy;

    sender.handleVisionCueChanged({ data: { camera_number: 1 } });
    await new Promise(r => setTimeout(r, 50));

    expect(cmdSpy).not.toHaveBeenCalled();
  });

  it('powinno zignorować vision cue gdy niepołączone', () => {
    const cmdSpy = vi.fn();
    sender.onCommand = cmdSpy;
    sender.handleVisionCueChanged({ data: { camera_number: 1 } });
    expect(cmdSpy).not.toHaveBeenCalled();
  });

  it('powinno zignorować null cue', async () => {
    await sender.connect();
    const cmdSpy = vi.fn();
    sender.onCommand = cmdSpy;
    sender.handleVisionCueChanged(null);
    expect(cmdSpy).not.toHaveBeenCalled();
  });

  it('powinno nie przełączać gdy ta sama scena już na PGM', async () => {
    await sender.connect();
    // Domyślnie currentScene = 'Scena 1', kamera 1 → 'Kamera Wide' (inna)
    // Ustaw currentScene na 'Kamera Wide'
    await sender.setScene('Kamera Wide');
    const cmdSpy = vi.fn();
    sender.onCommand = cmdSpy;

    sender.handleVisionCueChanged({ data: { camera_number: 1 } });
    await new Promise(r => setTimeout(r, 50));

    // Nie powinno być wywołane, bo 'Kamera Wide' już na PGM
    expect(cmdSpy).not.toHaveBeenCalled();
  });

  // ── attach ────────────────────────────────────────────

  it('powinno reagować na engine vision-cue-changed', async () => {
    sender.attach(engine);
    await sender.connect();
    const cmdSpy = vi.fn();
    sender.onCommand = cmdSpy;

    engine.emit('vision-cue-changed', { data: { camera_number: 3 } }, null);
    await new Promise(r => setTimeout(r, 50));

    expect(cmdSpy).toHaveBeenCalledWith({ type: 'setScene', scene: 'Grafika' });
  });

  // ── updateConfig ──────────────────────────────────────

  it('powinno aktualizować konfigurację', () => {
    sender.updateConfig({ ip: '10.0.0.1', port: 9999 });
    const config = sender.getConfig();
    expect(config.ip).toBe('10.0.0.1');
    expect(config.port).toBe(9999);
  });

  it('powinno zachować sceneMap po updateConfig', () => {
    sender.updateConfig({ autoSwitch: false });
    const config = sender.getConfig();
    expect(config.sceneMap).toEqual({ 1: 'Kamera Wide', 2: 'Close-up', 3: 'Grafika' });
  });

  // ── getStatus ─────────────────────────────────────────

  it('powinno zwrócić prawidłowy status przed połączeniem', () => {
    const status = sender.getStatus();
    expect(status.connected).toBe(false);
    expect(status.currentScene).toBeNull();
    expect(status.previewScene).toBeNull();
    expect(status.scenes).toEqual([]);
    expect(status.studioMode).toBe(false);
    expect(status.ip).toBe('127.0.0.1');
    expect(status.port).toBe(4455);
  });

  // ── destroy ───────────────────────────────────────────

  it('powinno wyczyścić po destroy', async () => {
    await sender.connect();
    sender.destroy();
    const status = sender.getStatus();
    expect(status.connected).toBe(false);
    expect(sender.onCommand).toBeNull();
  });
});
