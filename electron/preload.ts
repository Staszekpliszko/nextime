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
});
