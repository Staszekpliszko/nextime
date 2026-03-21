/**
 * Undo/Redo System — Command Pattern
 *
 * Zarządza stosem operacji cofania/przywracania dla CRUD na cue'ach,
 * kolumnach, komórkach, grupach i zmiennych tekstowych.
 */

// ── Interfejs komendy ─────────────────────────────────────────

export interface UndoCommand {
  /** Wykonaj operację (lub powtórz przy redo) */
  execute(): void;
  /** Cofnij operację */
  undo(): void;
  /** Opis operacji (po polsku, do wyświetlenia w UI) */
  description: string;
}

// ── Typy repozytoriów (DI) ────────────────────────────────────

import type { Cue, CreateCueInput } from './db/repositories/cue.repo';
import type { Column, CreateColumnInput } from './db/repositories/column.repo';
import type { Cell } from './db/repositories/cell.repo';
import type { CueGroup, CreateCueGroupInput } from './db/repositories/cue-group.repo';
import type { TextVariable, CreateTextVariableInput } from './db/repositories/text-variable.repo';

/** Minimalne interfejsy repozytoriów potrzebne do undo/redo */
export interface UndoCueRepo {
  create(input: CreateCueInput): Cue;
  createWithId(id: string, input: CreateCueInput): Cue;
  update(id: string, input: Partial<Omit<CreateCueInput, 'rundown_id'>>): Cue | undefined;
  delete(id: string): boolean;
  findById(id: string): Cue | undefined;
  findByRundown(rundownId: string): Cue[];
  reorder(rundownId: string, cueIds: string[]): void;
}

export interface UndoColumnRepo {
  create(input: CreateColumnInput): Column;
  createWithId(id: string, input: CreateColumnInput): Column;
  update(id: string, input: Partial<Omit<CreateColumnInput, 'rundown_id'>>): Column | undefined;
  delete(id: string): boolean;
  findById(id: string): Column | undefined;
}

export interface UndoCellRepo {
  upsert(input: {
    cue_id: string;
    column_id: string;
    content_type?: 'richtext' | 'dropdown_value' | 'file_ref';
    richtext?: unknown;
    dropdown_value?: string;
    file_ref?: string;
  }): Cell;
  findByCue(cueId: string): Cell[];
  delete(id: string): boolean;
  findById(id: string): Cell | undefined;
}

export interface UndoCueGroupRepo {
  create(input: CreateCueGroupInput): CueGroup;
  createWithId(id: string, input: CreateCueGroupInput): CueGroup;
  update(id: string, input: Partial<Omit<CreateCueGroupInput, 'rundown_id'>>): CueGroup | undefined;
  delete(id: string): boolean;
  findById(id: string): CueGroup | undefined;
}

export interface UndoTextVariableRepo {
  create(input: CreateTextVariableInput): TextVariable;
  createWithId(id: string, input: CreateTextVariableInput): TextVariable;
  update(id: string, input: { value?: string; description?: string }): TextVariable | undefined;
  delete(id: string): boolean;
  findById(id: string): TextVariable | undefined;
}

export interface UndoRepos {
  cueRepo: UndoCueRepo;
  columnRepo: UndoColumnRepo;
  cellRepo: UndoCellRepo;
  cueGroupRepo: UndoCueGroupRepo;
  textVariableRepo: UndoTextVariableRepo;
}

// ── Klasa UndoManager ─────────────────────────────────────────

const MAX_UNDO_STACK = 50;

export class UndoManager {
  private undoStack: UndoCommand[] = [];
  private redoStack: UndoCommand[] = [];

  /** Dodaje komendę na stos undo (czyści redo) */
  pushCommand(cmd: UndoCommand): void {
    this.undoStack.push(cmd);
    // Obetnij do limitu — wyrzuć najstarsze
    if (this.undoStack.length > MAX_UNDO_STACK) {
      this.undoStack.splice(0, this.undoStack.length - MAX_UNDO_STACK);
    }
    // Nowa operacja = redo nieaktualne
    this.redoStack.length = 0;
  }

  /** Cofnij ostatnią operację */
  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    return true;
  }

  /** Przywróć cofniętą operację */
  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.execute();
    this.undoStack.push(cmd);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getUndoDescription(): string {
    const last = this.undoStack[this.undoStack.length - 1];
    return last ? last.description : '';
  }

  getRedoDescription(): string {
    const last = this.redoStack[this.redoStack.length - 1];
    return last ? last.description : '';
  }

  /** Czyści oba stosy (np. przy zmianie rundownu) */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  /** Rozmiar stosu undo (do testów) */
  get undoSize(): number {
    return this.undoStack.length;
  }

  /** Rozmiar stosu redo (do testów) */
  get redoSize(): number {
    return this.redoStack.length;
  }
}

// ── Fabryki komend — Cue ──────────────────────────────────────

/** Snapshot cue do pełnego odtworzenia */
interface CueSnapshot {
  cue: Cue;
  cells: Cell[];
}

/** Tworzy komendę dla operacji "utwórz cue" — undo = usuń */
/** Helper: tworzy input CreateCueInput z obiektu Cue */
function cueToInput(cue: Cue): CreateCueInput {
  return {
    rundown_id: cue.rundown_id,
    title: cue.title,
    subtitle: cue.subtitle,
    duration_ms: cue.duration_ms,
    start_type: cue.start_type,
    hard_start_datetime: cue.start_type === 'hard' ? cue.hard_start_datetime : undefined,
    auto_start: cue.auto_start,
    locked: cue.locked,
    background_color: cue.background_color,
    status: cue.status,
    group_id: cue.group_id,
    sort_order: cue.sort_order,
  };
}

export function createCueCommand(
  cue: Cue,
  repos: Pick<UndoRepos, 'cueRepo' | 'cellRepo'>,
): UndoCommand {
  return {
    description: `Utwórz cue "${cue.title}"`,
    execute() {
      repos.cueRepo.createWithId(cue.id, cueToInput(cue));
    },
    undo() {
      repos.cueRepo.delete(cue.id);
    },
  };
}

/** Tworzy komendę dla operacji "usuń cue" — undo = odtwórz cue + cells */
export function deleteCueCommand(
  snapshot: CueSnapshot,
  repos: Pick<UndoRepos, 'cueRepo' | 'cellRepo'>,
): UndoCommand {
  const { cue, cells } = snapshot;
  return {
    description: `Usuń cue "${cue.title}"`,
    execute() {
      repos.cueRepo.delete(cue.id);
    },
    undo() {
      // Odtwórz cue z oryginalnym ID
      repos.cueRepo.createWithId(cue.id, cueToInput(cue));
      // Odtwórz komórki
      for (const cell of cells) {
        repos.cellRepo.upsert({
          cue_id: cell.cue_id,
          column_id: cell.column_id,
          content_type: cell.content_type,
          richtext: cell.richtext,
          dropdown_value: cell.dropdown_value,
          file_ref: cell.file_ref,
        });
      }
    },
  };
}

/** Tworzy komendę dla operacji "aktualizuj cue" */
export function updateCueCommand(
  id: string,
  oldData: Partial<Omit<CreateCueInput, 'rundown_id'>>,
  newData: Partial<Omit<CreateCueInput, 'rundown_id'>>,
  repos: Pick<UndoRepos, 'cueRepo'>,
  title: string,
): UndoCommand {
  return {
    description: `Edytuj cue "${title}"`,
    execute() {
      repos.cueRepo.update(id, newData);
    },
    undo() {
      repos.cueRepo.update(id, oldData);
    },
  };
}

/** Tworzy komendę dla operacji "zmień kolejność cue'ów" */
export function reorderCuesCommand(
  rundownId: string,
  oldOrder: string[],
  newOrder: string[],
  repos: Pick<UndoRepos, 'cueRepo'>,
): UndoCommand {
  return {
    description: 'Zmień kolejność cue\'ów',
    execute() {
      repos.cueRepo.reorder(rundownId, newOrder);
    },
    undo() {
      repos.cueRepo.reorder(rundownId, oldOrder);
    },
  };
}

// ── Fabryki komend — Column ───────────────────────────────────

/** Tworzy komendę dla operacji "utwórz kolumnę" */
/** Helper: tworzy input CreateColumnInput z obiektu Column */
function columnToInput(col: Column): CreateColumnInput {
  return {
    rundown_id: col.rundown_id,
    name: col.name,
    type: col.type,
    sort_order: col.sort_order,
    width_px: col.width_px,
    dropdown_options: col.dropdown_options,
    is_script: col.is_script,
  };
}

export function createColumnCommand(
  column: Column,
  repos: Pick<UndoRepos, 'columnRepo'>,
): UndoCommand {
  return {
    description: `Utwórz kolumnę "${column.name}"`,
    execute() {
      repos.columnRepo.createWithId(column.id, columnToInput(column));
    },
    undo() {
      repos.columnRepo.delete(column.id);
    },
  };
}

/** Tworzy komendę dla operacji "usuń kolumnę" */
export function deleteColumnCommand(
  column: Column,
  repos: Pick<UndoRepos, 'columnRepo'>,
): UndoCommand {
  return {
    description: `Usuń kolumnę "${column.name}"`,
    execute() {
      repos.columnRepo.delete(column.id);
    },
    undo() {
      repos.columnRepo.createWithId(column.id, columnToInput(column));
    },
  };
}

/** Tworzy komendę dla operacji "aktualizuj kolumnę" */
export function updateColumnCommand(
  id: string,
  oldData: Partial<Omit<CreateColumnInput, 'rundown_id'>>,
  newData: Partial<Omit<CreateColumnInput, 'rundown_id'>>,
  repos: Pick<UndoRepos, 'columnRepo'>,
  name: string,
): UndoCommand {
  return {
    description: `Edytuj kolumnę "${name}"`,
    execute() {
      repos.columnRepo.update(id, newData);
    },
    undo() {
      repos.columnRepo.update(id, oldData);
    },
  };
}

// ── Fabryki komend — Cell ─────────────────────────────────────

/** Tworzy komendę dla operacji "aktualizuj komórkę" */
export function updateCellCommand(
  cueId: string,
  columnId: string,
  oldCell: { content_type?: 'richtext' | 'dropdown_value' | 'file_ref'; richtext?: unknown; dropdown_value?: string; file_ref?: string } | null,
  newCell: { content_type?: 'richtext' | 'dropdown_value' | 'file_ref'; richtext?: unknown; dropdown_value?: string; file_ref?: string },
  repos: Pick<UndoRepos, 'cellRepo'>,
): UndoCommand {
  return {
    description: 'Edytuj komórkę',
    execute() {
      repos.cellRepo.upsert({
        cue_id: cueId,
        column_id: columnId,
        ...newCell,
      });
    },
    undo() {
      if (oldCell) {
        repos.cellRepo.upsert({
          cue_id: cueId,
          column_id: columnId,
          ...oldCell,
        });
      } else {
        // Komórka nie istniała — znajdź i usuń
        const cells = repos.cellRepo.findByCue(cueId);
        const cell = cells.find(c => c.column_id === columnId);
        if (cell) {
          repos.cellRepo.delete(cell.id);
        }
      }
    },
  };
}

// ── Fabryki komend — CueGroup ─────────────────────────────────

/** Tworzy komendę dla operacji "utwórz grupę cue'ów" */
/** Helper: tworzy input CreateCueGroupInput z obiektu CueGroup */
function groupToInput(g: CueGroup): CreateCueGroupInput {
  return {
    rundown_id: g.rundown_id,
    label: g.label,
    sort_order: g.sort_order,
    collapsed: g.collapsed,
    color: g.color,
  };
}

export function createCueGroupCommand(
  group: CueGroup,
  repos: Pick<UndoRepos, 'cueGroupRepo'>,
): UndoCommand {
  return {
    description: `Utwórz grupę "${group.label}"`,
    execute() {
      repos.cueGroupRepo.createWithId(group.id, groupToInput(group));
    },
    undo() {
      repos.cueGroupRepo.delete(group.id);
    },
  };
}

/** Tworzy komendę dla operacji "usuń grupę cue'ów" */
export function deleteCueGroupCommand(
  group: CueGroup,
  repos: Pick<UndoRepos, 'cueGroupRepo'>,
): UndoCommand {
  return {
    description: `Usuń grupę "${group.label}"`,
    execute() {
      repos.cueGroupRepo.delete(group.id);
    },
    undo() {
      repos.cueGroupRepo.createWithId(group.id, groupToInput(group));
    },
  };
}

/** Tworzy komendę dla operacji "aktualizuj grupę cue'ów" */
export function updateCueGroupCommand(
  id: string,
  oldData: Partial<Omit<CreateCueGroupInput, 'rundown_id'>>,
  newData: Partial<Omit<CreateCueGroupInput, 'rundown_id'>>,
  repos: Pick<UndoRepos, 'cueGroupRepo'>,
  label: string,
): UndoCommand {
  return {
    description: `Edytuj grupę "${label}"`,
    execute() {
      repos.cueGroupRepo.update(id, newData);
    },
    undo() {
      repos.cueGroupRepo.update(id, oldData);
    },
  };
}

// ── Fabryki komend — TextVariable ─────────────────────────────

/** Tworzy komendę dla operacji "utwórz zmienną tekstową" */
/** Helper: tworzy input CreateTextVariableInput z obiektu TextVariable */
function varToInput(v: TextVariable): CreateTextVariableInput {
  return {
    rundown_id: v.rundown_id,
    key: v.key,
    value: v.value,
    description: v.description,
  };
}

export function createTextVariableCommand(
  variable: TextVariable,
  repos: Pick<UndoRepos, 'textVariableRepo'>,
): UndoCommand {
  return {
    description: `Utwórz zmienną "$${variable.key}"`,
    execute() {
      repos.textVariableRepo.createWithId(variable.id, varToInput(variable));
    },
    undo() {
      repos.textVariableRepo.delete(variable.id);
    },
  };
}

/** Tworzy komendę dla operacji "usuń zmienną tekstową" */
export function deleteTextVariableCommand(
  variable: TextVariable,
  repos: Pick<UndoRepos, 'textVariableRepo'>,
): UndoCommand {
  return {
    description: `Usuń zmienną "$${variable.key}"`,
    execute() {
      repos.textVariableRepo.delete(variable.id);
    },
    undo() {
      repos.textVariableRepo.createWithId(variable.id, varToInput(variable));
    },
  };
}

/** Tworzy komendę dla operacji "aktualizuj zmienną tekstową" */
export function updateTextVariableCommand(
  id: string,
  oldData: { value?: string; description?: string },
  newData: { value?: string; description?: string },
  repos: Pick<UndoRepos, 'textVariableRepo'>,
  key: string,
): UndoCommand {
  return {
    description: `Edytuj zmienną "$${key}"`,
    execute() {
      repos.textVariableRepo.update(id, newData);
    },
    undo() {
      repos.textVariableRepo.update(id, oldData);
    },
  };
}
