import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VmixSender } from '../../electron/senders/vmix-sender';

// ── Helper: tworzy VmixSender z mockiem HTTP ────────────

function createTestSender() {
  const sender = new VmixSender({ ip: '127.0.0.1', port: 8088, enabled: true });

  // Przechwytuj komendy wysyłane do vMix
  const commands: Array<{ type: string; input?: number; duration?: number; function?: string }> = [];
  sender.onCommand = (cmd) => commands.push(cmd);

  // Mock httpGet — symuluj połączenie i stan vMix
  const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<vmix>
  <version>27.0.0</version>
  <inputs>
    <input key="abc" number="1" type="Video" title="Camera 1" state="Running" position="0" duration="0" loop="false" muted="false" volume="100" audiobusses="M">Camera 1</input>
    <input key="def" number="2" type="Video" title="Camera 2" state="Paused" position="0" duration="0" loop="false" muted="false" volume="100" audiobusses="M">Camera 2</input>
    <input key="ghi" number="3" type="Video" title="Camera 3" state="Paused" position="0" duration="0" loop="false" muted="false" volume="100" audiobusses="M">Camera 3</input>
  </inputs>
  <active>1</active>
  <preview>2</preview>
  <streaming>False</streaming>
  <recording>False</recording>
</vmix>`;

  // Zastąp httpGet prywatną metodą — wymuszamy przez prototype hack
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const senderAny = sender as any;
  senderAny._connected = true;
  senderAny.httpGet = vi.fn().mockResolvedValue(mockXml);

  return { sender, commands, senderAny };
}

// ── Testy ────────────────────────────────────────────────

describe('VmixSender — transport (Faza 37B)', () => {
  let sender: VmixSender;
  let commands: Array<{ type: string; input?: number; duration?: number; function?: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let senderAny: any;

  beforeEach(() => {
    const t = createTestSender();
    sender = t.sender;
    commands = t.commands;
    senderAny = t.senderAny;
  });

  it('resumePlayback() odświeża stan i wysyła Play na activeInput', async () => {
    await sender.resumePlayback();
    // httpGet powinien być wywołany (refreshState)
    expect(senderAny.httpGet).toHaveBeenCalledWith('/api/');
    // Po refreshState, activeInput = 1 (z XML)
    const playCmd = commands.find(c => c.function === 'Play');
    expect(playCmd).toBeDefined();
    expect(playCmd!.input).toBe(1);
  });

  it('pausePlayback() odświeża stan i wysyła Pause na activeInput', async () => {
    await sender.pausePlayback();
    expect(senderAny.httpGet).toHaveBeenCalledWith('/api/');
    const pauseCmd = commands.find(c => c.function === 'Pause');
    expect(pauseCmd).toBeDefined();
    expect(pauseCmd!.input).toBe(1);
  });

  it('nextInput() przeskakuje na następny input (CUT)', async () => {
    await sender.nextInput();
    expect(senderAny.httpGet).toHaveBeenCalledWith('/api/');
    // activeInput=1, następny to 2 → PreviewInput(2) + Cut(2)
    const cutCmd = commands.find(c => c.function === 'Cut');
    expect(cutCmd).toBeDefined();
    expect(cutCmd!.input).toBe(2);
  });

  it('prevInput() na pierwszym inpucie nie wysyła komendy', async () => {
    await sender.prevInput();
    // activeInput=1 to pierwszy → brak Cut
    const cutCmd = commands.find(c => c.function === 'Cut');
    expect(cutCmd).toBeUndefined();
  });

  it('prevInput() przeskakuje na poprzedni input gdy nie na pierwszym', async () => {
    // Zmień XML żeby activeInput = 2
    const mockXml2 = `<?xml version="1.0" encoding="UTF-8"?>
<vmix>
  <version>27.0.0</version>
  <inputs>
    <input key="abc" number="1" type="Video" title="Camera 1" state="Running" position="0" duration="0" loop="false" muted="false" volume="100" audiobusses="M">Camera 1</input>
    <input key="def" number="2" type="Video" title="Camera 2" state="Running" position="0" duration="0" loop="false" muted="false" volume="100" audiobusses="M">Camera 2</input>
  </inputs>
  <active>2</active>
  <preview>1</preview>
  <streaming>False</streaming>
  <recording>False</recording>
</vmix>`;
    senderAny.httpGet = vi.fn().mockResolvedValue(mockXml2);

    await sender.prevInput();
    const cutCmd = commands.find(c => c.function === 'Cut');
    expect(cutCmd).toBeDefined();
    expect(cutCmd!.input).toBe(1);
  });

  it('resumePlayback() z rozłączonym vMix nie wysyła komendy', async () => {
    senderAny._connected = false;
    await sender.resumePlayback();
    // refreshState zwraca null gdy !_connected
    const playCmd = commands.find(c => c.function === 'Play');
    expect(playCmd).toBeUndefined();
  });
});
