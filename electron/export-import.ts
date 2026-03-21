/**
 * Export/Import rundownu — format .nextime.json
 *
 * Export: serializuje rundown + cues + columns + cells + groups + variables do JSON.
 * Import: parsuje JSON, waliduje, tworzy nowe encje z nowymi UUID.
 */

import type { createRundownRepo } from './db/repositories/rundown.repo';
import type { createCueRepo } from './db/repositories/cue.repo';
import type { createColumnRepo } from './db/repositories/column.repo';
import type { createCellRepo } from './db/repositories/cell.repo';
import type { createTextVariableRepo } from './db/repositories/text-variable.repo';
import type { createCueGroupRepo } from './db/repositories/cue-group.repo';

// ── Format eksportu ──────────────────────────────────────

export interface ExportCue {
  title: string;
  subtitle: string;
  duration_ms: number;
  start_type: 'soft' | 'hard';
  hard_start_datetime?: string;
  auto_start: boolean;
  locked: boolean;
  background_color?: string;
  status: string;
  group_ref?: string;
  sort_order: number;
}

export interface ExportColumn {
  name: string;
  type: string;
  sort_order: number;
  width_px: number;
  dropdown_options?: string[];
  is_script: boolean;
}

export interface ExportCell {
  cue_index: number;
  column_index: number;
  content_type: string;
  richtext?: unknown;
  dropdown_value?: string;
  file_ref?: string;
}

export interface ExportGroup {
  ref: string;
  label: string;
  sort_order: number;
  collapsed: boolean;
  color?: string;
}

export interface ExportVariable {
  key: string;
  value: string;
  description?: string;
}

export interface RundownExportData {
  version: 1;
  exported_at: string;
  app: 'nextime';
  rundown: {
    name: string;
    show_date?: string;
    show_time?: string;
    status: string;
    venue?: string;
    notes?: string;
  };
  cues: ExportCue[];
  columns: ExportColumn[];
  cells: ExportCell[];
  groups: ExportGroup[];
  variables: ExportVariable[];
}

// ── Repozytoria wymagane do export/import ────────────────

export interface ExportImportRepos {
  rundownRepo: ReturnType<typeof createRundownRepo>;
  cueRepo: ReturnType<typeof createCueRepo>;
  columnRepo: ReturnType<typeof createColumnRepo>;
  cellRepo: ReturnType<typeof createCellRepo>;
  textVariableRepo: ReturnType<typeof createTextVariableRepo>;
  cueGroupRepo: ReturnType<typeof createCueGroupRepo>;
}

// ── Export ────────────────────────────────────────────────

/**
 * Eksportuje rundown do formatu JSON.
 * NIE eksportuje: acts, timeline cues, camera presets.
 */
export function exportRundownToJson(
  rundownId: string,
  repos: ExportImportRepos,
): RundownExportData {
  const { rundownRepo, cueRepo, columnRepo, cellRepo, textVariableRepo, cueGroupRepo } = repos;

  // Rundown
  const rundown = rundownRepo.findById(rundownId);
  if (!rundown) {
    throw new Error(`Rundown o ID "${rundownId}" nie istnieje`);
  }

  // Grupy — mapowanie id → ref (indeks)
  const groups = cueGroupRepo.findByRundown(rundownId);
  const groupIdToRef = new Map<string, string>();
  const exportGroups: ExportGroup[] = groups.map((g, i) => {
    const ref = `group_${i}`;
    groupIdToRef.set(g.id, ref);
    return {
      ref,
      label: g.label,
      sort_order: g.sort_order,
      collapsed: g.collapsed,
      color: g.color,
    };
  });

  // Cue'y — posortowane po sort_order
  const cues = cueRepo.findByRundown(rundownId);
  const sortedCues = [...cues].sort((a, b) => a.sort_order - b.sort_order);
  const cueIdToIndex = new Map<string, number>();

  const exportCues: ExportCue[] = sortedCues.map((c, i) => {
    cueIdToIndex.set(c.id, i);
    return {
      title: c.title,
      subtitle: c.subtitle,
      duration_ms: c.duration_ms,
      start_type: c.start_type,
      hard_start_datetime: c.start_type === 'hard' ? c.hard_start_datetime : undefined,
      auto_start: c.auto_start,
      locked: c.locked,
      background_color: c.background_color,
      status: c.status,
      group_ref: c.group_id ? groupIdToRef.get(c.group_id) : undefined,
      sort_order: c.sort_order,
    };
  });

  // Kolumny
  const columns = columnRepo.findByRundown(rundownId);
  const sortedColumns = [...columns].sort((a, b) => a.sort_order - b.sort_order);
  const columnIdToIndex = new Map<string, number>();

  const exportColumns: ExportColumn[] = sortedColumns.map((col, i) => {
    columnIdToIndex.set(col.id, i);
    return {
      name: col.name,
      type: col.type,
      sort_order: col.sort_order,
      width_px: col.width_px,
      dropdown_options: col.dropdown_options,
      is_script: col.is_script,
    };
  });

  // Cells — iteruj po cue'ach i kolumnach
  const exportCells: ExportCell[] = [];
  for (const cue of sortedCues) {
    const cells = cellRepo.findByCue(cue.id);
    const cueIndex = cueIdToIndex.get(cue.id);
    if (cueIndex === undefined) continue;

    for (const cell of cells) {
      const colIndex = columnIdToIndex.get(cell.column_id);
      if (colIndex === undefined) continue;

      exportCells.push({
        cue_index: cueIndex,
        column_index: colIndex,
        content_type: cell.content_type,
        richtext: cell.richtext,
        dropdown_value: cell.dropdown_value,
        file_ref: cell.file_ref,
      });
    }
  }

  // Variables
  const variables = textVariableRepo.findByRundown(rundownId);
  const exportVariables: ExportVariable[] = variables.map(v => ({
    key: v.key,
    value: v.value,
    description: v.description,
  }));

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    app: 'nextime',
    rundown: {
      name: rundown.name,
      show_date: rundown.show_date,
      show_time: rundown.show_time,
      status: rundown.status,
      venue: rundown.venue,
      notes: rundown.notes,
    },
    cues: exportCues,
    columns: exportColumns,
    cells: exportCells,
    groups: exportGroups,
    variables: exportVariables,
  };
}

// ── Import ───────────────────────────────────────────────

/**
 * Waliduje i importuje rundown z formatu JSON.
 * Tworzy nowe UUID dla wszystkich encji.
 * @returns ID nowo utworzonego rundownu
 */
export function importRundownFromJson(
  data: unknown,
  projectId: string,
  repos: ExportImportRepos,
): string {
  // Walidacja podstawowa
  if (!data || typeof data !== 'object') {
    throw new Error('Nieprawidłowy format pliku — oczekiwano obiektu JSON');
  }

  const obj = data as Record<string, unknown>;

  if (obj.version !== 1) {
    throw new Error(`Nieobsługiwana wersja formatu: ${String(obj.version)}. Wymagana: 1`);
  }

  if (obj.app !== 'nextime') {
    throw new Error(`Nieprawidłowa aplikacja: ${String(obj.app)}. Oczekiwano: nextime`);
  }

  if (!obj.rundown || typeof obj.rundown !== 'object') {
    throw new Error('Brak sekcji "rundown" w pliku');
  }

  const rundownData = obj.rundown as Record<string, unknown>;
  if (!rundownData.name || typeof rundownData.name !== 'string') {
    throw new Error('Brak nazwy rundownu w pliku');
  }

  const cuesData = Array.isArray(obj.cues) ? obj.cues : [];
  const columnsData = Array.isArray(obj.columns) ? obj.columns : [];
  const cellsData = Array.isArray(obj.cells) ? obj.cells : [];
  const groupsData = Array.isArray(obj.groups) ? obj.groups : [];
  const variablesData = Array.isArray(obj.variables) ? obj.variables : [];

  const { rundownRepo, cueRepo, columnRepo, cellRepo, textVariableRepo, cueGroupRepo } = repos;

  // 1. Rundown
  const rundown = rundownRepo.create({
    project_id: projectId,
    name: rundownData.name as string,
    show_date: typeof rundownData.show_date === 'string' ? rundownData.show_date : undefined,
    show_time: typeof rundownData.show_time === 'string' ? rundownData.show_time : undefined,
    status: typeof rundownData.status === 'string' && ['draft', 'approved', 'live', 'done'].includes(rundownData.status)
      ? rundownData.status as 'draft' | 'approved' | 'live' | 'done'
      : 'draft',
    venue: typeof rundownData.venue === 'string' ? rundownData.venue : undefined,
    notes: typeof rundownData.notes === 'string' ? rundownData.notes : undefined,
  });

  // 2. Groups — mapowanie ref → nowe ID
  const refToGroupId = new Map<string, string>();
  for (const g of groupsData) {
    const gObj = g as Record<string, unknown>;
    const group = cueGroupRepo.create({
      rundown_id: rundown.id,
      label: typeof gObj.label === 'string' ? gObj.label : 'Grupa',
      sort_order: typeof gObj.sort_order === 'number' ? gObj.sort_order : 0,
      collapsed: gObj.collapsed === true,
      color: typeof gObj.color === 'string' ? gObj.color : undefined,
    });
    if (typeof gObj.ref === 'string') {
      refToGroupId.set(gObj.ref, group.id);
    }
  }

  // 3. Cues — nowe UUID, mapowanie index → nowe ID
  const cueIndexToId = new Map<number, string>();
  for (let i = 0; i < cuesData.length; i++) {
    const c = cuesData[i] as Record<string, unknown>;
    const groupRef = typeof c.group_ref === 'string' ? c.group_ref : undefined;
    const groupId = groupRef ? refToGroupId.get(groupRef) : undefined;

    const startType = c.start_type === 'hard' ? 'hard' : 'soft';

    const cue = cueRepo.create({
      rundown_id: rundown.id,
      title: typeof c.title === 'string' ? c.title : '',
      subtitle: typeof c.subtitle === 'string' ? c.subtitle : '',
      duration_ms: typeof c.duration_ms === 'number' ? c.duration_ms : 60_000,
      start_type: startType,
      hard_start_datetime: startType === 'hard' && typeof c.hard_start_datetime === 'string' ? c.hard_start_datetime : undefined,
      auto_start: c.auto_start === true,
      locked: c.locked === true,
      background_color: typeof c.background_color === 'string' ? c.background_color : undefined,
      status: typeof c.status === 'string' && ['ready', 'standby', 'done', 'skipped'].includes(c.status)
        ? c.status as 'ready' | 'standby' | 'done' | 'skipped'
        : 'ready',
      group_id: groupId,
      sort_order: typeof c.sort_order === 'number' ? c.sort_order : i,
    });
    cueIndexToId.set(i, cue.id);
  }

  // 4. Columns — nowe UUID, mapowanie index → nowe ID
  const colIndexToId = new Map<number, string>();
  for (let i = 0; i < columnsData.length; i++) {
    const col = columnsData[i] as Record<string, unknown>;
    const column = columnRepo.create({
      rundown_id: rundown.id,
      name: typeof col.name === 'string' ? col.name : `Kolumna ${i + 1}`,
      type: typeof col.type === 'string' && ['richtext', 'dropdown', 'script'].includes(col.type)
        ? col.type as 'richtext' | 'dropdown' | 'script'
        : 'richtext',
      sort_order: typeof col.sort_order === 'number' ? col.sort_order : i,
      width_px: typeof col.width_px === 'number' ? col.width_px : 150,
      dropdown_options: Array.isArray(col.dropdown_options) ? col.dropdown_options as string[] : undefined,
      is_script: col.is_script === true,
    });
    colIndexToId.set(i, column.id);
  }

  // 5. Cells
  for (const cell of cellsData) {
    const cellObj = cell as Record<string, unknown>;
    const cueIndex = typeof cellObj.cue_index === 'number' ? cellObj.cue_index : -1;
    const colIndex = typeof cellObj.column_index === 'number' ? cellObj.column_index : -1;
    const cueId = cueIndexToId.get(cueIndex);
    const colId = colIndexToId.get(colIndex);

    if (!cueId || !colId) continue; // Pomiń nieprawidłowe referencje

    cellRepo.upsert({
      cue_id: cueId,
      column_id: colId,
      content_type: typeof cellObj.content_type === 'string' && ['richtext', 'dropdown_value', 'file_ref'].includes(cellObj.content_type)
        ? cellObj.content_type as 'richtext' | 'dropdown_value' | 'file_ref'
        : 'richtext',
      richtext: cellObj.richtext,
      dropdown_value: typeof cellObj.dropdown_value === 'string' ? cellObj.dropdown_value : undefined,
      file_ref: typeof cellObj.file_ref === 'string' ? cellObj.file_ref : undefined,
    });
  }

  // 6. Variables
  for (const v of variablesData) {
    const vObj = v as Record<string, unknown>;
    const key = typeof vObj.key === 'string' ? vObj.key : '';
    if (!key) continue;

    textVariableRepo.create({
      rundown_id: rundown.id,
      key,
      value: typeof vObj.value === 'string' ? vObj.value : '',
      description: typeof vObj.description === 'string' ? vObj.description : undefined,
    });
  }

  return rundown.id;
}
