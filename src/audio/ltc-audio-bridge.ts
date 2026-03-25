/**
 * LtcAudioBridge — most między AudioWorklet (renderer) a LtcReader (main process).
 *
 * Uruchamia AudioContext + getUserMedia → AudioWorkletNode (ltc-decoder.worklet.ts)
 * → dekodowany timecode → IPC → LtcReader.feedTc() w main process.
 *
 * Dodatkowa funkcja: AnalyserNode do peak metering (AudioLevelMeter).
 */

// ── Typy ────────────────────────────────────────────────

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export interface LtcAudioStatus {
  running: boolean;
  deviceId: string | null;
  lastTcFormatted: string | null;
  fps: number | null;
  signalStatus: 'synced' | 'lost' | 'weak' | 'none';
  peakLevel: number;
  errorRate: number;
}

// ── Bridge ──────────────────────────────────────────────

export class LtcAudioBridge {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private _running = false;
  private _deviceId: string | null = null;
  private _lastTcFormatted: string | null = null;
  private _fps: number | null = null;
  private _signalStatus: 'synced' | 'lost' | 'weak' | 'none' = 'none';
  private _peakLevel = 0;
  private _errorRate = 0;

  // Debounce: ostatni wysłany TC frame count, nie wysyłaj duplikatów
  private _lastSentFrames = -1;

  // Timeout brak sygnału (2s)
  private _signalLostTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly SIGNAL_LOST_TIMEOUT = 2000;

  /** Callback — wywoływany gdy otrzymamy nowy TC (frames) */
  onTimecodeReceived: ((frames: number) => void) | null = null;
  /** Callback — zmiana statusu sygnału */
  onStatusChanged: ((status: LtcAudioStatus) => void) | null = null;

  /** Lista dostępnych wejść audio */
  async listAudioInputs(): Promise<AudioInputDevice[]> {
    try {
      // Potrzebujemy uprawnień żeby enumerateDevices zwróciło labels
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Wejście audio (${d.deviceId.slice(0, 8)}...)`,
        }));
    } catch {
      return [];
    }
  }

  /** Uruchom dekodowanie LTC z danego urządzenia audio */
  async start(deviceId?: string): Promise<{ ok: boolean; error?: string }> {
    // Zatrzymaj poprzedni jeśli działa
    if (this._running) {
      await this.stop();
    }

    try {
      // AudioContext — bez auto-resume, zrobimy to jawnie
      this.audioContext = new AudioContext({ sampleRate: 48000 });

      // Jeśli suspended (Chrome wymaga user gesture) → resume
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // getUserMedia — surowy sygnał audio, bez przetwarzania
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this._deviceId = deviceId ?? null;

      // AudioWorklet — załaduj dekoder
      const workletUrl = new URL('./ltc-decoder.worklet.ts', import.meta.url);
      await this.audioContext.audioWorklet.addModule(workletUrl.href);

      // Source → WorkletNode (NIE podłączamy do destination — nie chcemy odtwarzać LTC)
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'ltc-decoder-processor');

      // AnalyserNode do peak metering
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.3;

      // Routing: source → analyser → worklet (nie do destination!)
      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.workletNode);

      // Nasłuchuj wiadomości z workleta
      this.workletNode.port.onmessage = (e: MessageEvent) => {
        this.handleWorkletMessage(e.data);
      };

      this._running = true;
      this._signalStatus = 'none';
      this.startSignalLostTimer();

      // Nasłuchuj na devicechange
      navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);

      return { ok: true };
    } catch (err) {
      await this.stop();
      const msg = err instanceof Error ? err.message : String(err);

      // Rozpoznaj typowe błędy
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        return { ok: false, error: 'Brak uprawnień do mikrofonu. Zezwól na dostęp w ustawieniach przeglądarki.' };
      }
      if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        return { ok: false, error: 'Nie znaleziono wybranego urządzenia audio.' };
      }

      return { ok: false, error: msg };
    }
  }

  /** Zatrzymaj dekodowanie */
  async stop(): Promise<void> {
    this.clearSignalLostTimer();

    if (this.workletNode) {
      this.workletNode.port.postMessage('stop');
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {
        // Ignoruj błędy zamykania
      }
      this.audioContext = null;
    }

    navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange);

    this._running = false;
    this._deviceId = null;
    this._lastTcFormatted = null;
    this._fps = null;
    this._signalStatus = 'none';
    this._peakLevel = 0;
    this._errorRate = 0;
    this._lastSentFrames = -1;
  }

  /** Zwraca aktualny status */
  getStatus(): LtcAudioStatus {
    return {
      running: this._running,
      deviceId: this._deviceId,
      lastTcFormatted: this._lastTcFormatted,
      fps: this._fps,
      signalStatus: this._signalStatus,
      peakLevel: this._peakLevel,
      errorRate: this._errorRate,
    };
  }

  /** Zwraca AnalyserNode (do AudioLevelMeter) */
  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  /** Czy bridge jest uruchomiony */
  isRunning(): boolean {
    return this._running;
  }

  // ── Prywatne ────────────────────────────────────────────

  private handleWorkletMessage(data: { type: string; [key: string]: unknown }): void {
    switch (data.type) {
      case 'timecode': {
        const tc = data as {
          type: 'timecode';
          hours: number;
          minutes: number;
          seconds: number;
          frames: number;
          fps: number;
          dropFrame: boolean;
        };

        const h = String(tc.hours).padStart(2, '0');
        const m = String(tc.minutes).padStart(2, '0');
        const s = String(tc.seconds).padStart(2, '0');
        const f = String(tc.frames).padStart(2, '0');
        this._lastTcFormatted = `${h}:${m}:${s}:${f}`;
        this._fps = tc.fps;

        // Konwertuj na total frames
        const nominalFps = tc.fps === 29.97 ? 30 : Math.round(tc.fps);
        const totalFrames = tc.hours * 3600 * nominalFps
          + tc.minutes * 60 * nominalFps
          + tc.seconds * nominalFps
          + tc.frames;

        // Debounce — nie wysyłaj tego samego TC
        if (totalFrames !== this._lastSentFrames) {
          this._lastSentFrames = totalFrames;

          // Wyślij do main process przez IPC
          if (this.onTimecodeReceived) {
            this.onTimecodeReceived(totalFrames);
          }

          // Globalnie: feedLtcAudio do main process
          if (typeof window !== 'undefined' && window.nextime?.feedLtcAudio) {
            window.nextime.feedLtcAudio(totalFrames);
          }
        }

        // Reset signal lost timer
        this.resetSignalLostTimer();
        break;
      }

      case 'status': {
        const status = data as {
          type: 'status';
          status: 'synced' | 'lost' | 'weak';
          errorRate: number;
        };
        this._signalStatus = status.status;
        this._errorRate = status.errorRate;
        this.notifyStatusChanged();
        break;
      }

      case 'level': {
        const level = data as { type: 'level'; peak: number };
        this._peakLevel = level.peak;
        break;
      }
    }
  }

  private startSignalLostTimer(): void {
    this.clearSignalLostTimer();
    this._signalLostTimer = setTimeout(() => {
      if (this._running) {
        this._signalStatus = 'lost';
        this.notifyStatusChanged();
        // Kontynuuj timer
        this.startSignalLostTimer();
      }
    }, this.SIGNAL_LOST_TIMEOUT);
  }

  private resetSignalLostTimer(): void {
    this.clearSignalLostTimer();
    if (this._running) {
      this.startSignalLostTimer();
    }
  }

  private clearSignalLostTimer(): void {
    if (this._signalLostTimer) {
      clearTimeout(this._signalLostTimer);
      this._signalLostTimer = null;
    }
  }

  private notifyStatusChanged(): void {
    if (this.onStatusChanged) {
      this.onStatusChanged(this.getStatus());
    }
  }

  private handleDeviceChange = (): void => {
    // Wymuś odświeżenie listy urządzeń — UI polling
    this.notifyStatusChanged();
  };
}

// ── Singleton globalny ──────────────────────────────────

let _bridgeInstance: LtcAudioBridge | null = null;

/** Zwraca globalną instancję LtcAudioBridge (singleton) */
export function getLtcAudioBridge(): LtcAudioBridge {
  if (!_bridgeInstance) {
    _bridgeInstance = new LtcAudioBridge();
  }
  return _bridgeInstance;
}
