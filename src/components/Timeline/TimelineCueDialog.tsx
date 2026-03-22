import { useState, useEffect, useRef, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import type { TimelineCueSummary } from '@/store/playback.store';
import type { FPS } from '@/utils/timecode';
import { framesToTimecode, timecodeToFrames } from '@/utils/timecode';
import type { MediaFile } from '../../../electron/db/repositories/media-file.repo';
import type { VmixInput } from '../../../electron/senders/vmix-xml-parser';
import type { VmixStatus } from '../../../electron/senders/vmix-sender';

/** Mapowanie typ tracka → typ cue */
const TRACK_TO_CUE_TYPE: Record<string, string> = {
  vision: 'vision',
  vision_fx: 'vision_fx',
  lyrics: 'lyric',
  cues: 'marker',
  media: 'media',
  osc: 'osc',
  gpi: 'gpi',
  midi: 'midi',
  marker: 'marker',
};

/** Kolory presetowe do wyboru */
const PRESET_COLORS = [
  '#3b82f6', '#2563EB', '#7C3AED', '#8b5cf6',
  '#DB2777', '#DC2626', '#EA580C', '#16A34A',
  '#0891B2', '#f59e0b', '#6b7280', '#ef4444',
];

export interface TimelineCueDialogProps {
  /** Tryb: tworzenie lub edycja */
  mode: 'create' | 'edit';
  /** Typ tracka (determinuje typ cue) */
  trackType: string;
  /** FPS aktywnego aktu */
  fps: FPS;
  /** Istniejący cue (tryb edit) */
  existingCue?: TimelineCueSummary;
  /** Pozycja tc_in w klatkach (tryb create) */
  defaultTcIn?: number;
  /** Pozycja tc_out w klatkach (tryb create) */
  defaultTcOut?: number;
  /** Callback: submit */
  onSubmit: (data: { tc_in_frames: number; tc_out_frames?: number; data: Record<string, unknown> }) => void;
  /** Callback: anuluj */
  onCancel: () => void;
}

/** Dialog tworzenia/edycji timeline cue — formularz per typ */
export function TimelineCueDialog({
  mode,
  trackType,
  fps,
  existingCue,
  defaultTcIn,
  defaultTcOut,
  onSubmit,
  onCancel,
}: TimelineCueDialogProps) {
  const cueType = existingCue?.type ?? TRACK_TO_CUE_TYPE[trackType] ?? 'marker';

  // Timecode pozycji
  const initialTcIn = existingCue?.tc_in_frames ?? defaultTcIn ?? 0;
  const initialTcOut = existingCue?.tc_out_frames ?? defaultTcOut;

  const [tcInStr, setTcInStr] = useState(framesToTimecode(initialTcIn, fps));
  const [tcOutStr, setTcOutStr] = useState(initialTcOut ? framesToTimecode(initialTcOut, fps) : '');

  // Dane per typ
  const existingData = (existingCue?.data ?? {}) as Record<string, unknown>;

  // Vision
  const [cameraNumber, setCameraNumber] = useState<number>((existingData.camera_number as number) ?? 1);
  const [shotName, setShotName] = useState<string>((existingData.shot_name as string) ?? '');
  const [visionColor, setVisionColor] = useState<string>((existingData.color as string) ?? '#3b82f6');

  // Lyric
  const [lyricText, setLyricText] = useState<string>((existingData.text as string) ?? '');

  // Marker
  const [markerLabel, setMarkerLabel] = useState<string>((existingData.label as string) ?? '');
  const [markerColor, setMarkerColor] = useState<string>((existingData.color as string) ?? '#ef4444');

  // OSC
  const [oscAddress, setOscAddress] = useState<string>((existingData.address as string) ?? '');
  const [oscArgs, setOscArgs] = useState<string>(
    existingData.args ? JSON.stringify(existingData.args) : '[]',
  );
  const [oscHost, setOscHost] = useState<string>((existingData.host as string) ?? '127.0.0.1');
  const [oscPort, setOscPort] = useState<number>((existingData.port as number) ?? 8000);

  // MIDI
  const [midiMessageType, setMidiMessageType] = useState<string>((existingData.message_type as string) ?? 'note_on');
  const [midiChannel, setMidiChannel] = useState<number>((existingData.channel as number) ?? 1);
  const [midiNoteOrCc, setMidiNoteOrCc] = useState<number>((existingData.note_or_cc as number) ?? 60);
  const [midiVelocity, setMidiVelocity] = useState<number>((existingData.velocity_or_val as number) ?? 127);

  // GPI
  const [gpiChannel, setGpiChannel] = useState<number>((existingData.channel as number) ?? 1);
  const [gpiTriggerType, setGpiTriggerType] = useState<string>((existingData.trigger_type as string) ?? 'pulse');
  const [gpiPulseMs, setGpiPulseMs] = useState<number>((existingData.pulse_ms as number) ?? 100);

  // Marker
  const [markerPreWarnFrames, setMarkerPreWarnFrames] = useState<number>((existingData.pre_warn_frames as number) ?? 50);

  // Media
  const [mediaFilePath, setMediaFilePath] = useState<string>((existingData.file_path as string) ?? '');
  const [mediaVolume, setMediaVolume] = useState<number>((existingData.volume as number) ?? 100);
  const [mediaLoop, setMediaLoop] = useState<boolean>((existingData.loop as boolean) ?? false);
  const [mediaOffsetFrames, setMediaOffsetFrames] = useState<number>((existingData.offset_frames as number) ?? 0);
  const [mediaLibraryFiles, setMediaLibraryFiles] = useState<MediaFile[]>([]);

  // vMix inputy i OBS sceny (do dropdown w vision cue)
  const [vmixInputs, setVmixInputs] = useState<VmixInput[]>([]);
  const [vmixStatus, setVmixStatus] = useState<VmixStatus | null>(null);
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [obsConnected, setObsConnected] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Załaduj inputy vMix i sceny OBS (dla dropdown w vision cue)
  useEffect(() => {
    if (cueType !== 'vision') return;
    // vMix
    window.nextime.vmixGetStatus()
      .then(s => {
        const st = s as VmixStatus;
        setVmixStatus(st);
        if (st.inputs.length > 0) setVmixInputs(st.inputs);
      })
      .catch(() => {});
    // OBS
    window.nextime.obsGetStatus()
      .then(s => {
        const obs = s as { connected: boolean; scenes: string[] };
        setObsConnected(obs.connected);
        if (obs.scenes.length > 0) setObsScenes(obs.scenes);
      })
      .catch(() => {});
  }, [cueType]);

  // Faza 24: załaduj pliki z biblioteki mediów (dla dropdown w sekcji media)
  useEffect(() => {
    if (cueType !== 'media') return;
    const actId = usePlaybackStore.getState().activeActId;
    if (!actId) return;
    window.nextime.getMediaFiles(actId).then(files => {
      setMediaLibraryFiles(files);
    }).catch(() => {
      // ignoruj — dropdown będzie pusty
    });
  }, [cueType]);

  // Faza 24: wybierz plik z biblioteki mediów (dropdown)
  const handleMediaLibrarySelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const filePath = e.target.value;
    if (filePath) {
      setMediaFilePath(filePath);
    }
  }, []);

  // Faza 24: otwórz natywny dialog Electron do wyboru pliku
  const handleBrowseMediaFile = useCallback(async () => {
    const result = await window.nextime.selectMediaFile();
    if (result) {
      setMediaFilePath(result.filePath);
    }
  }, []);

  // Zamknij na Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  // Buduj dane per typ
  const buildData = useCallback((): Record<string, unknown> => {
    switch (cueType) {
      case 'vision':
        return {
          camera_number: cameraNumber,
          shot_name: shotName,
          shot_description: '',
          director_notes: '',
          operator_note: '',
          color: visionColor,
        };
      case 'vision_fx':
        return { effect_name: shotName || 'FX', macro_id: undefined, key_on: true };
      case 'lyric':
        return { text: lyricText, language: 'pl' };
      case 'marker':
        return { label: markerLabel, color: markerColor, pre_warn_frames: markerPreWarnFrames, has_duration: !!tcOutStr };
      case 'osc': {
        let parsedArgs: unknown[] = [];
        try { parsedArgs = JSON.parse(oscArgs); } catch { /* ignoruj */ }
        return { address: oscAddress, args: parsedArgs, host: oscHost, port: oscPort };
      }
      case 'midi':
        return { message_type: midiMessageType, channel: midiChannel, note_or_cc: midiNoteOrCc, velocity_or_val: midiVelocity };
      case 'gpi':
        return { channel: gpiChannel, trigger_type: gpiTriggerType, pulse_ms: gpiPulseMs };
      case 'media':
        return { file_path: mediaFilePath, volume: mediaVolume, loop: mediaLoop, offset_frames: mediaOffsetFrames };
      default:
        return {};
    }
  }, [cueType, cameraNumber, shotName, visionColor, lyricText, markerLabel, markerColor, markerPreWarnFrames,
      oscAddress, oscArgs, oscHost, oscPort, midiMessageType, midiChannel, midiNoteOrCc, midiVelocity,
      gpiChannel, gpiTriggerType, gpiPulseMs, mediaFilePath, mediaVolume, mediaLoop, mediaOffsetFrames, tcOutStr]);

  const handleSubmit = useCallback(() => {
    const tcIn = timecodeToFrames(tcInStr, fps);
    const tcOut = tcOutStr ? timecodeToFrames(tcOutStr, fps) : undefined;
    onSubmit({ tc_in_frames: tcIn, tc_out_frames: tcOut, data: buildData() });
  }, [tcInStr, tcOutStr, fps, buildData, onSubmit]);

  const title = mode === 'create' ? `Nowy cue: ${cueType}` : `Edycja cue: ${cueType}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={dialogRef}
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl w-[420px] max-h-[80vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200">&times;</button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {/* Pozycja TC */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 block mb-0.5">TC In</label>
              <input
                value={tcInStr}
                onChange={e => setTcInStr(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                placeholder="HH:MM:SS:FF"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 block mb-0.5">TC Out (opcjonalnie)</label>
              <input
                value={tcOutStr}
                onChange={e => setTcOutStr(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                placeholder="HH:MM:SS:FF"
              />
            </div>
          </div>

          {/* Pola per typ */}
          {cueType === 'vision' && (
            <>
              <div className="flex gap-3">
                <div className={vmixInputs.length > 0 || obsScenes.length > 0 ? 'flex-1' : 'w-24'}>
                  <label className="text-[10px] text-slate-500 block mb-0.5">
                    Kamera
                    {vmixStatus?.connected && <span className="text-green-400 ml-1">(vMix)</span>}
                    {obsConnected && <span className="text-blue-400 ml-1">(OBS)</span>}
                  </label>
                  <select
                    value={cameraNumber}
                    onChange={e => setCameraNumber(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                  >
                    {vmixInputs.length > 0 ? (
                      /* Inputy z vMix — pokazuj nazwy */
                      vmixInputs.map(inp => (
                        <option key={inp.number} value={inp.number}>
                          {inp.number} — {inp.title} ({inp.type})
                        </option>
                      ))
                    ) : (
                      /* Fallback: Cam 1-16 */
                      Array.from({ length: 16 }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>Cam {n}</option>
                      ))
                    )}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 block mb-0.5">Nazwa ujęcia</label>
                  <input
                    value={shotName}
                    onChange={e => setShotName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                    placeholder="np. MCU LEAD"
                  />
                </div>
              </div>
              {/* Podgląd aktywnego switcher */}
              {vmixStatus?.connected && (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-slate-500">vMix:</span>
                  {vmixStatus.activeInput !== null && (
                    <span className="bg-red-600/30 text-red-300 px-1.5 py-0.5 rounded">
                      PGM: Input {vmixStatus.activeInput}
                    </span>
                  )}
                  {vmixStatus.previewInput !== null && (
                    <span className="bg-green-600/20 text-green-300 px-1.5 py-0.5 rounded">
                      PRV: Input {vmixStatus.previewInput}
                    </span>
                  )}
                </div>
              )}
              {obsConnected && obsScenes.length > 0 && (
                <div className="text-[10px] text-slate-500">
                  Sceny OBS: {obsScenes.join(', ')}
                </div>
              )}
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">Kolor</label>
                <div className="flex gap-1 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setVisionColor(c)}
                      className={`w-5 h-5 rounded-sm ${visionColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {cueType === 'lyric' && (
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">Tekst</label>
              <textarea
                value={lyricText}
                onChange={e => setLyricText(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none resize-y min-h-[60px]"
                rows={3}
              />
            </div>
          )}

          {cueType === 'marker' && (
            <>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">Etykieta</label>
                <input
                  value={markerLabel}
                  onChange={e => setMarkerLabel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                  placeholder="np. PYRO, DANCER IN"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">Kolor</label>
                <div className="flex gap-1 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setMarkerColor(c)}
                      className={`w-5 h-5 rounded-sm ${markerColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">Pre-warning (klatki przed)</label>
                <input
                  type="number"
                  min={0} max={300}
                  value={markerPreWarnFrames}
                  onChange={e => setMarkerPreWarnFrames(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                />
                <span className="text-[9px] text-slate-600">Ile klatek przed markerem pojawi się alert</span>
              </div>
            </>
          )}

          {cueType === 'osc' && (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 block mb-0.5">Host</label>
                  <input
                    value={oscHost}
                    onChange={e => setOscHost(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none"
                    placeholder="127.0.0.1"
                  />
                </div>
                <div className="w-24">
                  <label className="text-[10px] text-slate-500 block mb-0.5">Port</label>
                  <input
                    type="number"
                    min={1} max={65535}
                    value={oscPort}
                    onChange={e => setOscPort(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">Adres OSC</label>
                <input
                  value={oscAddress}
                  onChange={e => setOscAddress(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none"
                  placeholder="/layer/1/opacity"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">Argumenty (JSON)</label>
                <input
                  value={oscArgs}
                  onChange={e => setOscArgs(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none"
                  placeholder='[{"type":"f","value":1.0}]'
                />
                <span className="text-[9px] text-slate-600">{'Format: [{"type":"f","value":1.0}]  Typy: i=int, f=float, s=string'}</span>
              </div>
            </>
          )}

          {cueType === 'midi' && (
            <>
              <div className="flex gap-3">
                <div className="w-20">
                  <label className="text-[10px] text-slate-500 block mb-0.5">Kanał</label>
                  <select
                    value={midiChannel}
                    onChange={e => setMidiChannel(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                  >
                    {Array.from({ length: 16 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 block mb-0.5">Typ wiadomości</label>
                  <select
                    value={midiMessageType}
                    onChange={e => setMidiMessageType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="note_on">Note On</option>
                    <option value="note_off">Note Off</option>
                    <option value="program">Program Change</option>
                    <option value="cc">Control Change</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 block mb-0.5">
                    {midiMessageType === 'cc' ? 'CC Number' : midiMessageType === 'program' ? 'Program' : 'Note'}
                  </label>
                  <input
                    type="number"
                    min={0} max={127}
                    value={midiNoteOrCc}
                    onChange={e => setMidiNoteOrCc(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                  />
                </div>
                {midiMessageType !== 'program' && (
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500 block mb-0.5">
                      {midiMessageType === 'cc' ? 'Value' : 'Velocity'}
                    </label>
                    <input
                      type="number"
                      min={0} max={127}
                      value={midiVelocity}
                      onChange={e => setMidiVelocity(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {cueType === 'gpi' && (
            <>
              <div className="flex gap-3">
                <div className="w-24">
                  <label className="text-[10px] text-slate-500 block mb-0.5">Kanał</label>
                  <select
                    value={gpiChannel}
                    onChange={e => setGpiChannel(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                  >
                    {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 block mb-0.5">Typ wyzwalania</label>
                  <select
                    value={gpiTriggerType}
                    onChange={e => setGpiTriggerType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="pulse">Pulse</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>
              </div>
              {gpiTriggerType === 'pulse' && (
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">Czas impulsu (ms)</label>
                  <input
                    type="number"
                    min={10} max={5000}
                    value={gpiPulseMs}
                    onChange={e => setGpiPulseMs(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                  />
                </div>
              )}
            </>
          )}

          {cueType === 'media' && (
            <>
              {/* Wybór pliku z biblioteki mediów */}
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">Plik z biblioteki mediów</label>
                <select
                  value={mediaFilePath}
                  onChange={handleMediaLibrarySelect}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="">— wybierz plik —</option>
                  {mediaLibraryFiles.map(f => (
                    <option key={f.id} value={f.file_path}>
                      {f.file_name} ({f.media_type})
                    </option>
                  ))}
                </select>
                {mediaLibraryFiles.length === 0 && (
                  <span className="text-[9px] text-slate-600">
                    Brak plików — dodaj przez przycisk &quot;Multimedia&quot; na pasku
                  </span>
                )}
              </div>

              {/* Lub wybierz plik z dysku */}
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">Lub wybierz z dysku</label>
                <div className="flex gap-2">
                  <input
                    value={mediaFilePath}
                    readOnly
                    className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400 focus:outline-none cursor-default"
                    placeholder="Wybierz plik..."
                  />
                  <button
                    type="button"
                    onClick={handleBrowseMediaFile}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 rounded border border-slate-600 shrink-0"
                  >
                    Przeglądaj...
                  </button>
                </div>
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 block mb-0.5">Głośność: {mediaVolume}%</label>
                  <input
                    type="range"
                    min={0} max={100}
                    value={mediaVolume}
                    onChange={e => setMediaVolume(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <label className="flex items-center gap-1 text-xs text-slate-300 pb-1">
                  <input
                    type="checkbox"
                    checked={mediaLoop}
                    onChange={e => setMediaLoop(e.target.checked)}
                    className="rounded"
                  />
                  Loop
                </label>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">Offset synchronizacji (klatki)</label>
                <input
                  type="number"
                  value={mediaOffsetFrames}
                  onChange={e => setMediaOffsetFrames(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                />
                <span className="text-[9px] text-slate-600">Przesunięcie startu pliku względem TC In</span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700 flex gap-2">
          <button
            onClick={handleSubmit}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-1.5 rounded font-medium"
          >
            {mode === 'create' ? 'Utwórz' : 'Zapisz'}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-1.5 rounded"
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}
