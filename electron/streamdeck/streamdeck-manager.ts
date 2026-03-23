import { EventEmitter } from 'events';
import type { StreamDeck, DeviceModelId } from '@elgato-stream-deck/core';
import type { StreamDeckDeviceInfo } from '@elgato-stream-deck/node';

// ── Typy publiczne ──────────────────────────────────────

export interface StreamDeckDeviceStatus {
  connected: boolean;
  model: DeviceModelId | null;
  modelName: string;
  serialNumber: string;
  firmwareVersion: string;
  keyCount: number;
  encoderCount: number;
  lcdStripCount: number;
  iconSize: { width: number; height: number };
  /** Układ przycisków: kolumny × wiersze */
  gridColumns: number;
  gridRows: number;
}

export interface StreamDeckListEntry {
  model: DeviceModelId;
  path: string;
  serialNumber?: string;
}

// Mapowanie modeli na układ grid (kolumny × wiersze)
const MODEL_GRID: Record<string, { cols: number; rows: number }> = {
  'mini': { cols: 3, rows: 2 },
  'original': { cols: 5, rows: 3 },
  'originalv2': { cols: 5, rows: 3 },
  'original-mk2': { cols: 5, rows: 3 },
  'original-mk2-scissor': { cols: 5, rows: 3 },
  'xl': { cols: 8, rows: 4 },
  'pedal': { cols: 3, rows: 1 },
  'plus': { cols: 4, rows: 2 },
  'neo': { cols: 4, rows: 2 },
  'studio': { cols: 4, rows: 4 },
  '6-module': { cols: 3, rows: 2 },
  '15-module': { cols: 5, rows: 3 },
  '32-module': { cols: 8, rows: 4 },
  'network-dock': { cols: 3, rows: 2 },
  'galleon-k100': { cols: 5, rows: 3 },
  'plus-xl': { cols: 8, rows: 4 },
};

// ── StreamDeckManager ───────────────────────────────────

/**
 * Zarządza połączeniem z fizycznym StreamDeckiem przez USB HID.
 * Singleton — jeden StreamDeck na raz.
 * Emituje eventy: key-down, key-up, encoder-rotate, lcd-press, connected, disconnected, error
 */
export class StreamDeckManager extends EventEmitter {
  private device: StreamDeck | null = null;
  private deviceInfo: StreamDeckDeviceInfo | null = null;
  private cachedStatus: StreamDeckDeviceStatus | null = null;

  /** Zwraca listę podłączonych StreamDecków */
  async listDevices(): Promise<StreamDeckListEntry[]> {
    try {
      const { listStreamDecks } = await import('@elgato-stream-deck/node');
      const devices = await listStreamDecks();
      return devices.map(d => ({
        model: d.model,
        path: d.path,
        serialNumber: d.serialNumber,
      }));
    } catch (err) {
      console.error('[StreamDeckManager] Błąd listowania urządzeń:', err);
      return [];
    }
  }

  /** Otwiera StreamDecka — jeśli nie podano ścieżki, bierze pierwszy znaleziony */
  async open(devicePath?: string): Promise<boolean> {
    // Zamknij poprzedni jeśli otwarty
    if (this.device) {
      await this.close();
    }

    try {
      const { listStreamDecks, openStreamDeck } = await import('@elgato-stream-deck/node');

      let path = devicePath;
      if (!path) {
        const devices = await listStreamDecks();
        if (devices.length === 0) {
          console.log('[StreamDeckManager] Nie znaleziono żadnego StreamDecka');
          return false;
        }
        path = devices[0]!.path;
        this.deviceInfo = devices[0]!;
      } else {
        const devices = await listStreamDecks();
        this.deviceInfo = devices.find(d => d.path === path) ?? null;
      }

      this.device = await openStreamDeck(path, {
        resetToLogoOnClose: true,
      });

      // Pobierz informacje o urządzeniu
      const serial = await this.device.getSerialNumber();
      const firmware = await this.device.getFirmwareVersion();
      const model = this.device.MODEL;
      const productName = this.device.PRODUCT_NAME;
      const controls = this.device.CONTROLS;

      // Zlicz typy kontrolerów
      const buttons = controls.filter(c => c.type === 'button');
      const encoders = controls.filter(c => c.type === 'encoder');
      const lcdSegments = controls.filter(c => c.type === 'lcd-segment');

      // Rozmiar ikon — z pierwszego buttona z feedbackType lcd
      let iconWidth = 72;
      let iconHeight = 72;
      const firstLcdButton = buttons.find(b => b.feedbackType === 'lcd');
      if (firstLcdButton && firstLcdButton.feedbackType === 'lcd') {
        iconWidth = firstLcdButton.pixelSize.width;
        iconHeight = firstLcdButton.pixelSize.height;
      }

      const grid = MODEL_GRID[model] ?? { cols: 5, rows: 3 };

      this.cachedStatus = {
        connected: true,
        model,
        modelName: productName,
        serialNumber: serial,
        firmwareVersion: firmware,
        keyCount: buttons.length,
        encoderCount: encoders.length,
        lcdStripCount: lcdSegments.length,
        iconSize: { width: iconWidth, height: iconHeight },
        gridColumns: grid.cols,
        gridRows: grid.rows,
      };

      // Podpięcie eventów
      this.device.on('down', (control) => {
        if (control.type === 'button') {
          this.emit('key-down', control.index);
        } else if (control.type === 'encoder') {
          this.emit('key-down', control.index + (this.cachedStatus?.keyCount ?? 0));
        }
      });

      this.device.on('up', (control) => {
        if (control.type === 'button') {
          this.emit('key-up', control.index);
        } else if (control.type === 'encoder') {
          this.emit('key-up', control.index + (this.cachedStatus?.keyCount ?? 0));
        }
      });

      this.device.on('rotate', (control, amount) => {
        this.emit('encoder-rotate', control.index, amount);
      });

      this.device.on('lcdShortPress', (_control, position) => {
        this.emit('lcd-press', position.x, position.y);
      });

      this.device.on('error', (err) => {
        console.error('[StreamDeckManager] Błąd urządzenia:', err);
        this.emit('error', err);
      });

      console.log(`[StreamDeckManager] Otwarto: ${productName} (S/N: ${serial}), ${buttons.length} przycisków`);
      this.emit('connected', this.cachedStatus);
      return true;
    } catch (err) {
      console.error('[StreamDeckManager] Błąd otwierania StreamDecka:', err);
      this.device = null;
      this.cachedStatus = null;
      this.emit('error', err);
      return false;
    }
  }

  /** Zamyka połączenie ze StreamDeckiem */
  async close(): Promise<void> {
    if (!this.device) return;

    try {
      await this.device.clearPanel();
      await this.device.close();
    } catch (err) {
      console.error('[StreamDeckManager] Błąd zamykania:', err);
    }
    this.device = null;
    this.deviceInfo = null;
    const wasConnected = this.cachedStatus?.connected ?? false;
    this.cachedStatus = null;
    if (wasConnected) {
      this.emit('disconnected');
    }
  }

  /** Zwraca status urządzenia */
  getStatus(): StreamDeckDeviceStatus {
    if (!this.cachedStatus) {
      return {
        connected: false,
        model: null,
        modelName: '',
        serialNumber: '',
        firmwareVersion: '',
        keyCount: 0,
        encoderCount: 0,
        lcdStripCount: 0,
        iconSize: { width: 72, height: 72 },
        gridColumns: 0,
        gridRows: 0,
      };
    }
    return { ...this.cachedStatus };
  }

  /** Ustawia jasność (0-100) */
  async setBrightness(percent: number): Promise<void> {
    if (!this.device) return;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    await this.device.setBrightness(clamped);
  }

  /** Wyświetla obraz na przycisku (Buffer z raw RGB/RGBA) */
  async fillKeyBuffer(keyIndex: number, imageBuffer: Uint8Array, format: 'rgb' | 'rgba' = 'rgba'): Promise<void> {
    if (!this.device) return;
    try {
      await this.device.fillKeyBuffer(keyIndex, imageBuffer, { format });
    } catch (err) {
      console.error(`[StreamDeckManager] Błąd fillKeyBuffer(${keyIndex}):`, err);
    }
  }

  /** Czyści przycisk */
  async clearKey(keyIndex: number): Promise<void> {
    if (!this.device) return;
    try {
      await this.device.clearKey(keyIndex);
    } catch (err) {
      console.error(`[StreamDeckManager] Błąd clearKey(${keyIndex}):`, err);
    }
  }

  /** Czyści wszystkie przyciski */
  async clearAllKeys(): Promise<void> {
    if (!this.device) return;
    try {
      await this.device.clearPanel();
    } catch (err) {
      console.error('[StreamDeckManager] Błąd clearPanel:', err);
    }
  }

  /** Wypełnia przycisk kolorem */
  async fillKeyColor(keyIndex: number, r: number, g: number, b: number): Promise<void> {
    if (!this.device) return;
    try {
      await this.device.fillKeyColor(keyIndex, r, g, b);
    } catch (err) {
      console.error(`[StreamDeckManager] Błąd fillKeyColor(${keyIndex}):`, err);
    }
  }

  /** Czy StreamDeck jest podłączony */
  get isConnected(): boolean {
    return this.device !== null;
  }

  /** Rozmiar ikony (px) dla aktualnego modelu */
  get iconSize(): { width: number; height: number } {
    return this.cachedStatus?.iconSize ?? { width: 72, height: 72 };
  }

  /** Referencja do surowego urządzenia — tylko do testowania */
  get rawDevice(): StreamDeck | null {
    return this.device;
  }
}
