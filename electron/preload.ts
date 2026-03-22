import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script — bezpieczny most main↔renderer przez contextBridge.
 * Renderer nie ma dostępu do Node.js — wszystko przechodzi przez IPC.
 */
contextBridge.exposeInMainWorld('nextime', {
  // ── Odczyt ────────────────────────────────────────────────
  /** Pobiera listę wszystkich rundownów */
  getRundowns: (): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getRundowns'),

  /** Ładuje rundown do PlaybackEngine */
  loadRundown: (id: string): Promise<void> =>
    ipcRenderer.invoke('nextime:loadRundown', id),

  /** Pobiera aktualny stan PlaybackEngine */
  getState: (): Promise<unknown> =>
    ipcRenderer.invoke('nextime:getState'),

  /** Pobiera port WebSocket serwera */
  getWsPort: (): Promise<number> =>
    ipcRenderer.invoke('nextime:getWsPort'),

  /** Pobiera cues dla danego rundownu */
  getCues: (rundownId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getCues', rundownId),

  /** Pobiera listę projektów */
  getProjects: (): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getProjects'),

  // ── CRUD Cue ──────────────────────────────────────────────
  /** Tworzy nowy cue w rundownie */
  createCue: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:createCue', input),

  /** Aktualizuje cue */
  updateCue: (id: string, input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:updateCue', id, input),

  /** Usuwa cue */
  deleteCue: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('nextime:deleteCue', id),

  /** Zmienia kolejność cue'ów w rundownie */
  reorderCues: (rundownId: string, cueIds: string[]): Promise<void> =>
    ipcRenderer.invoke('nextime:reorderCues', rundownId, cueIds),

  // ── CRUD Rundown ──────────────────────────────────────────
  /** Tworzy nowy rundown */
  createRundown: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:createRundown', input),

  /** Usuwa rundown */
  deleteRundown: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('nextime:deleteRundown', id),

  // ── CRUD Act ────────────────────────────────────────────
  /** Pobiera akty dla rundownu */
  getActs: (rundownId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getActs', rundownId),

  /** Tworzy nowy akt */
  createAct: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:createAct', input),

  /** Aktualizuje akt */
  updateAct: (id: string, input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:updateAct', id, input),

  /** Usuwa akt */
  deleteAct: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('nextime:deleteAct', id),

  /** Ładuje akt do PlaybackEngine (tryb timeline_frames) */
  loadAct: (actId: string): Promise<void> =>
    ipcRenderer.invoke('nextime:loadAct', actId),

  // ── CRUD Track ──────────────────────────────────────────
  /** Pobiera tracki dla aktu */
  getTracks: (actId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getTracks', actId),

  /** Tworzy nowy track */
  createTrack: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:createTrack', input),

  /** Aktualizuje track */
  updateTrack: (id: string, input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:updateTrack', id, input),

  /** Usuwa track */
  deleteTrack: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('nextime:deleteTrack', id),

  // ── CRUD TimelineCue ────────────────────────────────────
  /** Pobiera timeline cues dla aktu */
  getTimelineCues: (actId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getTimelineCues', actId),

  /** Tworzy nowy timeline cue */
  createTimelineCue: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:createTimelineCue', input),

  /** Aktualizuje timeline cue */
  updateTimelineCue: (id: string, input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:updateTimelineCue', id, input),

  /** Usuwa timeline cue */
  deleteTimelineCue: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('nextime:deleteTimelineCue', id),

  // ── CRUD OutputConfig ──────────────────────────────────
  /** Pobiera output configs dla rundownu */
  getOutputConfigs: (rundownId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getOutputConfigs', rundownId),

  /** Tworzy nowy output config (share_token generowany po stronie serwera) */
  createOutputConfig: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:createOutputConfig', input),

  /** Aktualizuje output config */
  updateOutputConfig: (id: string, input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:updateOutputConfig', id, input),

  /** Usuwa output config */
  deleteOutputConfig: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('nextime:deleteOutputConfig', id),

  /** Pobiera output config po share_token */
  getOutputConfigByToken: (token: string): Promise<unknown> =>
    ipcRenderer.invoke('nextime:getOutputConfigByToken', token),

  /** Pobiera kolumny rundownu */
  getColumns: (rundownId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getColumns', rundownId),

  /** Tworzy kolumnę w rundownie */
  createColumn: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:createColumn', input),

  /** Aktualizuje kolumnę */
  updateColumn: (id: string, input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:updateColumn', id, input),

  /** Usuwa kolumnę */
  deleteColumn: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('nextime:deleteColumn', id),

  /** Zmienia kolejność kolumn */
  reorderColumns: (rundownId: string, columnIds: string[]): Promise<void> =>
    ipcRenderer.invoke('nextime:reorderColumns', rundownId, columnIds),

  /** Pobiera komórki dla cue */
  getCells: (cueId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getCells', cueId),

  /** Aktualizuje komórkę (upsert — tworzy jeśli nie istnieje) */
  updateCell: (cueId: string, columnId: string, content: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:updateCell', cueId, columnId, content),

  /** Pobiera port HTTP serwera (do budowania linków output) */
  getHttpPort: (): Promise<number> =>
    ipcRenderer.invoke('nextime:getHttpPort'),

  // ── CRUD CameraPreset (Faza 10) ──────────────────────────
  /** Pobiera camera presets dla projektu */
  getCameraPresets: (projectId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getCameraPresets', projectId),

  /** Tworzy camera preset */
  createCameraPreset: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:createCameraPreset', input),

  /** Aktualizuje camera preset */
  updateCameraPreset: (id: string, input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:updateCameraPreset', id, input),

  /** Usuwa camera preset */
  deleteCameraPreset: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('nextime:deleteCameraPreset', id),

  // ── CRUD MediaFile (Faza 10) ────────────────────────────
  /** Pobiera pliki media dla aktu */
  getMediaFiles: (actId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getMediaFiles', actId),

  /** Tworzy rekord media file */
  createMediaFile: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:createMediaFile', input),

  /** Usuwa media file */
  deleteMediaFile: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('nextime:deleteMediaFile', id),

  /** Pobiera status media playback */
  getMediaStatus: (): Promise<unknown> =>
    ipcRenderer.invoke('nextime:getMediaStatus'),

  // ── LTC (Faza 10) ────────────────────────────────────────
  /** Pobiera status LTC readera */
  getLtcStatus: (): Promise<unknown> =>
    ipcRenderer.invoke('nextime:getLtcStatus'),

  /** Zmienia źródło LTC (internal/ltc/mtc/manual) */
  setLtcSource: (source: string): Promise<void> =>
    ipcRenderer.invoke('nextime:setLtcSource', source),

  // ── LTC MTC (Faza 22) ──────────────────────────────────────
  /** Lista portów MIDI Input (dla MTC) */
  ltcListMtcPorts: (): Promise<Array<{ index: number; name: string }>> =>
    ipcRenderer.invoke('nextime:ltcListMtcPorts'),

  /** Połącz MTC na podanym porcie MIDI Input */
  ltcConnectMtc: (portIndex: number): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('nextime:ltcConnectMtc', portIndex),

  /** Rozłącz MTC */
  ltcDisconnectMtc: (): Promise<void> =>
    ipcRenderer.invoke('nextime:ltcDisconnectMtc'),

  /** Czy moduł MIDI Input jest dostępny */
  ltcIsMidiAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('nextime:ltcIsMidiAvailable'),

  // ── CRUD TextVariable (Faza 11) ──────────────────────────
  /** Pobiera text variables dla rundownu */
  getTextVariables: (rundownId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getTextVariables', rundownId),

  /** Tworzy text variable */
  createTextVariable: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:createTextVariable', input),

  /** Aktualizuje text variable */
  updateTextVariable: (id: string, input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:updateTextVariable', id, input),

  /** Usuwa text variable */
  deleteTextVariable: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('nextime:deleteTextVariable', id),

  /** Pobiera mapę zmiennych (klucz→wartość) */
  getTextVariableMap: (rundownId: string): Promise<Record<string, string>> =>
    ipcRenderer.invoke('nextime:getTextVariableMap', rundownId),

  // ── CRUD CueGroup (Faza 11) ─────────────────────────────
  /** Pobiera cue groups dla rundownu */
  getCueGroups: (rundownId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getCueGroups', rundownId),

  /** Tworzy cue group */
  createCueGroup: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:createCueGroup', input),

  /** Aktualizuje cue group */
  updateCueGroup: (id: string, input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('nextime:updateCueGroup', id, input),

  /** Usuwa cue group */
  deleteCueGroup: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('nextime:deleteCueGroup', id),

  // ── Private Notes (Faza 13) ────────────────────────────
  /** Pobiera prywatne notatki użytkownika dla rundownu */
  getPrivateNotes: (rundownId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getPrivateNotes', rundownId),

  /** Tworzy lub aktualizuje prywatną notatkę dla cue */
  upsertPrivateNote: (cueId: string, content: string): Promise<unknown> =>
    ipcRenderer.invoke('nextime:upsertPrivateNote', cueId, content),

  /** Usuwa prywatną notatkę dla cue */
  deletePrivateNote: (cueId: string): Promise<boolean> =>
    ipcRenderer.invoke('nextime:deletePrivateNote', cueId),

  // ── Column Visibility (Faza 13) ───────────────────────
  /** Ustawia widoczność kolumny (ukrywa/pokazuje) */
  setColumnVisibility: (columnId: string, hidden: boolean): Promise<unknown> =>
    ipcRenderer.invoke('nextime:setColumnVisibility', columnId, hidden),

  /** Pobiera ustawienia widoczności kolumn dla rundownu */
  getColumnVisibilities: (rundownId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getColumnVisibilities', rundownId),

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

  // ── Export / Import Rundownu (Faza 15) ──────────────────
  /** Eksportuje rundown do pliku .nextime.json (dialog Save As) */
  exportRundown: (rundownId: string): Promise<{ ok: boolean; filePath?: string; error?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('nextime:exportRundown', rundownId),

  /** Importuje rundown z pliku .nextime.json (dialog Open File) */
  importRundown: (): Promise<{ ok: boolean; rundownId?: string; error?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('nextime:importRundown'),

  // ── Undo / Redo (Faza 16) ─────────────────────────────────
  /** Cofnij ostatnią operację */
  undo: (): Promise<{ ok: boolean; description: string; canUndo: boolean; canRedo: boolean }> =>
    ipcRenderer.invoke('nextime:undo'),

  /** Przywróć cofniętą operację */
  redo: (): Promise<{ ok: boolean; description: string; canUndo: boolean; canRedo: boolean }> =>
    ipcRenderer.invoke('nextime:redo'),

  /** Pobierz stan undo/redo */
  getUndoState: (): Promise<{ canUndo: boolean; canRedo: boolean; undoDescription: string; redoDescription: string }> =>
    ipcRenderer.invoke('nextime:getUndoState'),

  // ── OSC Sender (Faza 17) ────────────────────────────────────
  /** Wysyła testowy pakiet OSC i zwraca wynik */
  oscTestSend: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('nextime:oscTestSend'),

  /** Pobiera konfigurację OSC */
  oscGetConfig: (): Promise<{ host: string; port: number; enabled: boolean }> =>
    ipcRenderer.invoke('nextime:oscGetConfig'),

  /** Aktualizuje konfigurację OSC */
  oscUpdateConfig: (config: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('nextime:oscUpdateConfig', config),

  // ── MIDI Sender (Faza 17) ───────────────────────────────────
  /** Pobiera listę dostępnych portów MIDI out */
  midiListPorts: (): Promise<Array<{ index: number; name: string }>> =>
    ipcRenderer.invoke('nextime:midiListPorts'),

  /** Otwiera port MIDI po indeksie */
  midiOpenPort: (portIndex: number): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('nextime:midiOpenPort', portIndex),

  /** Zamyka otwarty port MIDI */
  midiClosePort: (): Promise<void> =>
    ipcRenderer.invoke('nextime:midiClosePort'),

  /** Wysyła testową notę MIDI i zwraca wynik */
  midiTestSend: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('nextime:midiTestSend'),

  /** Pobiera konfigurację MIDI */
  midiGetConfig: (): Promise<{ portName: string; defaultChannel: number; enabled: boolean }> =>
    ipcRenderer.invoke('nextime:midiGetConfig'),

  /** Aktualizuje konfigurację MIDI */
  midiUpdateConfig: (config: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('nextime:midiUpdateConfig', config),

  /** Sprawdza czy moduł MIDI jest dostępny */
  midiIsAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('nextime:midiIsAvailable'),

  // ── PTZ Sender (Faza 22) ───────────────────────────────────
  /** Łączy z kamerą PTZ */
  ptzConnect: (cameraNumber: number): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('nextime:ptzConnect', cameraNumber),

  /** Rozłącza kamerę PTZ */
  ptzDisconnect: (cameraNumber: number): Promise<void> =>
    ipcRenderer.invoke('nextime:ptzDisconnect', cameraNumber),

  /** Recall preset na kamerze PTZ */
  ptzRecallPreset: (cameraNumber: number, presetNr: number): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('nextime:ptzRecallPreset', cameraNumber, presetNr),

  /** Status wszystkich kamer PTZ */
  ptzGetStatus: (): Promise<Array<{ cameraNumber: number; protocol: string; connected: boolean; lastError?: string }>> =>
    ipcRenderer.invoke('nextime:ptzGetStatus'),

  /** Lista portów serial (dla VISCA Serial) */
  ptzListSerialPorts: (): Promise<Array<{ path: string; manufacturer?: string }>> =>
    ipcRenderer.invoke('nextime:ptzListSerialPorts'),

  // ── GPI Sender (Faza 22) ───────────────────────────────────
  /** Lista dostępnych portów serial */
  gpiListPorts: (): Promise<Array<{ path: string; manufacturer?: string; friendlyName?: string }>> =>
    ipcRenderer.invoke('nextime:gpiListPorts'),

  /** Otwiera port serial GPI */
  gpiOpenPort: (portPath: string, baudRate: number): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('nextime:gpiOpenPort', portPath, baudRate),

  /** Zamyka port serial GPI */
  gpiClosePort: (): Promise<void> =>
    ipcRenderer.invoke('nextime:gpiClosePort'),

  /** Testowy trigger GPI */
  gpiTestSend: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('nextime:gpiTestSend'),

  /** Czy moduł serialport jest dostępny */
  gpiIsAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('nextime:gpiIsAvailable'),

  // ── Settings (Faza 18) ──────────────────────────────────────
  /** Pobiera wszystkie ustawienia */
  getSettings: (): Promise<unknown> =>
    ipcRenderer.invoke('nextime:getSettings'),

  /** Pobiera ustawienia jednej sekcji (np. 'osc', 'midi', 'atem') */
  getSettingsSection: (section: string): Promise<unknown> =>
    ipcRenderer.invoke('nextime:getSettingsSection', section),

  /** Aktualizuje ustawienia sekcji i propaguje do sendera */
  updateSettings: (section: string, values: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('nextime:updateSettings', section, values),

  // ── Multi-Window (Faza 19) ────────────────────────────────────
  /** Pobiera listę dostępnych monitorów */
  getDisplays: (): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getDisplays'),

  /** Otwiera okno promptera (fullscreen, alwaysOnTop) */
  openPrompterWindow: (shareToken: string, displayId?: number): Promise<{ ok: boolean; windowId: string }> =>
    ipcRenderer.invoke('nextime:openPrompterWindow', shareToken, displayId),

  /** Otwiera okno output (CueApp/Single view) */
  openOutputWindow: (shareToken: string, outputName: string): Promise<{ ok: boolean; windowId: string }> =>
    ipcRenderer.invoke('nextime:openOutputWindow', shareToken, outputName),

  /** Zamyka dodatkowe okno po ID */
  closeWindow: (windowId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('nextime:closeWindow', windowId),

  /** Pobiera listę otwartych dodatkowych okien */
  getOpenWindows: (): Promise<unknown[]> =>
    ipcRenderer.invoke('nextime:getOpenWindows'),
});
