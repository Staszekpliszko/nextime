import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { MediaSender } from '../../electron/senders/media-sender';

describe('MediaSender (rozszerzony — Faza 10)', () => {
  let sender: MediaSender;
  let engine: EventEmitter;

  beforeEach(() => {
    sender = new MediaSender({ enabled: true });
    engine = new EventEmitter();
  });

  afterEach(() => {
    sender.destroy();
  });

  // ── Status ─────────────────────────────────────────────

  it('powinno zwracać domyślny status (nie gra)', () => {
    const status = sender.getStatus();
    expect(status.playing).toBe(false);
    expect(status.currentFile).toBeNull();
    expect(status.volume).toBe(100);
  });

  // ── Trigger → play ────────────────────────────────────

  it('powinno ustawiać status playing po triggerze', () => {
    sender.handleTrigger({
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3', volume: 80, loop: false },
    });

    const status = sender.getStatus();
    expect(status.playing).toBe(true);
    expect(status.currentFile).toBe('/audio/bgm.mp3');
    expect(status.volume).toBe(80);
  });

  it('powinno wywoływać onTrigger callback', () => {
    const spy = vi.fn();
    sender.onTrigger = spy;

    sender.handleTrigger({
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/sfx.wav', volume: 50, loop: true },
    });

    expect(spy).toHaveBeenCalledWith({
      filePath: '/audio/sfx.wav',
      volume: 50,
      loop: true,
      cueId: 'cue-1',
    });
  });

  // ── Stop ──────────────────────────────────────────────

  it('powinno zatrzymać playback', () => {
    sender.handleTrigger({
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });
    expect(sender.getStatus().playing).toBe(true);

    sender.stop();

    expect(sender.getStatus().playing).toBe(false);
    expect(sender.getStatus().currentFile).toBeNull();
  });

  it('powinno wywoływać onStop callback', () => {
    const spy = vi.fn();
    sender.onStop = spy;
    sender.handleTrigger({
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });

    sender.stop();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // ── Volume ─────────────────────────────────────────────

  it('powinno zmieniać głośność', () => {
    sender.setVolume(42);
    expect(sender.getStatus().volume).toBe(42);
  });

  it('powinno clampować volume 0-100', () => {
    sender.setVolume(-10);
    expect(sender.getStatus().volume).toBe(0);

    sender.setVolume(200);
    expect(sender.getStatus().volume).toBe(100);
  });

  // ── Attach: cue-exited → stop ─────────────────────────

  it('powinno zatrzymać playback gdy media cue opuszcza zakres', () => {
    sender.attach(engine);

    // Trigger media play
    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });
    expect(sender.getStatus().playing).toBe(true);

    // Media cue exits
    engine.emit('cue-exited', { id: 'cue-1', type: 'media', data: {} });
    expect(sender.getStatus().playing).toBe(false);
  });

  it('powinno nie zatrzymać playback dla non-media cue exit', () => {
    sender.attach(engine);

    engine.emit('media-trigger', {
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });
    expect(sender.getStatus().playing).toBe(true);

    // Lyric cue exits — nie powinno zatrzymać media
    engine.emit('cue-exited', { id: 'cue-2', type: 'lyric', data: {} });
    expect(sender.getStatus().playing).toBe(true);
  });

  // ── Disabled ───────────────────────────────────────────

  it('powinno ignorować trigger gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    sender.handleTrigger({
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });
    expect(sender.getStatus().playing).toBe(false);
  });

  // ── Destroy ────────────────────────────────────────────

  it('powinno poprawnie zniszczyć sendera', () => {
    sender.handleTrigger({
      id: 'cue-1', type: 'media',
      data: { file_path: '/audio/bgm.mp3' },
    });
    sender.destroy();
    expect(sender.getStatus().playing).toBe(false);
    expect(sender.onTrigger).toBeNull();
    expect(sender.onStop).toBeNull();
  });
});
