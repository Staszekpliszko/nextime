import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock electron IPC ─────────────────────────────────────
const ipcHandlers: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers[channel] = handler;
    },
  },
  ipcRenderer: {
    invoke: vi.fn(),
  },
}));

// ── Testy IPC switcher-ipc ─────────────────────────────────

describe('switcher-ipc — zunifikowany status switchera', () => {
  let registerSwitcherIpcHandlers: typeof import('../../electron/ipc/switcher-ipc').registerSwitcherIpcHandlers;
  type UnifiedSwitcherStatus = import('../../electron/ipc/switcher-ipc').UnifiedSwitcherStatus;

  beforeEach(async () => {
    // Wyczyść handlery
    for (const key of Object.keys(ipcHandlers)) {
      delete ipcHandlers[key];
    }

    // Import po mockach
    const mod = await import('../../electron/ipc/switcher-ipc');
    registerSwitcherIpcHandlers = mod.registerSwitcherIpcHandlers;
  });

  // Helpery
  function createMockSenderManager(overrides: {
    atemStatus?: Record<string, unknown>;
    obsStatus?: Record<string, unknown>;
    vmixStatus?: Record<string, unknown>;
  } = {}) {
    return {
      atem: {
        getStatus: () => ({
          connected: false,
          programInput: null,
          previewInput: null,
          modelName: null,
          ip: '192.168.10.240',
          meIndex: 0,
          autoSwitch: true,
          ...overrides.atemStatus,
        }),
        setPreview: vi.fn(),
        performCut: vi.fn(),
      },
      obs: {
        getStatus: () => ({
          connected: false,
          currentScene: null,
          previewScene: null,
          scenes: [] as string[],
          studioMode: false,
          ip: '127.0.0.1',
          port: 4455,
          ...overrides.obsStatus,
        }),
        setPreviewScene: vi.fn().mockResolvedValue(undefined),
        setScene: vi.fn().mockResolvedValue(undefined),
      },
      vmix: {
        getStatus: () => ({
          connected: false,
          activeInput: null,
          previewInput: null,
          inputs: [],
          streaming: false,
          recording: false,
          version: '',
          ip: '127.0.0.1',
          port: 8088,
          ...overrides.vmixStatus,
        }),
        setPreview: vi.fn().mockResolvedValue(undefined),
        cut: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as import('../../electron/senders/index').SenderManager;
  }

  function createMockSettingsManager(targetSwitcher: 'atem' | 'obs' | 'vmix' | 'none' = 'none') {
    return {
      getSection: (section: string) => {
        if (section === 'vision') return { targetSwitcher };
        return {};
      },
    } as unknown as import('../../electron/settings-manager').SettingsManager;
  }

  it('zwraca status none gdy brak aktywnego switchera', () => {
    const sm = createMockSenderManager();
    const settings = createMockSettingsManager('none');
    registerSwitcherIpcHandlers(sm, settings);

    const handler = ipcHandlers['nextime:switcherGetStatus'];
    expect(handler).toBeDefined();

    const result = handler!() as UnifiedSwitcherStatus;
    expect(result.switcherType).toBe('none');
    expect(result.connected).toBe(false);
    expect(result.programInput).toBeNull();
    expect(result.inputs).toHaveLength(0);
  });

  it('zwraca zunifikowany status ATEM z PGM/PRV', () => {
    const sm = createMockSenderManager({
      atemStatus: { connected: true, programInput: 3, previewInput: 5, modelName: 'ATEM Mini Pro' },
    });
    const settings = createMockSettingsManager('atem');
    registerSwitcherIpcHandlers(sm, settings);

    const result = ipcHandlers['nextime:switcherGetStatus']!() as UnifiedSwitcherStatus;
    expect(result.switcherType).toBe('atem');
    expect(result.connected).toBe(true);
    expect(result.programInput).toBe('3');
    expect(result.previewInput).toBe('5');
    expect(result.programNumber).toBe(3);
    expect(result.previewNumber).toBe(5);
    expect(result.modelName).toBe('ATEM Mini Pro');
    expect(result.inputs.length).toBe(8);
  });

  it('zwraca zunifikowany status OBS z scenami', () => {
    const sm = createMockSenderManager({
      obsStatus: {
        connected: true,
        currentScene: 'Kamera Wide',
        previewScene: 'Close-up',
        scenes: ['Kamera Wide', 'Close-up', 'Grafika'],
        studioMode: true,
      },
    });
    const settings = createMockSettingsManager('obs');
    registerSwitcherIpcHandlers(sm, settings);

    const result = ipcHandlers['nextime:switcherGetStatus']!() as UnifiedSwitcherStatus;
    expect(result.switcherType).toBe('obs');
    expect(result.connected).toBe(true);
    expect(result.programInput).toBe('Kamera Wide');
    expect(result.previewInput).toBe('Close-up');
    expect(result.inputs.length).toBe(3);
    expect(result.inputs[0]!.label).toBe('Kamera Wide');
    expect(result.modelName).toBe('OBS (Studio Mode)');
  });

  it('zwraca zunifikowany status vMix z inputami', () => {
    const sm = createMockSenderManager({
      vmixStatus: {
        connected: true,
        activeInput: 2,
        previewInput: 4,
        inputs: [
          { number: 1, title: 'Kamera 1', type: 'Camera', state: '', position: 0, duration: 0, loop: false, muted: false, volume: 100, audioBusses: '' },
          { number: 2, title: 'Kamera 2', type: 'Camera', state: '', position: 0, duration: 0, loop: false, muted: false, volume: 100, audioBusses: '' },
          { number: 3, title: 'Grafika', type: 'Image', state: '', position: 0, duration: 0, loop: false, muted: false, volume: 100, audioBusses: '' },
          { number: 4, title: 'Film', type: 'Video', state: '', position: 0, duration: 0, loop: false, muted: false, volume: 100, audioBusses: '' },
        ],
        version: '27',
      },
    });
    const settings = createMockSettingsManager('vmix');
    registerSwitcherIpcHandlers(sm, settings);

    const result = ipcHandlers['nextime:switcherGetStatus']!() as UnifiedSwitcherStatus;
    expect(result.switcherType).toBe('vmix');
    expect(result.connected).toBe(true);
    expect(result.programInput).toBe('2');
    expect(result.previewInput).toBe('4');
    expect(result.programNumber).toBe(2);
    expect(result.previewNumber).toBe(4);
    expect(result.inputs.length).toBe(4);
    expect(result.inputs[0]!.label).toBe('Kamera 1');
    expect(result.modelName).toBe('vMix 27');
  });

  it('switcherSetPreview wywołuje ATEM setPreview', async () => {
    const sm = createMockSenderManager({
      atemStatus: { connected: true, programInput: 1, previewInput: 2 },
    });
    const settings = createMockSettingsManager('atem');
    registerSwitcherIpcHandlers(sm, settings);

    const result = await ipcHandlers['nextime:switcherSetPreview']!({}, '5') as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(sm.atem.setPreview).toHaveBeenCalledWith(5);
  });

  it('switcherCut wywołuje ATEM performCut', async () => {
    const sm = createMockSenderManager({
      atemStatus: { connected: true, programInput: 1, previewInput: 2 },
    });
    const settings = createMockSettingsManager('atem');
    registerSwitcherIpcHandlers(sm, settings);

    const result = await ipcHandlers['nextime:switcherCut']!({}, '3') as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(sm.atem.performCut).toHaveBeenCalledWith(3);
  });

  it('switcherSetPreview wywołuje OBS setPreviewScene', async () => {
    const sm = createMockSenderManager({
      obsStatus: { connected: true, currentScene: 'A', scenes: ['A', 'B'] },
    });
    const settings = createMockSettingsManager('obs');
    registerSwitcherIpcHandlers(sm, settings);

    const result = await ipcHandlers['nextime:switcherSetPreview']!({}, 'B') as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(sm.obs.setPreviewScene).toHaveBeenCalledWith('B');
  });

  it('switcherCut wywołuje OBS setScene', async () => {
    const sm = createMockSenderManager({
      obsStatus: { connected: true, currentScene: 'A', scenes: ['A', 'B'] },
    });
    const settings = createMockSettingsManager('obs');
    registerSwitcherIpcHandlers(sm, settings);

    const result = await ipcHandlers['nextime:switcherCut']!({}, 'B') as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(sm.obs.setScene).toHaveBeenCalledWith('B');
  });

  it('switcherCut zwraca error gdy brak switchera', async () => {
    const sm = createMockSenderManager();
    const settings = createMockSettingsManager('none');
    registerSwitcherIpcHandlers(sm, settings);

    const result = await ipcHandlers['nextime:switcherCut']!({}, '1') as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Brak');
  });

  it('switcherSetPreview wywołuje vMix setPreview', async () => {
    const sm = createMockSenderManager({
      vmixStatus: { connected: true, activeInput: 1, previewInput: 2, inputs: [] },
    });
    const settings = createMockSettingsManager('vmix');
    registerSwitcherIpcHandlers(sm, settings);

    const result = await ipcHandlers['nextime:switcherSetPreview']!({}, '4') as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(sm.vmix.setPreview).toHaveBeenCalledWith(4);
  });
});
