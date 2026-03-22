import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { openDatabase, closeDb } from './db/connection';
import { runMigrations } from './db/migrate';
import { createRundownRepo, createCueRepo, createProjectRepo, createEventRepo, createUserRepo, createActRepo, createTrackRepo, createTimelineCueRepo, createOutputConfigRepo, createColumnRepo, createCellRepo, createCameraPresetRepo, createMediaFileRepo, createTextVariableRepo, createCueGroupRepo, createPrivateNoteRepo, createSettingsRepo } from './db/repositories';
import { PlaybackEngine } from './playback-engine';
import { RundownWsServer } from './ws-server';
import { createHttpServer } from './http-server';
import { SenderManager } from './senders';
import { SettingsManager } from './settings-manager';
import { registerSettingsIpcHandlers } from './ipc/settings-ipc';
import { registerWindowIpcHandlers } from './ipc/window-ipc';
import { registerObsIpcHandlers } from './ipc/obs-ipc';
import { WindowManager } from './window-manager';
import { resolvePreloadPath } from './paths';
import { seedDemoData } from './db/seed-demo';
import { exportRundownToJson, importRundownFromJson } from './export-import';
import { probeMediaFile, generateWaveform, MediaIpcBridge } from './media';
import {
  UndoManager,
  createCueCommand, deleteCueCommand, updateCueCommand, reorderCuesCommand,
  createColumnCommand, deleteColumnCommand, updateColumnCommand,
  updateCellCommand,
  createCueGroupCommand, deleteCueGroupCommand, updateCueGroupCommand,
  createTextVariableCommand, deleteTextVariableCommand, updateTextVariableCommand,
} from './undo-manager';
import fs from 'fs';
import type { AtemSenderConfig } from './senders/atem-sender';
import type { Server } from 'http';
import type { CreateCueInput, UpdateCueInput } from './db/repositories/cue.repo';
import type { CreateRundownInput } from './db/repositories/rundown.repo';
import type { CreateActInput, UpdateActInput } from './db/repositories/act.repo';
import type { CreateTrackInput, UpdateTrackInput } from './db/repositories/track.repo';
import type { CreateTimelineCueInput, UpdateTimelineCueInput } from './db/repositories/timeline-cue.repo';
import type { CreateOutputConfigInput, UpdateOutputConfigInput } from './db/repositories/output-config.repo';
import type { CreateCameraPresetInput, UpdateCameraPresetInput } from './db/repositories/camera-preset.repo';
import type { CreateMediaFileInput } from './db/repositories/media-file.repo';
import type { CreateTextVariableInput, UpdateTextVariableInput } from './db/repositories/text-variable.repo';
import type { CreateCueGroupInput, UpdateCueGroupInput } from './db/repositories/cue-group.repo';
import type { CreateColumnInput, UpdateColumnInput } from './db/repositories/column.repo';
import type { RundownChange } from './ws-protocol-types';
import crypto from 'crypto';

// ── Globalne referencje (nie pozwól GC zamknąć okna) ─────────
let mainWindow: BrowserWindow | null = null;
let engine: PlaybackEngine | null = null;
let wsServer: RundownWsServer | null = null;
let httpServer: Server | null = null;
let senderManager: SenderManager | null = null;
let settingsManager: SettingsManager | null = null;
let windowManager: WindowManager | null = null;
let mediaIpcBridge: MediaIpcBridge | null = null;
let wsPort = 3141;

// Repozytoria — inicjalizowane po otwarciu bazy
let rundownRepo: ReturnType<typeof createRundownRepo>;
let cueRepo: ReturnType<typeof createCueRepo>;
let projectRepo: ReturnType<typeof createProjectRepo>;
let actRepo: ReturnType<typeof createActRepo>;
let trackRepo: ReturnType<typeof createTrackRepo>;
let timelineCueRepo: ReturnType<typeof createTimelineCueRepo>;
let outputConfigRepo: ReturnType<typeof createOutputConfigRepo>;
let columnRepo: ReturnType<typeof createColumnRepo>;
let cellRepo: ReturnType<typeof createCellRepo>;
let cameraPresetRepo: ReturnType<typeof createCameraPresetRepo>;
let mediaFileRepo: ReturnType<typeof createMediaFileRepo>;
let textVariableRepo: ReturnType<typeof createTextVariableRepo>;
let cueGroupRepo: ReturnType<typeof createCueGroupRepo>;
let privateNoteRepo: ReturnType<typeof createPrivateNoteRepo>;

// Domyślny user ID — ustalany po seedowaniu (brak auth, single-user)
let localUserId = '';

// Undo/Redo manager — globalny dla sesji
const undoManager = new UndoManager();

// ── Ścieżka do preload (dev + production) ──────────────────
const PRELOAD_PATH = resolvePreloadPath();

// ── Inicjalizacja ───────────────────────────────────────────

async function initServices(): Promise<void> {
  // 1. Baza danych (E2E testy mogą nadpisać katalog userData)
  const userDataDir = process.env.NEXTIME_USER_DATA_DIR || app.getPath('userData');
  const dbPath = path.join(userDataDir, 'nextime.db');
  const db = openDatabase(dbPath);
  runMigrations(db);

  // 2. Repozytoria
  rundownRepo = createRundownRepo(db);
  cueRepo = createCueRepo(db);
  projectRepo = createProjectRepo(db);
  actRepo = createActRepo(db);
  trackRepo = createTrackRepo(db);
  timelineCueRepo = createTimelineCueRepo(db);
  outputConfigRepo = createOutputConfigRepo(db);
  columnRepo = createColumnRepo(db);
  cellRepo = createCellRepo(db);
  cameraPresetRepo = createCameraPresetRepo(db);
  mediaFileRepo = createMediaFileRepo(db);
  textVariableRepo = createTextVariableRepo(db);
  cueGroupRepo = createCueGroupRepo(db);
  privateNoteRepo = createPrivateNoteRepo(db);

  // 2a. Settings Manager — wczytaj ustawienia z DB
  const settingsRepo = createSettingsRepo(db);
  settingsManager = new SettingsManager(settingsRepo);
  settingsManager.loadAll();

  // 2b. Auto-seed: domyślny User + Event + Project (jeśli brak)
  const existingProjects = projectRepo.findAll();
  if (existingProjects.length === 0) {
    console.log('[NextTime] Brak projektów — tworzę domyślne dane...');
    const userRepo = createUserRepo(db);
    const eventRepo = createEventRepo(db);

    const user = userRepo.create({
      name: 'Operator',
      email: 'operator@nextime.local',
      password_hash: '',
    });
    const event = eventRepo.create({
      owner_id: user.id,
      name: 'Domyślny Event',
      slug: 'default',
    });
    projectRepo.create({
      owner_id: user.id,
      event_id: event.id,
      name: 'Domyślny Projekt',
      slug: 'default',
    });
    console.log('[NextTime] Domyślne dane utworzone.');
    localUserId = user.id;
  } else {
    // Pobierz istniejącego usera — bierzemy właściciela pierwszego projektu
    const firstProject = existingProjects[0];
    localUserId = firstProject ? firstProject.owner_id : '';
  }

  // 2c. Seed demo data — tworzy przykładowy rundown jeśli baza jest pusta (brak rundownów)
  const existingRundowns = rundownRepo.findAll();
  if (existingRundowns.length === 0) {
    const allProjects = projectRepo.findAll();
    if (allProjects.length > 0) {
      seedDemoData(allProjects[0]!.id, {
        rundownRepo, cueRepo, columnRepo, cellRepo,
        textVariableRepo, cueGroupRepo,
        actRepo, trackRepo, timelineCueRepo, cameraPresetRepo,
      });
    }
  }

  // 3. PlaybackEngine
  engine = new PlaybackEngine(cueRepo, rundownRepo);
  engine.setTimelineRepos(actRepo, timelineCueRepo);

  // 4. WebSocket serwer
  wsServer = new RundownWsServer(engine);
  wsPort = await wsServer.start(3141);
  console.log(`[NextTime] WebSocket server na porcie ${wsPort}`);

  // 5. HTTP API (Companion-compatible + Output views)
  const httpApp = createHttpServer(engine, {
    outputConfigRepo,
    cueRepo,
    columnRepo,
    cellRepo,
    rundownRepo,
    textVariableRepo,
    wsPort,
  });
  httpServer = httpApp.listen(3142, () => {
    console.log('[NextTime] HTTP API na porcie 3142');
  });

  // 6. Sender Manager (OSC, MIDI, GPI, Media, ATEM)
  senderManager = new SenderManager();
  senderManager.attach(engine);

  // 6a. Media IPC Bridge — most main↔renderer dla media playback (Faza 24)
  mediaIpcBridge = new MediaIpcBridge();
  mediaIpcBridge.registerIpcHandlers(ipcMain);
  senderManager.media.setIpcBridge(mediaIpcBridge);

  // 6b. Zastosuj ustawienia z DB do senderów
  settingsManager!.applyToSenders(senderManager);

  // 7. LTC Reader → Engine wiring
  senderManager.ltc.on('tc-received', (frames: number) => {
    engine!.feedExternalTc(frames);
  });

  // 8. ATEM event wiring — broadcast statusu do WS klientów
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
}

// ── IPC Handlers ────────────────────────────────────────────

function registerIpcHandlers(): void {
  // Faza 18: Settings IPC (zarejestrowane w osobnym pliku)
  if (settingsManager && senderManager) {
    registerSettingsIpcHandlers(settingsManager, senderManager);
  }

  // Faza 25: OBS IPC
  if (senderManager) {
    registerObsIpcHandlers(senderManager);
  }

  // Faza 19: Window IPC (zarządzanie oknami prompter/output)
  windowManager = new WindowManager(PRELOAD_PATH);
  registerWindowIpcHandlers(windowManager, () => 3142);

  ipcMain.handle('nextime:getRundowns', () => {
    const rundowns = rundownRepo.findAll();
    return rundowns.map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
      show_date: r.show_date,
      show_time: r.show_time,
    }));
  });

  ipcMain.handle('nextime:loadRundown', (_event, id: string) => {
    engine!.loadRundown(id);
  });

  ipcMain.handle('nextime:getState', () => {
    return engine!.getState();
  });

  ipcMain.handle('nextime:getWsPort', () => {
    return wsPort;
  });

  ipcMain.handle('nextime:getCues', (_event, rundownId: string) => {
    return cueRepo.findByRundown(rundownId);
  });

  // ── CRUD Cue ───────────────────────────────────────────────

  ipcMain.handle('nextime:createCue', (_event, input: CreateCueInput) => {
    // Faza 11: walidacja
    if (input.duration_ms !== undefined && input.duration_ms < 0) {
      throw new Error('duration_ms nie moze byc ujemne');
    }
    const cue = cueRepo.create(input);

    // Faza 16: rejestracja undo
    undoManager.pushCommand(createCueCommand(cue, { cueRepo, cellRepo }));

    // Broadcast delta do klientów WS
    if (wsServer) {
      const change: RundownChange = {
        op: 'cue_added',
        cue: {
          id: cue.id,
          title: cue.title,
          subtitle: cue.subtitle,
          duration_ms: cue.duration_ms,
          start_type: cue.start_type,
          hard_start_datetime: cue.start_type === 'hard' ? cue.hard_start_datetime : undefined,
          auto_start: cue.auto_start,
          locked: cue.locked,
          background_color: cue.background_color,
          group_id: cue.group_id,
          sort_order: cue.sort_order,
        },
      };
      wsServer.broadcastDelta(input.rundown_id, [change]);
    }

    // Przeładuj cues w engine jeśli to aktywny rundown
    reloadEngineIfActive(input.rundown_id);

    return cue;
  });

  ipcMain.handle('nextime:updateCue', (_event, id: string, input: UpdateCueInput) => {
    // Faza 16: pobierz stare dane przed update
    const oldCue = cueRepo.findById(id);
    const cue = cueRepo.update(id, input);
    if (!cue) return undefined;

    // Faza 16: rejestracja undo — odtwórz stare pola
    if (oldCue) {
      const oldData: Partial<Omit<CreateCueInput, 'rundown_id'>> = {};
      const newData: Partial<Omit<CreateCueInput, 'rundown_id'>> = {};
      for (const key of Object.keys(input) as Array<keyof UpdateCueInput>) {
        (oldData as unknown as Record<string, unknown>)[key] = (oldCue as unknown as Record<string, unknown>)[key];
        (newData as unknown as Record<string, unknown>)[key] = input[key];
      }
      undoManager.pushCommand(updateCueCommand(id, oldData, newData, { cueRepo }, oldCue.title));
    }

    // Broadcast delta
    if (wsServer) {
      const change: RundownChange = {
        op: 'cue_updated',
        cue: {
          id: cue.id,
          title: cue.title,
          subtitle: cue.subtitle,
          duration_ms: cue.duration_ms,
          start_type: cue.start_type,
          hard_start_datetime: cue.start_type === 'hard' ? cue.hard_start_datetime : undefined,
          auto_start: cue.auto_start,
          locked: cue.locked,
          background_color: cue.background_color,
          group_id: cue.group_id,
          sort_order: cue.sort_order,
        },
      };
      // Potrzebujemy rundown_id — pobieramy z cue
      wsServer.broadcastDelta(cue.rundown_id, [change]);
    }

    reloadEngineIfActive(cue.rundown_id);

    return cue;
  });

  ipcMain.handle('nextime:deleteCue', (_event, id: string) => {
    // Pobierz cue przed usunięciem, żeby znać rundown_id
    const cue = cueRepo.findById(id);
    if (!cue) return false;

    // Faza 16: snapshot cells przed usunięciem (cascade delete usunie komórki)
    const cells = cellRepo.findByCue(id);

    const deleted = cueRepo.delete(id);

    if (deleted) {
      // Faza 16: rejestracja undo
      undoManager.pushCommand(deleteCueCommand({ cue, cells }, { cueRepo, cellRepo }));

      if (wsServer) {
        const change: RundownChange = { op: 'cue_deleted', cue_id: id };
        wsServer.broadcastDelta(cue.rundown_id, [change]);
      }
      reloadEngineIfActive(cue.rundown_id);
    }

    return deleted;
  });

  ipcMain.handle('nextime:reorderCues', (_event, rundownId: string, cueIds: string[]) => {
    // Faza 16: pobierz starą kolejność przed reorderem
    const oldOrder = cueRepo.findByRundown(rundownId).map(c => c.id);

    cueRepo.reorder(rundownId, cueIds);

    // Faza 16: rejestracja undo
    undoManager.pushCommand(reorderCuesCommand(rundownId, oldOrder, cueIds, { cueRepo }));

    // Broadcast delta — po reorder wysyłamy cue_moved dla każdego
    if (wsServer) {
      const changes: RundownChange[] = cueIds.map((cueId, index) => ({
        op: 'cue_moved' as const,
        cue_id: cueId,
        new_order: index,
      }));
      wsServer.broadcastDelta(rundownId, changes);
    }

    reloadEngineIfActive(rundownId);
  });

  // ── CRUD Rundown ──────────────────────────────────────────

  ipcMain.handle('nextime:createRundown', (_event, input: CreateRundownInput) => {
    const rundown = rundownRepo.create(input);
    return rundown;
  });

  ipcMain.handle('nextime:deleteRundown', (_event, id: string) => {
    return rundownRepo.delete(id);
  });

  // ── Projects ──────────────────────────────────────────────

  ipcMain.handle('nextime:getProjects', () => {
    return projectRepo.findAll();
  });

  // ── CRUD Act ───────────────────────────────────────────────

  ipcMain.handle('nextime:getActs', (_event, rundownId: string) => {
    return actRepo.findByRundown(rundownId);
  });

  ipcMain.handle('nextime:createAct', (_event, input: CreateActInput) => {
    return actRepo.create(input);
  });

  ipcMain.handle('nextime:updateAct', (_event, id: string, input: UpdateActInput) => {
    return actRepo.update(id, input);
  });

  ipcMain.handle('nextime:deleteAct', (_event, id: string) => {
    // Faza 11: jeśli usuwamy aktywny akt, wyczyść stan engine
    const state = engine!.getState();
    const isActiveAct = state && state.mode === 'timeline_frames' && 'actId' in state && state.actId === id;

    const deleted = actRepo.delete(id);

    if (deleted && isActiveAct) {
      engine!.destroy();
      engine = new PlaybackEngine(cueRepo, rundownRepo);
      engine.setTimelineRepos(actRepo, timelineCueRepo);
      senderManager?.attach(engine);
    }

    return deleted;
  });

  ipcMain.handle('nextime:loadAct', (_event, actId: string) => {
    engine!.loadAct(actId);
  });

  // ── CRUD Track ─────────────────────────────────────────────

  ipcMain.handle('nextime:getTracks', (_event, actId: string) => {
    return trackRepo.findByAct(actId);
  });

  ipcMain.handle('nextime:createTrack', (_event, input: CreateTrackInput) => {
    return trackRepo.create(input);
  });

  ipcMain.handle('nextime:updateTrack', (_event, id: string, input: UpdateTrackInput) => {
    return trackRepo.update(id, input);
  });

  ipcMain.handle('nextime:deleteTrack', (_event, id: string) => {
    const deleted = trackRepo.delete(id);
    // Faza 11: przeładuj cache cue'ów w engine po usunięciu tracka (cascade usunęło cue'y)
    if (deleted) engine!.reloadTimelineCues();
    return deleted;
  });

  // ── CRUD TimelineCue ───────────────────────────────────────

  ipcMain.handle('nextime:getTimelineCues', (_event, actId: string) => {
    return timelineCueRepo.findByAct(actId);
  });

  ipcMain.handle('nextime:createTimelineCue', (_event, input: CreateTimelineCueInput) => {
    const cue = timelineCueRepo.create(input);
    // Faza 6: przeładuj cache cue'ów w engine
    engine!.reloadTimelineCues();
    return cue;
  });

  ipcMain.handle('nextime:updateTimelineCue', (_event, id: string, input: UpdateTimelineCueInput) => {
    const cue = timelineCueRepo.update(id, input);
    // Faza 6: przeładuj cache cue'ów w engine
    engine!.reloadTimelineCues();
    return cue;
  });

  ipcMain.handle('nextime:deleteTimelineCue', (_event, id: string) => {
    const deleted = timelineCueRepo.delete(id);
    // Faza 6: przeładuj cache cue'ów w engine
    if (deleted) engine!.reloadTimelineCues();
    return deleted;
  });

  // ── ATEM ────────────────────────────────────────────────

  ipcMain.handle('nextime:atemGetStatus', () => {
    return senderManager?.atem.getStatus() ?? {
      connected: false, programInput: null, previewInput: null,
      modelName: null, ip: '192.168.10.240', meIndex: 0, autoSwitch: true,
    };
  });

  ipcMain.handle('nextime:atemConfigure', (_event, config: Record<string, unknown>) => {
    if (!senderManager) return;
    senderManager.atem.updateConfig(config as Partial<AtemSenderConfig>);
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

  // ── CRUD OutputConfig ────────────────────────────────────────

  ipcMain.handle('nextime:getOutputConfigs', (_event, rundownId: string) => {
    return outputConfigRepo.findByRundown(rundownId);
  });

  ipcMain.handle('nextime:createOutputConfig', (_event, input: Omit<CreateOutputConfigInput, 'share_token'>) => {
    // Generujemy bezpieczny share_token po stronie serwera
    const shareToken = crypto.randomUUID();
    return outputConfigRepo.create({
      ...input,
      share_token: shareToken,
    });
  });

  ipcMain.handle('nextime:updateOutputConfig', (_event, id: string, input: UpdateOutputConfigInput) => {
    return outputConfigRepo.update(id, input);
  });

  ipcMain.handle('nextime:deleteOutputConfig', (_event, id: string) => {
    return outputConfigRepo.delete(id);
  });

  ipcMain.handle('nextime:getOutputConfigByToken', (_event, token: string) => {
    return outputConfigRepo.findByToken(token);
  });

  // ── CRUD Column (Faza 12) ─────────────────────────────────────

  ipcMain.handle('nextime:getColumns', (_event, rundownId: string) => {
    return columnRepo.findByRundown(rundownId);
  });

  ipcMain.handle('nextime:createColumn', (_event, input: CreateColumnInput) => {
    if (!input.name || !input.name.trim()) {
      throw new Error('Nazwa kolumny nie może być pusta');
    }
    const column = columnRepo.create(input);

    // Faza 16: rejestracja undo
    undoManager.pushCommand(createColumnCommand(column, { columnRepo }));

    if (wsServer) {
      const change: RundownChange = {
        op: 'column_added',
        column: { id: column.id, name: column.name, type: column.type, sort_order: column.sort_order },
      };
      wsServer.broadcastDelta(input.rundown_id, [change]);
    }

    return column;
  });

  ipcMain.handle('nextime:updateColumn', (_event, id: string, input: UpdateColumnInput) => {
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error('Nazwa kolumny nie może być pusta');
    }
    // Faza 16: pobierz stare dane
    const oldColumn = columnRepo.findById(id);
    const result = columnRepo.update(id, input);

    if (oldColumn && result) {
      const oldData: Partial<Omit<CreateColumnInput, 'rundown_id'>> = {};
      const newData: Partial<Omit<CreateColumnInput, 'rundown_id'>> = {};
      for (const key of Object.keys(input) as Array<keyof UpdateColumnInput>) {
        (oldData as unknown as Record<string, unknown>)[key] = (oldColumn as unknown as Record<string, unknown>)[key];
        (newData as unknown as Record<string, unknown>)[key] = input[key];
      }
      undoManager.pushCommand(updateColumnCommand(id, oldData, newData, { columnRepo }, oldColumn.name));
    }

    return result;
  });

  ipcMain.handle('nextime:deleteColumn', (_event, id: string) => {
    const column = columnRepo.findById(id);
    if (!column) return false;

    const deleted = columnRepo.delete(id);

    if (deleted) {
      // Faza 16: rejestracja undo
      undoManager.pushCommand(deleteColumnCommand(column, { columnRepo }));

      if (wsServer) {
        const change: RundownChange = { op: 'column_deleted', column_id: id };
        wsServer.broadcastDelta(column.rundown_id, [change]);
      }
    }

    return deleted;
  });

  ipcMain.handle('nextime:reorderColumns', (_event, rundownId: string, columnIds: string[]) => {
    columnRepo.reorder(rundownId, columnIds);
  });

  // ── CRUD Cell (Faza 12) ──────────────────────────────────────

  ipcMain.handle('nextime:getCells', (_event, cueId: string) => {
    return cellRepo.findByCue(cueId);
  });

  ipcMain.handle('nextime:updateCell', (_event, cueId: string, columnId: string, content: {
    content_type?: string;
    richtext?: unknown;
    dropdown_value?: string;
    file_ref?: string;
  }) => {
    // Faza 16: pobierz starą komórkę
    const existingCells = cellRepo.findByCue(cueId);
    const oldCell = existingCells.find(c => c.column_id === columnId);
    const oldCellData = oldCell ? {
      content_type: oldCell.content_type,
      richtext: oldCell.richtext,
      dropdown_value: oldCell.dropdown_value,
      file_ref: oldCell.file_ref,
    } : null;

    const cell = cellRepo.upsert({
      cue_id: cueId,
      column_id: columnId,
      content_type: content.content_type as 'richtext' | 'dropdown_value' | 'file_ref' | undefined,
      richtext: content.richtext,
      dropdown_value: content.dropdown_value,
      file_ref: content.file_ref,
    });

    // Faza 16: rejestracja undo
    undoManager.pushCommand(updateCellCommand(
      cueId, columnId,
      oldCellData,
      {
        content_type: content.content_type as 'richtext' | 'dropdown_value' | 'file_ref' | undefined,
        richtext: content.richtext,
        dropdown_value: content.dropdown_value,
        file_ref: content.file_ref,
      },
      { cellRepo },
    ));

    // Broadcast delta do WS klientów — potrzebujemy rundown_id z cue
    if (wsServer) {
      const cue = cueRepo.findById(cueId);
      if (cue) {
        const change: RundownChange = {
          op: 'cell_updated',
          cue_id: cueId,
          column_id: columnId,
          richtext: cell.richtext,
          dropdown_value: cell.dropdown_value,
        };
        wsServer.broadcastDelta(cue.rundown_id, [change]);
      }
    }

    return cell;
  });

  // ── CRUD CameraPreset (Faza 10) ──────────────────────────────

  ipcMain.handle('nextime:getCameraPresets', (_event, projectId: string) => {
    return cameraPresetRepo.findByProject(projectId);
  });

  ipcMain.handle('nextime:createCameraPreset', (_event, input: CreateCameraPresetInput) => {
    return cameraPresetRepo.create(input);
  });

  ipcMain.handle('nextime:updateCameraPreset', (_event, id: string, input: UpdateCameraPresetInput) => {
    return cameraPresetRepo.update(id, input);
  });

  ipcMain.handle('nextime:deleteCameraPreset', (_event, id: string) => {
    return cameraPresetRepo.delete(id);
  });

  // ── CRUD MediaFile (Faza 10) ─────────────────────────────────

  ipcMain.handle('nextime:getMediaFiles', (_event, actId: string) => {
    return mediaFileRepo.findByAct(actId);
  });

  ipcMain.handle('nextime:createMediaFile', (_event, input: CreateMediaFileInput) => {
    return mediaFileRepo.create(input);
  });

  ipcMain.handle('nextime:deleteMediaFile', (_event, id: string) => {
    return mediaFileRepo.delete(id);
  });

  ipcMain.handle('nextime:getMediaStatus', () => {
    if (!senderManager) return { playing: false, currentFile: null, volume: 100 };
    return senderManager.media.getStatus();
  });

  // ── Media Playback Control (Faza 24) ─────────────────────────────

  ipcMain.handle('nextime:mediaStop', () => {
    if (!senderManager) return;
    senderManager.media.stop();
  });

  ipcMain.handle('nextime:mediaSeek', (_event, timeSec: number) => {
    if (!senderManager) return;
    senderManager.media.seek(timeSec);
  });

  ipcMain.handle('nextime:mediaPause', () => {
    if (!senderManager) return;
    senderManager.media.pause();
  });

  ipcMain.handle('nextime:mediaResume', () => {
    if (!senderManager) return;
    senderManager.media.resume();
  });

  ipcMain.handle('nextime:mediaSetVolume', (_event, volume: number) => {
    if (!senderManager) return;
    senderManager.media.setVolume(volume);
  });

  // ── Media Infrastructure (Faza 23) ─────────────────────────────

  ipcMain.handle('nextime:probeMediaFile', async (_event, filePath: string) => {
    return probeMediaFile(filePath);
  });

  ipcMain.handle('nextime:selectMediaFile', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz plik media',
      filters: [
        { name: 'Media', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
        { name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv'] },
        { name: 'Wszystkie pliki', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0]!;
    const fileName = path.basename(filePath);
    return { filePath, fileName };
  });

  ipcMain.handle('nextime:generateWaveform', async (_event, filePath: string, samples?: number) => {
    return generateWaveform(filePath, samples);
  });

  ipcMain.handle('nextime:updateMediaFileDuration', (_event, id: string, durationFrames: number, waveformData?: number[]) => {
    return mediaFileRepo.updateDurationAndWaveform(id, durationFrames, waveformData);
  });

  // ── LTC (Faza 10) ─────────────────────────────────────────────

  ipcMain.handle('nextime:getLtcStatus', () => {
    return senderManager?.ltc.getStatus() ?? {
      source: 'internal', connected: false,
      lastTcFrames: null, lastTcFormatted: null,
      lastReceivedAt: null, midiAvailable: false,
    };
  });

  ipcMain.handle('nextime:setLtcSource', (_event, source: string) => {
    if (!['internal', 'ltc', 'mtc', 'manual'].includes(source)) return;
    const typed = source as 'internal' | 'ltc' | 'mtc' | 'manual';
    // Ustaw w engine
    engine!.setLtcSource(typed);
    // Ustaw w LtcReader
    senderManager?.ltc.setSource(typed);
    // Połącz/rozłącz jeśli trzeba
    if (typed === 'ltc' || typed === 'mtc') {
      senderManager?.ltc.connect();
    } else {
      senderManager?.ltc.disconnect();
    }
  });

  // ── LTC MTC (Faza 22) ────────────────────────────────────────

  ipcMain.handle('nextime:ltcListMtcPorts', () => {
    if (!senderManager) return [];
    return senderManager.ltc.listMtcPorts();
  });

  ipcMain.handle('nextime:ltcConnectMtc', (_event, portIndex: number) => {
    if (!senderManager) return { ok: false, error: 'SenderManager nie zainicjalizowany' };
    return senderManager.ltc.connectMtc(portIndex);
  });

  ipcMain.handle('nextime:ltcDisconnectMtc', () => {
    if (!senderManager) return;
    senderManager.ltc.disconnectMtc();
  });

  ipcMain.handle('nextime:ltcIsMidiAvailable', () => {
    if (!senderManager) return false;
    return senderManager.ltc.isMidiAvailable();
  });

  // ── CRUD TextVariable (Faza 11) ──────────────────────────────

  ipcMain.handle('nextime:getTextVariables', (_event, rundownId: string) => {
    return textVariableRepo.findByRundown(rundownId);
  });

  ipcMain.handle('nextime:createTextVariable', (_event, input: CreateTextVariableInput) => {
    // Walidacja klucza: tylko [a-z0-9-]
    if (!/^[a-z0-9-]+$/.test(input.key)) {
      throw new Error('Klucz zmiennej może zawierać tylko małe litery, cyfry i myślniki (a-z0-9-)');
    }
    const variable = textVariableRepo.create(input);

    // Faza 16: rejestracja undo
    undoManager.pushCommand(createTextVariableCommand(variable, { textVariableRepo }));

    // Broadcast zmiana zmiennych
    if (wsServer) {
      wsServer.broadcastDelta(input.rundown_id, [{
        op: 'variable_changed' as RundownChange['op'],
        variable: { key: variable.key, value: variable.value },
      } as RundownChange]);
    }

    return variable;
  });

  ipcMain.handle('nextime:updateTextVariable', (_event, id: string, input: UpdateTextVariableInput) => {
    // Faza 16: pobierz stare dane
    const oldVar = textVariableRepo.findById(id);

    const variable = textVariableRepo.update(id, input);
    if (!variable) return undefined;

    // Faza 16: rejestracja undo
    if (oldVar) {
      const oldData: { value?: string; description?: string } = {};
      const newData: { value?: string; description?: string } = {};
      if (input.value !== undefined) {
        oldData.value = oldVar.value;
        newData.value = input.value;
      }
      if (input.description !== undefined) {
        oldData.description = oldVar.description;
        newData.description = input.description;
      }
      undoManager.pushCommand(updateTextVariableCommand(id, oldData, newData, { textVariableRepo }, oldVar.key));
    }

    // Broadcast zmiana zmiennych
    if (wsServer) {
      const fullVar = textVariableRepo.findById(id);
      if (fullVar) {
        wsServer.broadcastDelta(fullVar.rundown_id, [{
          op: 'variable_changed' as RundownChange['op'],
          variable: { key: fullVar.key, value: fullVar.value },
        } as RundownChange]);
      }
    }

    return variable;
  });

  ipcMain.handle('nextime:deleteTextVariable', (_event, id: string) => {
    const variable = textVariableRepo.findById(id);
    if (!variable) return false;
    const deleted = textVariableRepo.delete(id);

    if (deleted) {
      // Faza 16: rejestracja undo
      undoManager.pushCommand(deleteTextVariableCommand(variable, { textVariableRepo }));

      if (wsServer) {
        wsServer.broadcastDelta(variable.rundown_id, [{
          op: 'variable_changed' as RundownChange['op'],
          variable: { key: variable.key, value: '' },
        } as RundownChange]);
      }
    }

    return deleted;
  });

  ipcMain.handle('nextime:getTextVariableMap', (_event, rundownId: string) => {
    return textVariableRepo.getVariableMap(rundownId);
  });

  // ── CRUD CueGroup (Faza 11) ──────────────────────────────────

  ipcMain.handle('nextime:getCueGroups', (_event, rundownId: string) => {
    return cueGroupRepo.findByRundown(rundownId);
  });

  ipcMain.handle('nextime:createCueGroup', (_event, input: CreateCueGroupInput) => {
    if (!input.label || input.label.trim().length === 0) {
      throw new Error('Nazwa grupy jest wymagana');
    }
    const group = cueGroupRepo.create(input);

    // Faza 16: rejestracja undo
    undoManager.pushCommand(createCueGroupCommand(group, { cueGroupRepo }));

    if (wsServer) {
      const change: RundownChange = {
        op: 'group_added',
        group: { id: group.id, label: group.label, sort_order: group.sort_order },
      };
      wsServer.broadcastDelta(input.rundown_id, [change]);
    }

    return group;
  });

  ipcMain.handle('nextime:updateCueGroup', (_event, id: string, input: UpdateCueGroupInput) => {
    // Faza 16: pobierz stare dane
    const oldGroup = cueGroupRepo.findById(id);
    const result = cueGroupRepo.update(id, input);

    if (oldGroup && result) {
      const oldData: Partial<Omit<CreateCueGroupInput, 'rundown_id'>> = {};
      const newData: Partial<Omit<CreateCueGroupInput, 'rundown_id'>> = {};
      for (const key of Object.keys(input) as Array<keyof UpdateCueGroupInput>) {
        (oldData as unknown as Record<string, unknown>)[key] = (oldGroup as unknown as Record<string, unknown>)[key];
        (newData as unknown as Record<string, unknown>)[key] = input[key];
      }
      undoManager.pushCommand(updateCueGroupCommand(id, oldData, newData, { cueGroupRepo }, oldGroup.label));
    }

    return result;
  });

  ipcMain.handle('nextime:deleteCueGroup', (_event, id: string) => {
    const group = cueGroupRepo.findById(id);
    if (!group) return false;
    const deleted = cueGroupRepo.delete(id);

    if (deleted) {
      // Faza 16: rejestracja undo
      undoManager.pushCommand(deleteCueGroupCommand(group, { cueGroupRepo }));

      if (wsServer) {
        const change: RundownChange = { op: 'group_deleted', group_id: id };
        wsServer.broadcastDelta(group.rundown_id, [change]);
      }
    }

    return deleted;
  });

  // ── Private Notes (Faza 13) ──────────────────────────────────

  ipcMain.handle('nextime:getPrivateNotes', (_event, rundownId: string) => {
    return privateNoteRepo.findByRundownAndUser(rundownId, localUserId);
  });

  ipcMain.handle('nextime:upsertPrivateNote', (_event, cueId: string, content: string) => {
    return privateNoteRepo.upsert(cueId, localUserId, content);
  });

  ipcMain.handle('nextime:deletePrivateNote', (_event, cueId: string) => {
    return privateNoteRepo.deleteByCueAndUser(cueId, localUserId);
  });

  // ── Column Visibility (Faza 13) ─────────────────────────────

  ipcMain.handle('nextime:setColumnVisibility', (_event, columnId: string, hidden: boolean) => {
    return columnRepo.setVisibility(columnId, localUserId, hidden);
  });

  ipcMain.handle('nextime:getColumnVisibilities', (_event, rundownId: string) => {
    return columnRepo.getVisibilitiesByUser(rundownId, localUserId);
  });

  // ── HTTP port ─────────────────────────────────────────────────

  ipcMain.handle('nextime:getHttpPort', () => {
    return 3142;
  });

  // ── Undo / Redo (Faza 16) ────────────────────────────────────

  ipcMain.handle('nextime:undo', () => {
    const description = undoManager.getUndoDescription();
    const ok = undoManager.undo();
    return {
      ok,
      description: ok ? description : '',
      canUndo: undoManager.canUndo(),
      canRedo: undoManager.canRedo(),
    };
  });

  ipcMain.handle('nextime:redo', () => {
    const description = undoManager.getRedoDescription();
    const ok = undoManager.redo();
    return {
      ok,
      description: ok ? description : '',
      canUndo: undoManager.canUndo(),
      canRedo: undoManager.canRedo(),
    };
  });

  ipcMain.handle('nextime:getUndoState', () => {
    return {
      canUndo: undoManager.canUndo(),
      canRedo: undoManager.canRedo(),
      undoDescription: undoManager.getUndoDescription(),
      redoDescription: undoManager.getRedoDescription(),
    };
  });

  // ── Export / Import Rundownu (Faza 15) ──────────────────────

  ipcMain.handle('nextime:exportRundown', async (_event, rundownId: string) => {
    if (!mainWindow) return { ok: false, error: 'Brak okna głównego' };

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Eksportuj rundown',
      defaultPath: `rundown-export.nextime.json`,
      filters: [
        { name: 'NextTime Rundown', extensions: ['nextime.json'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }

    try {
      const data = exportRundownToJson(rundownId, {
        rundownRepo, cueRepo, columnRepo, cellRepo, textVariableRepo, cueGroupRepo,
      });
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
      return { ok: true, filePath: result.filePath };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nieznany błąd eksportu';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('nextime:importRundown', async () => {
    if (!mainWindow) return { ok: false, error: 'Brak okna głównego' };

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importuj rundown',
      filters: [
        { name: 'NextTime Rundown', extensions: ['nextime.json', 'json'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    try {
      const content = fs.readFileSync(result.filePaths[0]!, 'utf-8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return { ok: false, error: 'Nieprawidłowy format JSON' };
      }

      // Pobierz pierwszy projekt jako domyślny
      const projects = projectRepo.findAll();
      if (projects.length === 0) {
        return { ok: false, error: 'Brak projektów w bazie' };
      }

      const newRundownId = importRundownFromJson(parsed, projects[0]!.id, {
        rundownRepo, cueRepo, columnRepo, cellRepo, textVariableRepo, cueGroupRepo,
      });

      return { ok: true, rundownId: newRundownId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nieznany błąd importu';
      return { ok: false, error: message };
    }
  });

  // ── OSC Sender (Faza 17) ───────────────────────────────────

  ipcMain.handle('nextime:oscTestSend', async () => {
    if (!senderManager) return { ok: false, error: 'SenderManager nie zainicjalizowany' };
    return senderManager.osc.testSend();
  });

  ipcMain.handle('nextime:oscGetConfig', () => {
    if (!senderManager) return { host: '127.0.0.1', port: 8000, enabled: true };
    return senderManager.osc.getConfig();
  });

  ipcMain.handle('nextime:oscUpdateConfig', (_event, config: Record<string, unknown>) => {
    if (!senderManager) return;
    senderManager.osc.updateConfig(config as Partial<import('./senders/osc-sender').OscSenderConfig>);
  });

  // ── MIDI Sender (Faza 17) ──────────────────────────────────

  ipcMain.handle('nextime:midiListPorts', () => {
    if (!senderManager) return [];
    return senderManager.midi.listPorts();
  });

  ipcMain.handle('nextime:midiOpenPort', (_event, portIndex: number) => {
    if (!senderManager) return { ok: false, error: 'SenderManager nie zainicjalizowany' };
    return senderManager.midi.openPort(portIndex);
  });

  ipcMain.handle('nextime:midiClosePort', () => {
    if (!senderManager) return;
    senderManager.midi.closePort();
  });

  ipcMain.handle('nextime:midiTestSend', async () => {
    if (!senderManager) return { ok: false, error: 'SenderManager nie zainicjalizowany' };
    return senderManager.midi.testSend();
  });

  ipcMain.handle('nextime:midiGetConfig', () => {
    if (!senderManager) return { portName: 'NextTime Virtual MIDI', defaultChannel: 1, enabled: true };
    return senderManager.midi.getConfig();
  });

  ipcMain.handle('nextime:midiUpdateConfig', (_event, config: Record<string, unknown>) => {
    if (!senderManager) return;
    senderManager.midi.updateConfig(config as Partial<import('./senders/midi-sender').MidiSenderConfig>);
  });

  ipcMain.handle('nextime:midiIsAvailable', () => {
    if (!senderManager) return false;
    return senderManager.midi.isMidiAvailable();
  });

  // ── GPI Sender (Faza 22) ────────────────────────────────────

  ipcMain.handle('nextime:gpiListPorts', async () => {
    if (!senderManager) return [];
    return senderManager.gpi.listPorts();
  });

  ipcMain.handle('nextime:gpiOpenPort', (_event, portPath: string, baudRate: number) => {
    if (!senderManager) return { ok: false, error: 'SenderManager nie zainicjalizowany' };
    return senderManager.gpi.openPort(portPath, baudRate);
  });

  ipcMain.handle('nextime:gpiClosePort', () => {
    if (!senderManager) return;
    senderManager.gpi.closePort();
  });

  ipcMain.handle('nextime:gpiTestSend', () => {
    if (!senderManager) return { ok: false, error: 'SenderManager nie zainicjalizowany' };
    return senderManager.gpi.testSend();
  });

  ipcMain.handle('nextime:gpiIsAvailable', () => {
    if (!senderManager) return false;
    return senderManager.gpi.isSerialAvailable();
  });

  // ── PTZ Sender (Faza 22) ──────────────────────────────────

  ipcMain.handle('nextime:ptzConnect', async (_event, cameraNumber: number) => {
    if (!senderManager) return { ok: false, error: 'SenderManager nie zainicjalizowany' };
    return senderManager.ptz.connectCamera(cameraNumber);
  });

  ipcMain.handle('nextime:ptzDisconnect', async (_event, cameraNumber: number) => {
    if (!senderManager) return;
    await senderManager.ptz.disconnectCamera(cameraNumber);
  });

  ipcMain.handle('nextime:ptzRecallPreset', async (_event, cameraNumber: number, presetNr: number) => {
    if (!senderManager) return { ok: false, error: 'SenderManager nie zainicjalizowany' };
    await senderManager.ptz.recallPreset(cameraNumber, presetNr);
    return { ok: true };
  });

  ipcMain.handle('nextime:ptzGetStatus', () => {
    if (!senderManager) return [];
    return senderManager.ptz.getAllCameraStatuses();
  });

  ipcMain.handle('nextime:ptzListSerialPorts', async () => {
    if (!senderManager) return [];
    return senderManager.ptz.listSerialPorts();
  });
}

// ── Helper: przeładuj engine jeśli aktywny rundown ──────────

function reloadEngineIfActive(rundownId: string): void {
  if (!engine) return;
  const state = engine.getState();
  if (state && state.mode === 'rundown_ms' && state.rundownId === rundownId) {
    // Odśwież cue'y bez resetowania pozycji i playbacku
    engine.reloadCues();
  }
}

// ── BrowserWindow ───────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'NextTime — Broadcast Rundown',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Faza 24: podłącz mainWindow do MediaIpcBridge
  if (mediaIpcBridge) {
    mediaIpcBridge.setMainWindow(mainWindow);
  }

  // Dev: Vite dev server | Prod: plik HTML z dist
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Nie otwieraj DevTools w trybie E2E
    if (!process.env.NEXTIME_E2E) {
      mainWindow.webContents.openDevTools({ mode: 'bottom' });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Faza 11: Confirm dialog przed zamknięciem (jeśli show jest live)
  mainWindow.on('close', (e) => {
    if (!engine || !mainWindow) return;
    const state = engine.getState();
    const isLive = state && state.is_playing;
    if (isLive) {
      e.preventDefault();
      dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        buttons: ['Zamknij', 'Anuluj'],
        defaultId: 1,
        cancelId: 1,
        title: 'NextTime',
        message: 'Show jest aktywny (playback trwa). Czy na pewno zamknac aplikacje?',
      }).then(({ response }) => {
        if (response === 0) {
          // Użytkownik wybrał "Zamknij"
          mainWindow?.destroy();
        }
      });
    }
  });

  mainWindow.on('closed', () => {
    // Faza 19: zamknij wszystkie dodatkowe okna przy zamknięciu głównego
    if (windowManager) windowManager.closeAll();
    mainWindow = null;
  });
}

// ── Lifecycle ───────────────────────────────────────────────

app.whenReady().then(async () => {
  await initServices();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window po kliknięciu ikony w docku
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS: nie zamykaj aplikacji po zamknięciu wszystkich okien
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // Cleanup: zamknij wszystkie serwisy
  if (windowManager) windowManager.closeAll();
  if (senderManager) senderManager.destroy();
  if (engine) engine.destroy();
  if (wsServer) await wsServer.stop();
  if (httpServer) httpServer.close();
  closeDb();
});
