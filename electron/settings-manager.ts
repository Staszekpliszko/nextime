import type { SettingsRepo } from './db/repositories/settings.repo';
import type { SenderManager } from './senders';

// ── Typy sekcji ustawień ────────────────────────────────

export interface OscSettings {
  host: string;
  port: number;
  enabled: boolean;
}

export interface MidiSettings {
  portName: string;
  defaultChannel: number;
  enabled: boolean;
}

export interface AtemSettings {
  ip: string;
  meIndex: number;
  transitionType: 'cut' | 'mix';
  mixDurationFrames: number;
  autoSwitch: boolean;
  enabled: boolean;
}

export interface LtcSettings {
  source: 'internal' | 'ltc' | 'mtc' | 'manual';
  enabled: boolean;
  mtcPortIndex: number;
}

export interface GpiSettings {
  enabled: boolean;
  defaultPulseMs: number;
  portPath: string;
  baudRate: number;
}

export interface PtzSettings {
  enabled: boolean;
  cameras: Array<{
    number: number;
    ip: string;
    port: number;
    protocol: 'visca_ip' | 'visca_serial' | 'onvif' | 'ndi';
    serialPath?: string;
    serialBaudRate?: number;
    ndiSourceName?: string;
    onvifProfileToken?: string;
    onvifUsername?: string;
    onvifPassword?: string;
  }>;
}

export interface AllSettings {
  osc: OscSettings;
  midi: MidiSettings;
  atem: AtemSettings;
  ltc: LtcSettings;
  gpi: GpiSettings;
  ptz: PtzSettings;
}

// ── Domyślne wartości ───────────────────────────────────

const DEFAULTS: AllSettings = {
  osc: { host: '127.0.0.1', port: 8000, enabled: true },
  midi: { portName: 'NextTime Virtual MIDI', defaultChannel: 1, enabled: true },
  atem: { ip: '192.168.10.240', meIndex: 0, transitionType: 'cut', mixDurationFrames: 25, autoSwitch: true, enabled: false },
  ltc: { source: 'internal', enabled: true, mtcPortIndex: -1 },
  gpi: { enabled: false, defaultPulseMs: 100, portPath: '', baudRate: 9600 },
  ptz: { enabled: false, cameras: [] },
};

// ── Typ sekcji ──────────────────────────────────────────

export type SettingsSection = keyof AllSettings;

// ── SettingsManager ─────────────────────────────────────

/**
 * Centralne zarządzanie ustawieniami aplikacji.
 * Wczytuje z DB do pamięci, propaguje do senderów.
 */
export class SettingsManager {
  private cache: AllSettings;
  private readonly repo: SettingsRepo;

  constructor(repo: SettingsRepo) {
    this.repo = repo;
    this.cache = structuredClone(DEFAULTS);
  }

  /** Wczytuje wszystkie ustawienia z DB do pamięci (cache) */
  loadAll(): void {
    const all = this.repo.getAll();

    // Parsuj ustawienia per sekcja
    for (const section of Object.keys(DEFAULTS) as SettingsSection[]) {
      const prefix = `${section}.`;
      const sectionDefaults = DEFAULTS[section];

      for (const field of Object.keys(sectionDefaults) as string[]) {
        const dbValue = all[`${prefix}${field}`];
        if (dbValue === undefined) continue;

        // Parsowanie wg typu domyślnej wartości
        const defaultVal = (sectionDefaults as unknown as Record<string, unknown>)[field];
        let parsed: unknown;

        if (typeof defaultVal === 'number') {
          parsed = Number(dbValue);
          if (isNaN(parsed as number)) continue; // pomiń nieprawidłowe
        } else if (typeof defaultVal === 'boolean') {
          parsed = dbValue === 'true';
        } else if (Array.isArray(defaultVal)) {
          try { parsed = JSON.parse(dbValue); } catch { continue; }
        } else {
          parsed = dbValue;
        }

        (this.cache[section] as unknown as Record<string, unknown>)[field] = parsed;
      }
    }
  }

  /** Zwraca ustawienia danej sekcji */
  getSection<S extends SettingsSection>(section: S): AllSettings[S] {
    return structuredClone(this.cache[section]);
  }

  /** Zwraca wszystkie ustawienia */
  getAll(): AllSettings {
    return structuredClone(this.cache);
  }

  /** Aktualizuje ustawienia sekcji — cache + zapis do DB */
  updateSection<S extends SettingsSection>(section: S, values: Partial<AllSettings[S]>): void {
    const current = this.cache[section] as unknown as Record<string, unknown>;
    const entries: Record<string, string> = {};

    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue;
      current[key] = value;

      // Serializacja do DB
      const prefix = `${section}.`;
      if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        entries[`${prefix}${key}`] = JSON.stringify(value);
      } else {
        entries[`${prefix}${key}`] = String(value);
      }
    }

    if (Object.keys(entries).length > 0) {
      this.repo.setMany(entries);
    }
  }

  /**
   * Propaguje ustawienia z cache do senderów.
   * Wywoływane po loadAll() lub updateSection().
   */
  applyToSenders(senderManager: SenderManager): void {
    // OSC
    const osc = this.cache.osc;
    senderManager.osc.updateConfig({
      host: osc.host,
      port: osc.port,
      enabled: osc.enabled,
    });

    // MIDI
    const midi = this.cache.midi;
    senderManager.midi.updateConfig({
      portName: midi.portName,
      defaultChannel: midi.defaultChannel,
      enabled: midi.enabled,
    });

    // ATEM
    const atem = this.cache.atem;
    senderManager.atem.updateConfig({
      ip: atem.ip,
      meIndex: atem.meIndex,
      transitionType: atem.transitionType,
      mixDurationFrames: atem.mixDurationFrames,
      autoSwitch: atem.autoSwitch,
      enabled: atem.enabled,
    });

    // LTC
    const ltc = this.cache.ltc;
    senderManager.ltc.updateConfig({
      source: ltc.source,
      enabled: ltc.enabled,
      mtcPortIndex: ltc.mtcPortIndex,
    });

    // GPI
    const gpi = this.cache.gpi;
    senderManager.gpi.updateConfig({
      enabled: gpi.enabled,
      defaultPulseMs: gpi.defaultPulseMs,
      portPath: gpi.portPath,
      baudRate: gpi.baudRate,
    });

    // PTZ
    const ptz = this.cache.ptz;
    senderManager.ptz.updateConfig({
      enabled: ptz.enabled,
      cameras: ptz.cameras,
    });

    console.log('[SettingsManager] Ustawienia zastosowane do senderów');
  }

  /**
   * Propaguje ustawienia jednej sekcji do odpowiedniego sendera.
   */
  applySectionToSender(section: SettingsSection, senderManager: SenderManager): void {
    switch (section) {
      case 'osc':
        senderManager.osc.updateConfig(this.cache.osc);
        break;
      case 'midi':
        senderManager.midi.updateConfig({
          portName: this.cache.midi.portName,
          defaultChannel: this.cache.midi.defaultChannel,
          enabled: this.cache.midi.enabled,
        });
        break;
      case 'atem':
        senderManager.atem.updateConfig(this.cache.atem);
        break;
      case 'ltc':
        senderManager.ltc.updateConfig({
          source: this.cache.ltc.source,
          enabled: this.cache.ltc.enabled,
          mtcPortIndex: this.cache.ltc.mtcPortIndex,
        });
        break;
      case 'gpi':
        senderManager.gpi.updateConfig(this.cache.gpi);
        break;
      case 'ptz':
        senderManager.ptz.updateConfig({
          enabled: this.cache.ptz.enabled,
          cameras: this.cache.ptz.cameras,
        });
        break;
    }
  }
}
