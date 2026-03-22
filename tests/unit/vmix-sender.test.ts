import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { parseVmixXml } from '../../electron/senders/vmix-xml-parser';
import type { VmixState, VmixInput } from '../../electron/senders/vmix-xml-parser';
import { VmixSender } from '../../electron/senders/vmix-sender';
import type { VmixSenderConfig, VmixStatus } from '../../electron/senders/vmix-sender';

// ── Testy XML Parsera ───────────────────────────────────

describe('vmix-xml-parser: parseVmixXml', () => {
  const SAMPLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<vmix>
  <version>27.0.0.49</version>
  <edition>4K</edition>
  <active>1</active>
  <preview>2</preview>
  <streaming>False</streaming>
  <recording>True</recording>
  <inputs>
    <input key="1" number="1" type="Camera" title="Kamera Wide" state="Running" position="0" duration="0" loop="False">Kamera Wide</input>
    <input key="2" number="2" type="Camera" title="Close-up" state="Running" position="0" duration="0" loop="False">Close-up</input>
    <input key="3" number="3" type="Video" title="Film reklamowy.mp4" state="Paused" position="5000" duration="30000" loop="True">Film reklamowy.mp4</input>
  </inputs>
</vmix>`;

  it('parsuje wersję i edycję', () => {
    const state = parseVmixXml(SAMPLE_XML);
    expect(state.version).toBe('27.0.0.49');
    expect(state.edition).toBe('4K');
  });

  it('parsuje aktywny input i preview', () => {
    const state = parseVmixXml(SAMPLE_XML);
    expect(state.activeInput).toBe(1);
    expect(state.previewInput).toBe(2);
  });

  it('parsuje streaming i recording', () => {
    const state = parseVmixXml(SAMPLE_XML);
    expect(state.streaming).toBe(false);
    expect(state.recording).toBe(true);
  });

  it('parsuje listę inputów', () => {
    const state = parseVmixXml(SAMPLE_XML);
    expect(state.inputs).toHaveLength(3);

    const cam1 = state.inputs[0]!;
    expect(cam1.number).toBe(1);
    expect(cam1.title).toBe('Kamera Wide');
    expect(cam1.type).toBe('Camera');
    expect(cam1.state).toBe('Running');
    expect(cam1.loop).toBe(false);

    const video = state.inputs[2]!;
    expect(video.number).toBe(3);
    expect(video.title).toBe('Film reklamowy.mp4');
    expect(video.type).toBe('Video');
    expect(video.state).toBe('Paused');
    expect(video.position).toBe(5000);
    expect(video.duration).toBe(30000);
    expect(video.loop).toBe(true);
  });

  it('obsługuje pusty XML gracefully', () => {
    const state = parseVmixXml('<vmix></vmix>');
    expect(state.activeInput).toBeNull();
    expect(state.previewInput).toBeNull();
    expect(state.inputs).toHaveLength(0);
    expect(state.streaming).toBe(false);
    expect(state.recording).toBe(false);
    expect(state.version).toBe('');
  });

  it('obsługuje XML bez inputów', () => {
    const xml = `<vmix><version>27</version><active>1</active><preview>2</preview><streaming>True</streaming><recording>False</recording></vmix>`;
    const state = parseVmixXml(xml);
    expect(state.activeInput).toBe(1);
    expect(state.streaming).toBe(true);
    expect(state.recording).toBe(false);
    expect(state.inputs).toHaveLength(0);
  });
});

// ── Testy VmixSender ────────────────────────────────────

describe('VmixSender', () => {
  let sender: VmixSender;
  const commands: Array<{ type: string; input?: number; duration?: number; function?: string }> = [];

  beforeEach(() => {
    commands.length = 0;
    sender = new VmixSender({
      ip: '127.0.0.1',
      port: 8088,
      enabled: true,
      autoSwitch: true,
      inputMap: { 1: 1, 2: 2, 3: 5 },
      transitionType: 'Cut',
      transitionDuration: 0,
    });
    sender.onCommand = (cmd) => commands.push(cmd);
  });

  afterEach(() => {
    sender.destroy();
  });

  it('inicjalizuje się z domyślną konfiguracją', () => {
    const def = new VmixSender();
    const status = def.getStatus();
    expect(status.connected).toBe(false);
    expect(status.ip).toBe('127.0.0.1');
    expect(status.port).toBe(8088);
    expect(status.inputs).toHaveLength(0);
    def.destroy();
  });

  it('getStatus zwraca poprawny stan przed połączeniem', () => {
    const status = sender.getStatus();
    expect(status.connected).toBe(false);
    expect(status.activeInput).toBeNull();
    expect(status.previewInput).toBeNull();
    expect(status.inputs).toHaveLength(0);
    expect(status.version).toBe('');
  });

  it('getConfig zwraca kopię konfiguracji', () => {
    const config = sender.getConfig();
    expect(config.ip).toBe('127.0.0.1');
    expect(config.port).toBe(8088);
    expect(config.enabled).toBe(true);
    expect(config.inputMap).toEqual({ 1: 1, 2: 2, 3: 5 });
    expect(config.transitionType).toBe('Cut');
    // Zmiana kopii nie wpływa na oryginał
    config.inputMap[99] = 99;
    expect(sender.getConfig().inputMap[99]).toBeUndefined();
  });

  it('updateConfig aktualizuje konfigurację', () => {
    sender.updateConfig({ transitionType: 'Fade', transitionDuration: 1000 });
    const config = sender.getConfig();
    expect(config.transitionType).toBe('Fade');
    expect(config.transitionDuration).toBe(1000);
  });

  it('getInputList zwraca pustą listę bez połączenia', () => {
    expect(sender.getInputList()).toHaveLength(0);
  });

  it('getCurrentState zwraca null bez połączenia', () => {
    expect(sender.getCurrentState()).toBeNull();
  });

  it('connect z disabled config nie robi nic', async () => {
    sender.updateConfig({ enabled: false });
    await sender.connect(); // nie powinno rzucić
    expect(sender.getStatus().connected).toBe(false);
  });

  it('disconnect emituje event', () => {
    const events: string[] = [];
    sender.on('disconnected', () => events.push('disconnected'));
    sender.disconnect();
    expect(events).toContain('disconnected');
  });

  it('attach nie dodaje bezpośredniego listenera vision-cue-changed (routing przez VisionRouter)', () => {
    const engine = new EventEmitter();
    sender.attach(engine);
    // Od Fazy 27 VmixSender nie nasłuchuje bezpośrednio — VisionRouter to robi
    expect(engine.listenerCount('vision-cue-changed')).toBe(0);
  });

  it('handleVisionCueChanged ignoruje gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    sender.handleVisionCueChanged({ data: { camera_number: 1 } });
    expect(commands).toHaveLength(0);
  });

  it('handleVisionCueChanged ignoruje gdy autoSwitch wyłączony', () => {
    sender.updateConfig({ autoSwitch: false });
    // Symuluj połączenie (prywatne pole)
    (sender as unknown as Record<string, unknown>)['_connected'] = true;
    sender.handleVisionCueChanged({ data: { camera_number: 1 } });
    expect(commands).toHaveLength(0);
  });

  it('handleVisionCueChanged ignoruje brak camera_number', () => {
    (sender as unknown as Record<string, unknown>)['_connected'] = true;
    sender.handleVisionCueChanged({ data: { shot_name: 'test' } });
    expect(commands).toHaveLength(0);
  });

  it('handleVisionCueChanged ignoruje niezmapowany camera_number', () => {
    (sender as unknown as Record<string, unknown>)['_connected'] = true;
    sender.handleVisionCueChanged({ data: { camera_number: 99 } });
    expect(commands).toHaveLength(0);
  });

  it('handleVisionCueChanged wysyła previewinput+cut dla zmapowanego camera_number', async () => {
    (sender as unknown as Record<string, unknown>)['_connected'] = true;
    (sender as unknown as Record<string, unknown>)['httpGet'] = async () => 'OK';
    sender.handleVisionCueChanged({ data: { camera_number: 1 } });
    // Poczekaj na async executeTransition
    await new Promise(r => setTimeout(r, 50));
    // Cut wysyła PreviewInput + Cut = 2 komendy
    expect(commands).toHaveLength(2);
    expect(commands[0]!.type).toBe('previewinput');
    expect(commands[0]!.input).toBe(1);
    expect(commands[1]!.type).toBe('cut');
    expect(commands[1]!.input).toBe(1);
  });

  it('handleVisionCueChanged używa domyślnego transition type', async () => {
    (sender as unknown as Record<string, unknown>)['_connected'] = true;
    (sender as unknown as Record<string, unknown>)['httpGet'] = async () => 'OK';
    sender.updateConfig({ transitionType: 'Fade', transitionDuration: 500 });
    sender.handleVisionCueChanged({ data: { camera_number: 2 } });
    // Poczekaj na async executeTransition
    await new Promise(r => setTimeout(r, 50));
    // Fade wysyła PreviewInput + Fade = 2 komendy
    expect(commands).toHaveLength(2);
    expect(commands[0]!.type).toBe('previewinput');
    expect(commands[1]!.type).toBe('fade');
    expect(commands[1]!.input).toBe(2);
    expect(commands[1]!.duration).toBe(500);
  });

  it('handleVisionCueChanged ignoruje null activeCue', () => {
    (sender as unknown as Record<string, unknown>)['_connected'] = true;
    sender.handleVisionCueChanged(null);
    expect(commands).toHaveLength(0);
  });

  it('destroy czyści state i listenery', () => {
    const engine = new EventEmitter();
    sender.attach(engine);
    sender.on('connected', () => {});
    sender.destroy();
    expect(sender.getStatus().connected).toBe(false);
    expect(sender.onCommand).toBeNull();
  });

  it('setVolume klampuje wartość 0-100', async () => {
    (sender as unknown as Record<string, unknown>)['_connected'] = true;
    // Mock httpGet żeby nie robić prawdziwego requestu
    (sender as unknown as Record<string, unknown>)['httpGet'] = async () => 'OK';
    await sender.setVolume(1, 150);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.duration).toBe(100); // clamped do 100
  });
});
