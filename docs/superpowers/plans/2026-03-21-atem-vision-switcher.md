# Faza 8 — ATEM Vision Switcher Integration

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integracja z BlackMagic ATEM switcher — automatyczne przełączanie kamer przy zmianie vision cue, status połączenia w UI, konfiguracja IP/ME, manual override.

**Architecture:** AtemSender (placeholder bez atem-connection npm, z interfejsem kompatybilnym) nasłuchuje na event `vision-cue-changed` z PlaybackEngine. Konfiguracja ATEM przechowywana w SenderManager. UI pokazuje status połączenia i pozwala na ręczne przełączanie. Cały moduł ATEM działa w main process (Node.js).

**Tech Stack:** TypeScript strict, EventEmitter, placeholder TCP connection (gotowy do podpięcia `atem-connection` npm w przyszłości), Zustand store, React components.

---

## File Structure

| Plik | Rola | Akcja |
|------|------|-------|
| `electron/senders/atem-sender.ts` | AtemSender — placeholder z interfejsem ATEM | **CREATE** |
| `electron/senders/index.ts` | SenderManager — dodanie AtemSender | **MODIFY** |
| `electron/main.ts` | IPC handlers: ATEM config/status/manual cut | **MODIFY** |
| `electron/preload.ts` | Nowe metody: atemGetStatus, atemConfigure, atemCut, atemPreview | **MODIFY** |
| `electron/ws-server.ts` | Nowe eventy: `atem:status`, nowa komenda `cmd:atem_cut` | **MODIFY** |
| `src/types/electron.d.ts` | Typy NextimeApi: ATEM metody | **MODIFY** |
| `src/store/playback.store.ts` | Nowe pola: atemConnected, atemPgm, atemPvw, atemAutoSwitch | **MODIFY** |
| `src/hooks/useRundownSocket.ts` | Handler: `atem:status` event | **MODIFY** |
| `src/components/TransportBar/TransportBar.tsx` | Wskaźnik ATEM connected/disconnected | **MODIFY** |
| `src/components/AtemPanel/AtemPanel.tsx` | Dialog konfiguracji ATEM (IP, ME, auto-switch) | **CREATE** |
| `src/App.tsx` | Przycisk ATEM settings, integracja AtemPanel | **MODIFY** |
| `tests/unit/atem-sender.test.ts` | Testy AtemSender | **CREATE** |

---

## Chunk 1: AtemSender (backend)

### Task 1: AtemSender — placeholder z interfejsem kompatybilnym

**Files:**
- Create: `electron/senders/atem-sender.ts`
- Test: `tests/unit/atem-sender.test.ts`

- [ ] **Step 1: Napisz plik `electron/senders/atem-sender.ts`**

Wzoruj się na `osc-sender.ts` — ten sam pattern (config, attach, destroy, handleTrigger).

**UWAGA architektoniczna:** AtemSender extends EventEmitter — w odróżnieniu od innych senderów
(OscSender, MidiSender itd. są plain classes). Uzasadnienie: ATEM ma lifecycle events
(connected/disconnected, program-changed, preview-changed) potrzebne do broadcastu
statusu w UI przez IPC/WS. Callback `onCommand` zachowuje pattern testowy z innych senderów.

```typescript
import { EventEmitter } from 'events';

// ── Typy ────────────────────────────────────────────────

export interface AtemSenderConfig {
  /** Adres IP ATEM switchera (domyślnie: '192.168.10.240') */
  ip: string;
  /** ME (Mix Effect) bus number: 0-3 (domyślnie: 0) */
  meIndex: number;
  /** Czy auto-switch na vision cue change jest włączony */
  autoSwitch: boolean;
  /** Typ tranzycji: 'cut' | 'mix' (domyślnie: 'cut') */
  transitionType: 'cut' | 'mix';
  /** Czas tranzycji mix w klatkach (domyślnie: 25 = 1s @ 25fps) */
  mixDurationFrames: number;
  /** Czy sender jest aktywny */
  enabled: boolean;
}

/** Stan połączenia ATEM */
export interface AtemStatus {
  connected: boolean;
  /** Aktualny source na Program output */
  programInput: number | null;
  /** Aktualny source na Preview output */
  previewInput: number | null;
  /** Model switchera (jeśli podłączony) */
  modelName: string | null;
  /** IP z konfiga */
  ip: string;
  /** ME index z konfiga */
  meIndex: number;
  /** Auto-switch aktywny */
  autoSwitch: boolean;
}

/** Lokalna podzbiór danych vision cue — osobna nazwa, żeby nie kolidować z docs/types.ts VisionCueData */
interface AtemVisionPayload {
  camera_number?: number;
  shot_name?: string;
  color?: string;
}

// ── AtemSender ───────────────────────────────────────────

const DEFAULT_CONFIG: AtemSenderConfig = {
  ip: '192.168.10.240',
  meIndex: 0,
  autoSwitch: true,
  transitionType: 'cut',
  mixDurationFrames: 25,
  enabled: true,
};

/**
 * Kontroluje BlackMagic ATEM switcher w odpowiedzi na vision cue changes.
 *
 * PLACEHOLDER: Nie używa prawdziwego atem-connection npm.
 * Symuluje połączenie i loguje komendy do konsoli.
 * Interfejs jest kompatybilny — podpięcie prawdziwego ATEM to zamiana
 * metod connect/disconnect/performCut/performMix.
 *
 * Callback `onCommand` pozwala testom przechwytywać komendy.
 */
export class AtemSender extends EventEmitter {
  private config: AtemSenderConfig;
  private _connected = false;
  private _programInput: number | null = null;
  private _previewInput: number | null = null;
  private _modelName: string | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Callback do przechwytywania komend (testy + przyszła integracja) */
  onCommand: ((cmd: { type: string; input?: number; me?: number; duration?: number }) => void) | null = null;

  constructor(config: Partial<AtemSenderConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Podpina się do engine — nasłuchuje na 'vision-cue-changed' (engine emituje 2 argumenty: active, next) */
  attach(engine: EventEmitter): void {
    engine.on('vision-cue-changed', (activeCue: { data: Record<string, unknown> } | null, _nextCue: unknown) => {
      this.handleVisionCueChanged(activeCue);
    });
    console.log('[AtemSender] Podpięty do engine (vision-cue-changed)');
  }

  /** Łączy się z ATEM (placeholder — natychmiastowe "połączenie") */
  connect(): void {
    if (!this.config.enabled) return;
    console.log(`[AtemSender] Łączę z ATEM: ${this.config.ip} (ME${this.config.meIndex})...`);

    // Placeholder: symulowane połączenie
    this._connected = true;
    this._modelName = 'ATEM Placeholder';
    this._programInput = 1;
    this._previewInput = 2;
    this.emit('connected');
    console.log(`[AtemSender] Połączono z ATEM (placeholder)`);
  }

  /** Rozłącza się z ATEM */
  disconnect(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._connected = false;
    this._programInput = null;
    this._previewInput = null;
    this._modelName = null;
    this.emit('disconnected');
    console.log('[AtemSender] Rozłączono z ATEM');
  }

  /** Obsługuje zmianę vision cue — auto-switch do kamery */
  handleVisionCueChanged(activeCue: { data: Record<string, unknown> } | null): void {
    if (!this.config.enabled || !this.config.autoSwitch || !this._connected) return;
    if (!activeCue) return;

    const data = activeCue.data as Partial<AtemVisionPayload>;
    const cameraNumber = data.camera_number;
    if (cameraNumber === undefined || cameraNumber === null) return;

    // Mapuj camera_number na ATEM input (1:1 mapping)
    const atemInput = cameraNumber;

    if (atemInput === this._programInput) return; // już na programie

    if (this.config.transitionType === 'cut') {
      this.performCut(atemInput);
    } else {
      this.performMix(atemInput, this.config.mixDurationFrames);
    }
  }

  /** Wykonuje CUT do wskazanego inputu na danym ME */
  performCut(input: number): void {
    if (!this._connected) return;

    const prevPgm = this._programInput;
    // TODO: prawdziwy ATEM swap PGM<->PVW — placeholder ustawia oba na ten sam input
    this._previewInput = input;
    this._programInput = input;

    const cmd = { type: 'cut', input, me: this.config.meIndex };
    if (this.onCommand) this.onCommand(cmd);

    this.emit('program-changed', { input, me: this.config.meIndex });
    console.log(`[AtemSender] CUT → Input ${input} (ME${this.config.meIndex}) [prev: ${prevPgm}]`);
  }

  /** Wykonuje MIX (auto transition) do wskazanego inputu */
  performMix(input: number, durationFrames: number): void {
    if (!this._connected) return;

    this._previewInput = input;

    const cmd = { type: 'mix', input, me: this.config.meIndex, duration: durationFrames };
    if (this.onCommand) this.onCommand(cmd);

    // Placeholder: natychmiastowy switch (prawdziwy ATEM robi auto transition)
    this._programInput = input;

    this.emit('program-changed', { input, me: this.config.meIndex });
    console.log(`[AtemSender] MIX → Input ${input} (${durationFrames} frames, ME${this.config.meIndex})`);
  }

  /** Ręczne ustawienie Preview inputu */
  setPreview(input: number): void {
    if (!this._connected) return;
    this._previewInput = input;

    const cmd = { type: 'preview', input, me: this.config.meIndex };
    if (this.onCommand) this.onCommand(cmd);

    this.emit('preview-changed', { input, me: this.config.meIndex });
    console.log(`[AtemSender] PREVIEW → Input ${input} (ME${this.config.meIndex})`);
  }

  /** Zwraca aktualny status ATEM */
  getStatus(): AtemStatus {
    return {
      connected: this._connected,
      programInput: this._programInput,
      previewInput: this._previewInput,
      modelName: this._modelName,
      ip: this.config.ip,
      meIndex: this.config.meIndex,
      autoSwitch: this.config.autoSwitch,
    };
  }

  /** Aktualizuje konfigurację w runtime */
  updateConfig(config: Partial<AtemSenderConfig>): void {
    const wasConnected = this._connected;
    const ipChanged = config.ip !== undefined && config.ip !== this.config.ip;

    this.config = { ...this.config, ...config };

    // Jeśli zmienił się IP i byliśmy połączeni — reconnect
    if (ipChanged && wasConnected) {
      this.disconnect();
      this.connect();
    }
  }

  /** Zwraca aktualną konfigurację */
  getConfig(): AtemSenderConfig {
    return { ...this.config };
  }

  /** Cleanup */
  destroy(): void {
    this.disconnect();
    this.onCommand = null;
    this.removeAllListeners();
  }
}
```

- [ ] **Step 2: Napisz testy `tests/unit/atem-sender.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { AtemSender } from '../../electron/senders/atem-sender';

describe('AtemSender', () => {
  let sender: AtemSender;
  let engine: EventEmitter;

  beforeEach(() => {
    sender = new AtemSender({ enabled: true, ip: '192.168.10.240', meIndex: 0, autoSwitch: true });
    engine = new EventEmitter();
  });

  afterEach(() => {
    sender.destroy();
  });

  // ── Połączenie ──────────────────────────────────────────

  it('powinno połączyć się z ATEM (placeholder)', () => {
    sender.connect();
    const status = sender.getStatus();
    expect(status.connected).toBe(true);
    expect(status.modelName).toBe('ATEM Placeholder');
    expect(status.programInput).toBe(1);
    expect(status.previewInput).toBe(2);
  });

  it('powinno emitować event connected', () => {
    const spy = vi.fn();
    sender.on('connected', spy);
    sender.connect();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('powinno rozłączyć się z ATEM', () => {
    sender.connect();
    sender.disconnect();
    const status = sender.getStatus();
    expect(status.connected).toBe(false);
    expect(status.programInput).toBeNull();
    expect(status.previewInput).toBeNull();
    expect(status.modelName).toBeNull();
  });

  it('powinno emitować event disconnected', () => {
    sender.connect();
    const spy = vi.fn();
    sender.on('disconnected', spy);
    sender.disconnect();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('powinno nie łączyć gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    sender.connect();
    expect(sender.getStatus().connected).toBe(false);
  });

  // ── Auto-switch ─────────────────────────────────────────

  it('powinno wykonać CUT przy zmianie vision cue (auto-switch)', () => {
    const commands: Array<{ type: string; input?: number }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.handleVisionCueChanged({
      data: { camera_number: 3, shot_name: 'MCU', color: '#3b82f6' },
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({ type: 'cut', input: 3, me: 0 });
    expect(sender.getStatus().programInput).toBe(3);
  });

  it('powinno ignorować gdy auto-switch wyłączony', () => {
    sender.updateConfig({ autoSwitch: false });
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.handleVisionCueChanged({
      data: { camera_number: 3 },
    });

    expect(commands).toHaveLength(0);
  });

  it('powinno ignorować gdy nie połączony', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);

    sender.handleVisionCueChanged({
      data: { camera_number: 3 },
    });

    expect(commands).toHaveLength(0);
  });

  it('powinno ignorować gdy activeCue jest null', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.handleVisionCueChanged(null);

    expect(commands).toHaveLength(0);
  });

  it('powinno ignorować gdy camera_number brak w danych', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.handleVisionCueChanged({ data: { shot_name: 'MCU' } });

    expect(commands).toHaveLength(0);
  });

  it('powinno nie przełączać gdy input jest już na programie', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();
    // Program startuje na 1
    sender.handleVisionCueChanged({ data: { camera_number: 1 } });

    expect(commands).toHaveLength(0);
  });

  it('powinno wykonać MIX gdy transitionType=mix', () => {
    sender.updateConfig({ transitionType: 'mix', mixDurationFrames: 12 });
    const commands: Array<{ type: string; input?: number; duration?: number }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.handleVisionCueChanged({ data: { camera_number: 5 } });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({ type: 'mix', input: 5, me: 0, duration: 12 });
  });

  it('powinno reagować na vision-cue-changed z engine (attach)', () => {
    const commands: Array<{ type: string; input?: number }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.attach(engine);
    sender.connect();

    engine.emit('vision-cue-changed', {
      id: 'vc-1',
      data: { camera_number: 4, shot_name: 'WS' },
    }, null);

    expect(commands).toHaveLength(1);
    expect(commands[0]!.input).toBe(4);
  });

  // ── Guards when disconnected ──────────────────────────────

  it('performCut powinno być no-op gdy niepołączony', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    // NIE wywołujemy connect()
    sender.performCut(3);
    expect(commands).toHaveLength(0);
  });

  it('performMix powinno być no-op gdy niepołączony', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.performMix(3, 25);
    expect(commands).toHaveLength(0);
  });

  it('setPreview powinno być no-op gdy niepołączony', () => {
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.setPreview(3);
    expect(commands).toHaveLength(0);
  });

  // ── Manual override ──────────────────────────────────────

  it('powinno performCut ręcznie', () => {
    const commands: Array<{ type: string; input?: number }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.performCut(7);

    expect(commands).toEqual([{ type: 'cut', input: 7, me: 0 }]);
    expect(sender.getStatus().programInput).toBe(7);
  });

  it('powinno setPreview ręcznie', () => {
    const commands: Array<{ type: string; input?: number }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect();

    sender.setPreview(6);

    expect(commands).toEqual([{ type: 'preview', input: 6, me: 0 }]);
    expect(sender.getStatus().previewInput).toBe(6);
  });

  it('powinno emitować program-changed event', () => {
    sender.connect();
    const spy = vi.fn();
    sender.on('program-changed', spy);

    sender.performCut(5);

    expect(spy).toHaveBeenCalledWith({ input: 5, me: 0 });
  });

  // ── Konfiguracja ────────────────────────────────────────

  it('powinno zwracać status z konfiguracji', () => {
    sender.updateConfig({ ip: '10.0.0.1', meIndex: 2 });
    const status = sender.getStatus();
    expect(status.ip).toBe('10.0.0.1');
    expect(status.meIndex).toBe(2);
  });

  it('powinno reconnect przy zmianie IP (gdy połączony)', () => {
    sender.connect();
    expect(sender.getStatus().connected).toBe(true);

    const connectedSpy = vi.fn();
    sender.on('connected', connectedSpy);

    sender.updateConfig({ ip: '10.0.0.2' });

    expect(connectedSpy).toHaveBeenCalledTimes(1);
    expect(sender.getStatus().ip).toBe('10.0.0.2');
    expect(sender.getStatus().connected).toBe(true);
  });

  it('powinno nie reconnectować przy zmianie meIndex', () => {
    sender.connect();
    const disconnectedSpy = vi.fn();
    sender.on('disconnected', disconnectedSpy);

    sender.updateConfig({ meIndex: 2 });

    expect(disconnectedSpy).not.toHaveBeenCalled();
    expect(sender.getConfig().meIndex).toBe(2);
  });

  // ── Disabled ─────────────────────────────────────────────

  it('powinno ignorować trigger gdy disabled', () => {
    sender.updateConfig({ enabled: false });
    const commands: Array<{ type: string }> = [];
    sender.onCommand = (cmd) => commands.push(cmd);
    sender.connect(); // nie połączy się bo disabled

    sender.handleVisionCueChanged({ data: { camera_number: 3 } });

    expect(commands).toHaveLength(0);
  });

  // ── Destroy ──────────────────────────────────────────────

  it('powinno poprawnie zniszczyć sendera', () => {
    sender.connect();
    sender.destroy();
    expect(sender.getStatus().connected).toBe(false);
    expect(sender.onCommand).toBeNull();
  });

  // ── SenderManager integracja ────────────────────────────

  it('powinno działać z SenderManager', async () => {
    // Importuj dynamicznie, żeby test był niezależny
    const { SenderManager } = await import('../../electron/senders');
    const manager = new SenderManager();
    expect(manager.atem).toBeDefined();
    expect(manager.atem.getStatus().connected).toBe(false);
    manager.destroy();
  });
});
```

- [ ] **Step 3: Uruchom testy żeby zweryfikować że failują (brak implementacji w SenderManager)**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime && npx vitest run tests/unit/atem-sender.test.ts
```

Expected: większość testów PASS (AtemSender istnieje), ostatni test FAIL (SenderManager nie ma jeszcze `atem`)

- [ ] **Step 4: Zaktualizuj `electron/senders/index.ts` — dodaj AtemSender do SenderManager**

W pliku `electron/senders/index.ts`:

1. Dodaj import:
```typescript
import { AtemSender } from './atem-sender';
import type { AtemSenderConfig, AtemStatus } from './atem-sender';
```

2. Dodaj re-export:
```typescript
export { OscSender, MidiSender, GpiSender, MediaSender, AtemSender };
export type { OscSenderConfig, MidiSenderConfig, GpiSenderConfig, MediaSenderConfig, AtemSenderConfig, AtemStatus };
```

3. Rozszerz `SenderManagerConfig`:
```typescript
export interface SenderManagerConfig {
  osc?: Partial<OscSenderConfig>;
  midi?: Partial<MidiSenderConfig>;
  gpi?: Partial<GpiSenderConfig>;
  media?: Partial<MediaSenderConfig>;
  atem?: Partial<AtemSenderConfig>;
}
```

4. Dodaj `atem` do klasy `SenderManager`:
```typescript
readonly atem: AtemSender;
```

5. W konstruktorze:
```typescript
this.atem = new AtemSender(config.atem);
```

6. W `attach()`:
```typescript
this.atem.attach(engine);
```

7. W `destroy()`:
```typescript
this.atem.destroy();
```

- [ ] **Step 5: Uruchom testy ponownie — wszystkie powinny PASS**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime && npx vitest run tests/unit/atem-sender.test.ts
```

Expected: ALL PASS

- [ ] **Step 6: Sprawdź TypeScript**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime && npx tsc --noEmit
```

Expected: zero błędów

- [ ] **Step 7: Commit**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime
git add electron/senders/atem-sender.ts electron/senders/index.ts tests/unit/atem-sender.test.ts
git commit -m "feat(phase-8): AtemSender placeholder + SenderManager integration + 20 testów"
```

---

## Chunk 2: WS Server + IPC + Store (full stack wiring)

### Task 2: WS Server — nowe eventy ATEM + komendy

**Files:**
- Modify: `electron/ws-server.ts`

- [ ] **Step 1: Dodaj nowe komendy C→S do `handleMessage()` w `electron/ws-server.ts`**

Po istniejącym `case 'cmd:take_shot':` dodaj:

```typescript
case 'cmd:atem_cut': {
  this.handleCommand(session, msg, () => {
    const input = msg.payload?.input as number;
    if (input === undefined) throw new Error('Missing input');
    // Bezpośredni dostęp do sendera przez publiczną referencję
    this.onAtemCut?.(input);
  });
  break;
}
case 'cmd:atem_preview': {
  this.handleCommand(session, msg, () => {
    const input = msg.payload?.input as number;
    if (input === undefined) throw new Error('Missing input');
    this.onAtemPreview?.(input);
  });
  break;
}
```

Dodaj nowe publiczne callbacki na klasie (przed `start()`):

```typescript
/** Callback: ręczny ATEM CUT z klienta WS */
onAtemCut: ((input: number) => void) | null = null;
/** Callback: ręczny ATEM PREVIEW z klienta WS */
onAtemPreview: ((input: number) => void) | null = null;
```

Dodaj publiczną metodę do broadcastu statusu ATEM:

```typescript
/** Broadcast statusu ATEM do wszystkich klientów */
broadcastAtemStatus(status: { connected: boolean; programInput: number | null; previewInput: number | null; modelName: string | null }): void {
  this.broadcast('atem:status', status);
}
```

- [ ] **Step 2: Sprawdź TypeScript**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime && npx tsc --noEmit
```

### Task 3: IPC handlers + Preload — ATEM API

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`

- [ ] **Step 1: Dodaj IPC handlery ATEM w `electron/main.ts`**

Po sekcji `registerIpcHandlers()`, po handlerach TimelineCue, dodaj:

```typescript
// ── ATEM ────────────────────────────────────────────────

ipcMain.handle('nextime:atemGetStatus', () => {
  return senderManager?.atem.getStatus() ?? {
    connected: false, programInput: null, previewInput: null,
    modelName: null, ip: '192.168.10.240', meIndex: 0, autoSwitch: true,
  };
});

ipcMain.handle('nextime:atemConfigure', (_event, config: Record<string, unknown>) => {
  if (!senderManager) return;
  senderManager.atem.updateConfig(config as Partial<import('./senders/atem-sender').AtemSenderConfig>);
});

ipcMain.handle('nextime:atemConnect', () => {
  senderManager?.atem.connect();
});

ipcMain.handle('nextime:atemDisconnect', () => {
  senderManager?.atem.disconnect();
});

ipcMain.handle('nextime:atemCut', (_event, input: number) => {
  senderManager?.atem.performCut(input);
});

ipcMain.handle('nextime:atemPreview', (_event, input: number) => {
  senderManager?.atem.setPreview(input);
});
```

W `initServices()`, po `senderManager.attach(engine);`, dodaj wiring ATEM events:

```typescript
// 7. ATEM event wiring — broadcast statusu do WS klientów
senderManager.atem.on('connected', () => {
  wsServer?.broadcastAtemStatus(senderManager!.atem.getStatus());
});
senderManager.atem.on('disconnected', () => {
  wsServer?.broadcastAtemStatus(senderManager!.atem.getStatus());
});
senderManager.atem.on('program-changed', () => {
  wsServer?.broadcastAtemStatus(senderManager!.atem.getStatus());
});
senderManager.atem.on('preview-changed', () => {
  wsServer?.broadcastAtemStatus(senderManager!.atem.getStatus());
});

// WS komendy → ATEM
if (wsServer) {
  wsServer.onAtemCut = (input: number) => senderManager!.atem.performCut(input);
  wsServer.onAtemPreview = (input: number) => senderManager!.atem.setPreview(input);
}
```

- [ ] **Step 2: Rozszerz `electron/preload.ts` o metody ATEM**

Dodaj na końcu obiektu `nextime`:

```typescript
// ── ATEM ────────────────────────────────────────────────
/** Pobiera status ATEM */
atemGetStatus: (): Promise<unknown> =>
  ipcRenderer.invoke('nextime:atemGetStatus'),

/** Konfiguruje ATEM */
atemConfigure: (config: Record<string, unknown>): Promise<void> =>
  ipcRenderer.invoke('nextime:atemConfigure', config),

/** Łączy z ATEM */
atemConnect: (): Promise<void> =>
  ipcRenderer.invoke('nextime:atemConnect'),

/** Rozłącza ATEM */
atemDisconnect: (): Promise<void> =>
  ipcRenderer.invoke('nextime:atemDisconnect'),

/** Ręczny CUT na ATEM */
atemCut: (input: number): Promise<void> =>
  ipcRenderer.invoke('nextime:atemCut', input),

/** Ręczny PREVIEW na ATEM */
atemPreview: (input: number): Promise<void> =>
  ipcRenderer.invoke('nextime:atemPreview', input),
```

- [ ] **Step 3: Rozszerz `src/types/electron.d.ts` o typy ATEM**

Dodaj interfejs `AtemStatus`:

```typescript
import type { AtemStatus } from '../../electron/senders/atem-sender';
```

Dodaj metody do `NextimeApi`:

```typescript
// ── ATEM ────────────────────────────────────────────────
atemGetStatus(): Promise<AtemStatus>;
atemConfigure(config: Record<string, unknown>): Promise<void>;
atemConnect(): Promise<void>;
atemDisconnect(): Promise<void>;
atemCut(input: number): Promise<void>;
atemPreview(input: number): Promise<void>;
```

- [ ] **Step 4: Sprawdź TypeScript**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime
git add electron/main.ts electron/ws-server.ts electron/preload.ts src/types/electron.d.ts
git commit -m "feat(phase-8): ATEM IPC handlers, WS komendy, preload API"
```

### Task 4: Zustand store — stan ATEM

**Files:**
- Modify: `src/store/playback.store.ts`

- [ ] **Step 1: Dodaj nowe pola i akcje ATEM do store**

Nowe pola w `PlaybackState`:

```typescript
// Faza 8: ATEM state
atemConnected: boolean;
atemProgramInput: number | null;
atemPreviewInput: number | null;
atemAutoSwitch: boolean;
atemModelName: string | null;
```

Nowe akcje:

```typescript
// Actions — Faza 8: ATEM
setAtemStatus: (status: { connected: boolean; programInput: number | null; previewInput: number | null; modelName: string | null }) => void;
setAtemAutoSwitch: (v: boolean) => void;
```

Wartości początkowe:

```typescript
atemConnected: false,
atemProgramInput: null,
atemPreviewInput: null,
atemAutoSwitch: true,
atemModelName: null,
```

Implementacje akcji:

```typescript
setAtemStatus: (status) => set({
  atemConnected: status.connected,
  atemProgramInput: status.programInput,
  atemPreviewInput: status.previewInput,
  atemModelName: status.modelName,
}),
setAtemAutoSwitch: (v) => set({ atemAutoSwitch: v }),
```

- [ ] **Step 2: Dodaj handler `atem:status` do `src/hooks/useRundownSocket.ts`**

W `dispatch()` switch, po `case 'act:cue_executed':`, dodaj:

```typescript
case 'atem:status': {
  const ap = envelope.payload as {
    connected: boolean;
    programInput: number | null;
    previewInput: number | null;
    modelName: string | null;
  };
  usePlaybackStore.getState().setAtemStatus(ap);
  break;
}
```

- [ ] **Step 3: Sprawdź TypeScript**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime
git add src/store/playback.store.ts src/hooks/useRundownSocket.ts
git commit -m "feat(phase-8): ATEM state w Zustand store + WS handler atem:status"
```

---

## Chunk 3: UI (TransportBar + AtemPanel + App)

### Task 5: TransportBar — wskaźnik ATEM

**Files:**
- Modify: `src/components/TransportBar/TransportBar.tsx`

- [ ] **Step 1: Dodaj wskaźnik ATEM do TransportBar**

Na początku komponentu dodaj odczyt stanu ATEM ze store:

```typescript
const atemConnected = usePlaybackStore(s => s.atemConnected);
const atemProgramInput = usePlaybackStore(s => s.atemProgramInput);
```

Po sekcji `{/* Faza 6: Wskaźniki STEP / HOLD / Speed */}`, dodaj:

```typescript
{/* Faza 8: ATEM status */}
{isTimeline && (
  <div className="flex items-center gap-1.5">
    <div
      className={`w-2 h-2 rounded-full ${atemConnected ? 'bg-green-400' : 'bg-slate-600'}`}
      title={atemConnected ? 'ATEM Connected' : 'ATEM Disconnected'}
    />
    <span className={`text-[10px] font-bold uppercase ${atemConnected ? 'text-green-400' : 'text-slate-500'}`}>
      ATEM
    </span>
    {atemConnected && atemProgramInput !== null && (
      <span className="text-[10px] text-slate-300 font-mono">
        PGM:{atemProgramInput}
      </span>
    )}
  </div>
)}
```

- [ ] **Step 2: Sprawdź TypeScript**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime && npx tsc --noEmit
```

### Task 6: AtemPanel — dialog konfiguracji

**Files:**
- Create: `src/components/AtemPanel/AtemPanel.tsx`

- [ ] **Step 1: Utwórz `src/components/AtemPanel/AtemPanel.tsx`**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';

interface AtemPanelProps {
  onClose: () => void;
}

/** Panel konfiguracji ATEM — IP, ME, auto-switch, manual cut/preview */
export function AtemPanel({ onClose }: AtemPanelProps) {
  const atemConnected = usePlaybackStore(s => s.atemConnected);
  const atemProgramInput = usePlaybackStore(s => s.atemProgramInput);
  const atemPreviewInput = usePlaybackStore(s => s.atemPreviewInput);
  const atemModelName = usePlaybackStore(s => s.atemModelName);
  const atemAutoSwitch = usePlaybackStore(s => s.atemAutoSwitch);

  const [ip, setIp] = useState('192.168.10.240');
  const [meIndex, setMeIndex] = useState(0);
  const [autoSwitch, setAutoSwitch] = useState(true);
  const [transitionType, setTransitionType] = useState<'cut' | 'mix'>('cut');

  // Załaduj aktualny config z main process
  useEffect(() => {
    window.nextime.atemGetStatus().then((status) => {
      const s = status as { ip: string; meIndex: number; autoSwitch: boolean };
      setIp(s.ip);
      setMeIndex(s.meIndex);
      setAutoSwitch(s.autoSwitch);
    });
  }, []);

  const handleConnect = useCallback(async () => {
    await window.nextime.atemConfigure({ ip, meIndex, autoSwitch, transitionType });
    await window.nextime.atemConnect();
  }, [ip, meIndex, autoSwitch, transitionType]);

  const handleDisconnect = useCallback(async () => {
    await window.nextime.atemDisconnect();
  }, []);

  const handleSave = useCallback(async () => {
    await window.nextime.atemConfigure({ ip, meIndex, autoSwitch, transitionType });
    usePlaybackStore.getState().setAtemAutoSwitch(autoSwitch);
  }, [ip, meIndex, autoSwitch, transitionType]);

  const handleManualCut = useCallback(async (input: number) => {
    await window.nextime.atemCut(input);
  }, []);

  const handleManualPreview = useCallback(async (input: number) => {
    await window.nextime.atemPreview(input);
  }, []);

  // Zamknij na Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-200">ATEM Switcher</h3>
            <div
              className={`w-2 h-2 rounded-full ${atemConnected ? 'bg-green-400' : 'bg-red-500'}`}
            />
            <span className="text-[10px] text-slate-400">
              {atemConnected ? atemModelName ?? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">&times;</button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4">
          {/* Status programu/podglądu */}
          {atemConnected && (
            <div className="flex gap-4 bg-slate-900 rounded p-3">
              <div className="flex-1 text-center">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Program</div>
                <div className="text-2xl font-bold text-red-400 font-mono">
                  {atemProgramInput ?? '—'}
                </div>
              </div>
              <div className="w-px bg-slate-700" />
              <div className="flex-1 text-center">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Preview</div>
                <div className="text-2xl font-bold text-green-400 font-mono">
                  {atemPreviewInput ?? '—'}
                </div>
              </div>
            </div>
          )}

          {/* Konfiguracja */}
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 block mb-0.5">IP Address</label>
                <input
                  value={ip}
                  onChange={e => setIp(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                  placeholder="192.168.10.240"
                />
              </div>
              <div className="w-24">
                <label className="text-[10px] text-slate-500 block mb-0.5">ME Bus</label>
                <select
                  value={meIndex}
                  onChange={e => setMeIndex(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  {[0, 1, 2, 3].map(n => (
                    <option key={n} value={n}>ME {n + 1}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 block mb-0.5">Transition</label>
                <select
                  value={transitionType}
                  onChange={e => setTransitionType(e.target.value as 'cut' | 'mix')}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="cut">Cut</option>
                  <option value="mix">Mix (Auto)</option>
                </select>
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoSwitch}
                    onChange={e => setAutoSwitch(e.target.checked)}
                    className="rounded"
                  />
                  Auto-switch
                </label>
              </div>
            </div>
          </div>

          {/* Przyciski połączenia */}
          <div className="flex gap-2">
            {atemConnected ? (
              <button
                onClick={handleDisconnect}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-1.5 rounded font-medium"
              >
                Rozłącz
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-1.5 rounded font-medium"
              >
                Połącz
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-1.5 rounded font-medium"
            >
              Zapisz
            </button>
          </div>

          {/* Manual override — siatka kamer */}
          {atemConnected && (
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-2">Manual Override</div>
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
                  <div key={n} className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleManualCut(n)}
                      className={`px-2 py-1.5 rounded text-[10px] font-bold transition-colors ${
                        atemProgramInput === n
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      PGM {n}
                    </button>
                    <button
                      onClick={() => handleManualPreview(n)}
                      className={`px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                        atemPreviewInput === n
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      PVW {n}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Sprawdź TypeScript**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime && npx tsc --noEmit
```

### Task 7: App.tsx — integracja AtemPanel

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Przeczytaj aktualny `src/App.tsx`**

Przeczytaj plik i dodaj:

1. Import: `import { AtemPanel } from '@/components/AtemPanel/AtemPanel';`
2. Stan: `const [showAtemPanel, setShowAtemPanel] = useState(false);`
3. Odczyt ze store: `const atemConnected = usePlaybackStore(s => s.atemConnected);`
4. Przycisk ATEM w UI (w toolbar lub obok przełącznika Rundown/Timeline):

```typescript
{viewMode === 'timeline' && (
  <button
    onClick={() => setShowAtemPanel(true)}
    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
      atemConnected
        ? 'bg-green-600/20 text-green-400 border border-green-600/30'
        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
    }`}
  >
    ATEM {atemConnected ? 'ON' : 'OFF'}
  </button>
)}
```

5. Dialog (przed zamknięciem root div):
```typescript
{showAtemPanel && <AtemPanel onClose={() => setShowAtemPanel(false)} />}
```

- [ ] **Step 2: Sprawdź TypeScript**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime
git add src/components/TransportBar/TransportBar.tsx src/components/AtemPanel/AtemPanel.tsx src/App.tsx
git commit -m "feat(phase-8): ATEM UI — TransportBar indicator, AtemPanel config, manual override"
```

---

## Chunk 4: Testy + Weryfikacja końcowa

### Task 8: Pełna weryfikacja

- [ ] **Step 1: Uruchom TypeScript check**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime && npx tsc --noEmit
```

Expected: zero błędów

- [ ] **Step 2: Uruchom WSZYSTKIE testy**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime && npx vitest run
```

Expected: wszystkie testy przechodzą (174 istniejące + ~20 nowych ATEM = ~194)

- [ ] **Step 3: Napraw ewentualne błędy**

Jeśli są błędy TypeScript lub testy nie przechodzą — napraw i zweryfikuj ponownie.

### Task 9: Aktualizacja docs/TODO.md

- [ ] **Step 1: Dodaj sekcję Fazy 8 do `docs/TODO.md`**

Na końcu pliku, przed sekcją "Faza 8+ — Planowane", zamień ją na:

```markdown
## Faza 8 — Vision Switcher (ATEM integration) [UKOŃCZONA]

### AtemSender (backend)
- [x] `electron/senders/atem-sender.ts` — placeholder z interfejsem kompatybilnym (connect, disconnect, performCut, performMix, setPreview)
- [x] Konfiguracja: IP, ME index, auto-switch, transition type (cut/mix), mix duration
- [x] Status: connected, programInput, previewInput, modelName
- [x] Auto-switch: nasłuchuje 'vision-cue-changed', mapuje camera_number → ATEM input
- [x] Manual override: performCut(input), setPreview(input)
- [x] EventEmitter: connected, disconnected, program-changed, preview-changed
- [x] `electron/senders/index.ts` — AtemSender dodany do SenderManager

### IPC + WS
- [x] IPC handlers: atemGetStatus, atemConfigure, atemConnect, atemDisconnect, atemCut, atemPreview
- [x] WS komendy C→S: cmd:atem_cut, cmd:atem_preview
- [x] WS event S→C: atem:status (broadcast przy zmianie stanu ATEM)
- [x] Preload + electron.d.ts — pełne typy ATEM API

### UI
- [x] TransportBar: wskaźnik ATEM (zielony/szary dot + PGM input) w trybie timeline
- [x] AtemPanel: dialog konfiguracji (IP, ME, transition, auto-switch)
- [x] AtemPanel: status Program/Preview (duże cyfry)
- [x] AtemPanel: manual override — siatka 8 kamer (PGM/PVW przyciski)
- [x] App.tsx: przycisk "ATEM ON/OFF" w toolbar timeline

### Store + WS klient
- [x] Zustand: atemConnected, atemProgramInput, atemPreviewInput, atemAutoSwitch, atemModelName
- [x] useRundownSocket: handler atem:status

### Testy
- [x] `tests/unit/atem-sender.test.ts` — ~20 testów:
  - Połączenie/rozłączenie, eventy connected/disconnected
  - Auto-switch CUT/MIX, ignorowanie gdy disabled/disconnected/no camera
  - Manual performCut, setPreview, program-changed event
  - Konfiguracja (IP change → reconnect), disabled
  - Destroy, SenderManager integracja

### Weryfikacja
- [x] `npx tsc --noEmit` — zero błędów TypeScript
- [x] `npx vitest run` — wszystkie testy przechodzą

---

## Faza 9+ — Planowane (kolejność techniczna)

- [ ] **Faza 9** — CueApp + Prompter + Output Config
- [ ] **Faza 10** — LTC sync + PTZ + Media playback + prawdziwy atem-connection npm
- [ ] **Faza 11** — Multi-user + Polish
```

- [ ] **Step 2: Commit**

```bash
cd D:\PROGRAMOWANIE\NEXTTIME\nextime
git add docs/TODO.md
git commit -m "docs(phase-8): aktualizacja TODO.md — Faza 8 ATEM ukończona"
```

---

## Instrukcja testów wizualnych

Po `npm run dev`:

1. **Przełącz na tryb Timeline** (zakładka w górze)
2. **Przycisk "ATEM OFF"** powinien być widoczny w toolbarze (szary)
3. **Kliknij "ATEM OFF"** → otworzy się AtemPanel
4. **Wpisz IP** (dowolny, placeholder nie łączy się naprawdę) → kliknij **"Połącz"**
5. **Status** zmieni się na "ATEM ON" (zielony) w toolbarze + `PGM:1` obok
6. W panelu pojawi się **Program: 1** / **Preview: 2**
7. **Kliknij PGM 3** w manual override → Program zmieni się na 3
8. **Kliknij PVW 5** → Preview zmieni się na 5
9. **Auto-switch**: stwórz vision cue z Camera 4, odtwórz timeline — gdy playhead wjedzie w ten cue, PGM powinien zmienić się na 4
10. **Rozłącz** → status wraca do szarego "ATEM OFF"
11. **TransportBar** w trybie timeline: zielony/szary dot z "ATEM" obok wskaźników STEP/HOLD
