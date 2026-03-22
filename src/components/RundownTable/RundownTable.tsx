import { useEffect, useRef, useCallback, forwardRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePlaybackStore } from '@/store/playback.store';
import { formatTime } from '@/hooks/usePlayback';
import { substituteVariables, buildVariableMap, extractPlainTextFromRichtext } from '@/utils/textVariables';
import { ColumnManager } from './ColumnManager';
import { CellRenderer } from './CellRenderer';
import { CueContextMenu } from './CueContextMenu';
import type { CueSummary, CueGroupInfo, ColumnInfo, CueStatus } from '@/store/playback.store';

interface RundownTableProps {
  cues: CueSummary[];
  sendCommand: (event: string, payload?: Record<string, unknown>) => void;
  activeRundownId: string | null;
  onEditCue?: (cueId: string) => void;
}

// Stan context menu (Faza 14)
interface ContextMenuState {
  cue: CueSummary;
  x: number;
  y: number;
}

export function RundownTable({ cues, sendCommand, activeRundownId, onEditCue }: RundownTableProps) {
  const currentCue = usePlaybackStore(s => s.currentCue);
  const nextCue = usePlaybackStore(s => s.nextCue);
  const selectedCueId = usePlaybackStore(s => s.selectedCueId);
  const setSelectedCueId = usePlaybackStore(s => s.setSelectedCueId);
  const addCueToStore = usePlaybackStore(s => s.addCue);
  const reorderCuesInStore = usePlaybackStore(s => s.reorderCues);
  const cueGroups = usePlaybackStore(s => s.cueGroups);
  const toggleCueGroupCollapsed = usePlaybackStore(s => s.toggleCueGroupCollapsed);
  const textVariables = usePlaybackStore(s => s.textVariables);
  const columns = usePlaybackStore(s => s.columns);
  const hiddenColumnIds = usePlaybackStore(s => s.hiddenColumnIds);
  const setColumns = usePlaybackStore(s => s.setColumns);
  const privateNotes = usePlaybackStore(s => s.privateNotes);
  const activeRowRef = useRef<HTMLTableRowElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Mapa zmiennych do substitution
  const variableMap = buildVariableMap(textVariables);

  // Mapa grup do szybkiego lookup
  const groupMap = new Map<string, CueGroupInfo>(cueGroups.map(g => [g.id, g]));

  // Zbiór zwinietych grup
  const collapsedGroupIds = new Set(cueGroups.filter(g => g.collapsed).map(g => g.id));

  // Filtruj kolumny — ukryte kolumny nie renderują się (Faza 13)
  const visibleColumns = columns.filter(c => !hiddenColumnIds.has(c.id));

  // Podwójne kliknięcie — otwiera panel edycji (Faza 13)
  const handleCueDoubleClick = useCallback((cueId: string) => {
    setSelectedCueId(cueId);
    onEditCue?.(cueId);
  }, [setSelectedCueId, onEditCue]);

  // Prawy klik → menu kontekstowe (Faza 14)
  const handleCueContextMenu = useCallback((cue: CueSummary, x: number, y: number) => {
    setContextMenu({ cue, x, y });
  }, []);

  // Context menu: duplikuj cue
  const handleDuplicateCue = useCallback(async (cue: CueSummary) => {
    if (!activeRundownId) return;
    try {
      const newCue = await window.nextime.createCue({
        rundown_id: activeRundownId,
        title: cue.title ? `${cue.title} (kopia)` : '',
        subtitle: cue.subtitle,
        duration_ms: cue.duration_ms,
        start_type: cue.start_type as 'soft' | 'hard',
        auto_start: cue.auto_start,
        sort_order: cue.sort_order + 1,
      });
      if (newCue) {
        addCueToStore({
          id: newCue.id,
          title: newCue.title,
          subtitle: newCue.subtitle,
          duration_ms: newCue.duration_ms,
          start_type: newCue.start_type,
          hard_start_datetime: newCue.start_type === 'hard' ? newCue.hard_start_datetime : undefined,
          auto_start: newCue.auto_start,
          locked: newCue.locked,
          background_color: newCue.background_color,
          status: newCue.status,
          group_id: newCue.group_id,
          sort_order: newCue.sort_order,
        });
        setSelectedCueId(newCue.id);
      }
    } catch (err) {
      console.error('[RundownTable] Błąd duplikacji cue:', err);
    }
  }, [activeRundownId, addCueToStore, setSelectedCueId]);

  // Context menu: wstaw cue powyżej/poniżej
  const handleInsertCue = useCallback(async (refCue: CueSummary, position: 'above' | 'below') => {
    if (!activeRundownId) return;
    const sortOrder = position === 'above' ? refCue.sort_order : refCue.sort_order + 1;
    try {
      const newCue = await window.nextime.createCue({
        rundown_id: activeRundownId,
        title: '',
        subtitle: '',
        duration_ms: 60_000,
        start_type: 'soft' as const,
        auto_start: false,
        sort_order: sortOrder,
      });
      if (newCue) {
        addCueToStore({
          id: newCue.id,
          title: newCue.title,
          subtitle: newCue.subtitle,
          duration_ms: newCue.duration_ms,
          start_type: newCue.start_type,
          hard_start_datetime: newCue.start_type === 'hard' ? newCue.hard_start_datetime : undefined,
          auto_start: newCue.auto_start,
          locked: newCue.locked,
          background_color: newCue.background_color,
          status: newCue.status,
          group_id: newCue.group_id,
          sort_order: newCue.sort_order,
        });
        setSelectedCueId(newCue.id);
      }
    } catch (err) {
      console.error('[RundownTable] Błąd wstawiania cue:', err);
    }
  }, [activeRundownId, addCueToStore, setSelectedCueId]);

  // Context menu: toggle locked
  const handleToggleLocked = useCallback(async (cue: CueSummary) => {
    try {
      const updated = await window.nextime.updateCue(cue.id, { locked: !cue.locked });
      if (updated) {
        usePlaybackStore.getState().updateCue(cue.id, { locked: !cue.locked });
      }
    } catch (err) {
      console.error('[RundownTable] Błąd toggle locked:', err);
    }
  }, []);

  // Context menu: zmień kolor tła
  const handleChangeColor = useCallback(async (cue: CueSummary, color: string) => {
    try {
      const updated = await window.nextime.updateCue(cue.id, { background_color: color || undefined });
      if (updated) {
        usePlaybackStore.getState().updateCue(cue.id, { background_color: color || undefined });
      }
    } catch (err) {
      console.error('[RundownTable] Błąd zmiany koloru:', err);
    }
  }, []);

  // Context menu: usuń cue
  const handleDeleteCue = useCallback(async (cue: CueSummary) => {
    const confirmed = window.confirm(`Czy na pewno chcesz usunąć cue "${cue.title || '(bez tytułu)'}"?`);
    if (!confirmed) return;
    try {
      const deleted = await window.nextime.deleteCue(cue.id);
      if (deleted) {
        usePlaybackStore.getState().removeCue(cue.id);
      }
    } catch (err) {
      console.error('[RundownTable] Błąd usuwania cue:', err);
    }
  }, []);

  // Liczba kolumn stałych (drag, #, title, subtitle, duration, type, status, indicators) + dynamiczne
  const totalColSpan = 8 + columns.length;

  // DnD sensors — wiersze cue
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // DnD sensors — kolumny (Faza 14)
  const columnSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  // DnD handler kolumn — zmiana kolejności (Faza 14)
  const handleColumnDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeRundownId) return;

    const oldIndex = visibleColumns.findIndex(c => c.id === active.id);
    const newIndex = visibleColumns.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Przelicz kolejność na pełnej liście kolumn (nie tylko widoczne)
    const reorderedVisible = arrayMove(visibleColumns, oldIndex, newIndex);
    // Połącz z ukrytymi kolumnami — zachowaj ich oryginalną pozycję
    const hiddenCols = columns.filter(c => hiddenColumnIds.has(c.id));
    const allReordered = [...reorderedVisible, ...hiddenCols].map((c, i) => ({ ...c, sort_order: i }));
    setColumns(allReordered);

    try {
      await window.nextime.reorderColumns(activeRundownId, allReordered.map(c => c.id));
    } catch (err) {
      console.error('[RundownTable] Błąd reorderu kolumn:', err);
    }
  }, [visibleColumns, columns, hiddenColumnIds, activeRundownId, setColumns]);

  // Auto-scroll do aktywnego cue
  useEffect(() => {
    if (activeRowRef.current && !isDragging) {
      activeRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentCue?.id, isDragging]);

  const handleCueClick = useCallback((cueId: string) => {
    if (isDragging) return;
    sendCommand('cmd:goto', { cue_id: cueId });
    setSelectedCueId(cueId);
  }, [sendCommand, setSelectedCueId, isDragging]);

  // Dodaj nowy cue
  const handleAddCue = useCallback(async () => {
    if (!activeRundownId) return;

    let sortOrder = cues.length;
    if (selectedCueId) {
      const selectedIndex = cues.findIndex(c => c.id === selectedCueId);
      if (selectedIndex >= 0) {
        sortOrder = selectedIndex + 1;
      }
    }

    try {
      const newCue = await window.nextime.createCue({
        rundown_id: activeRundownId,
        title: '',
        subtitle: '',
        duration_ms: 60_000,
        start_type: 'soft' as const,
        auto_start: false,
        sort_order: sortOrder,
      });

      if (newCue) {
        addCueToStore({
          id: newCue.id,
          title: newCue.title,
          subtitle: newCue.subtitle,
          duration_ms: newCue.duration_ms,
          start_type: newCue.start_type,
          hard_start_datetime: newCue.start_type === 'hard' ? newCue.hard_start_datetime : undefined,
          auto_start: newCue.auto_start,
          locked: newCue.locked,
          background_color: newCue.background_color,
          status: newCue.status,
          group_id: newCue.group_id,
          sort_order: newCue.sort_order,
        });
        setSelectedCueId(newCue.id);
      }
    } catch (err) {
      console.error('[RundownTable] Błąd dodawania cue:', err);
    }
  }, [activeRundownId, cues, selectedCueId, addCueToStore, setSelectedCueId]);

  // DnD handler
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id || !activeRundownId) return;

    const oldIndex = cues.findIndex(c => c.id === active.id);
    const newIndex = cues.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Nowa kolejność
    const newCues = [...cues];
    const [moved] = newCues.splice(oldIndex, 1);
    newCues.splice(newIndex, 0, moved!);
    const newCueIds = newCues.map(c => c.id);

    // Aktualizuj store lokalnie
    reorderCuesInStore(newCueIds);

    // Zapisz do bazy przez IPC
    try {
      await window.nextime.reorderCues(activeRundownId, newCueIds);
    } catch (err) {
      console.error('[RundownTable] Błąd reorderu:', err);
    }
  }, [cues, activeRundownId, reorderCuesInStore]);

  if (cues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-3">
        <span>Brak cue'ów w rundownie</span>
        <button
          onClick={handleAddCue}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
        >
          + Dodaj pierwszy cue
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setIsDragging(false)}
      >
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
              <th className="py-2 px-1 w-8"></th>
              <th className="py-2 px-3 text-left w-12">#</th>
              <th className="py-2 px-3 text-left">Tytuł</th>
              <th className="py-2 px-3 text-left w-48">Podtytuł</th>
              <th className="py-2 px-3 text-right w-24">Czas</th>
              <th className="py-2 px-3 text-center w-20">Typ</th>
              <th className="py-2 px-3 text-center w-24">Status</th>
              {/* Dynamiczne kolumny z DnD (Faza 14) */}
              <DndContext
                sensors={columnSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleColumnDragEnd}
                accessibility={{ container: document.body }}
              >
                <SortableContext items={visibleColumns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                  {visibleColumns.map(col => (
                    <SortableColumnHeader key={col.id} column={col} />
                  ))}
                </SortableContext>
              </DndContext>
              <th className="py-2 px-3 text-center w-16">
                <button
                  onClick={() => setShowColumnManager(true)}
                  className="text-slate-500 hover:text-slate-300 text-[10px]"
                  title="Zarządzaj kolumnami"
                >
                  +Kol
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <SortableContext items={cues.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {(() => {
                // Renderuj cue'y z nagłówkami grup
                let lastGroupId: string | undefined | null = '__init__';
                let visibleIndex = 0;

                return cues.map((cue) => {
                  const elements: React.ReactNode[] = [];

                  // Nagłówek grupy — renderuj gdy zmienia się group_id
                  if (cue.group_id !== lastGroupId) {
                    lastGroupId = cue.group_id;
                    if (cue.group_id) {
                      const group = groupMap.get(cue.group_id);
                      if (group) {
                        elements.push(
                          <tr
                            key={`group-${group.id}`}
                            className="bg-slate-800/80 border-b border-slate-700 cursor-pointer hover:bg-slate-700/50"
                            onClick={() => toggleCueGroupCollapsed(group.id)}
                          >
                            <td colSpan={totalColSpan} className="py-1.5 px-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">
                                  {group.collapsed ? '\u25B6' : '\u25BC'}
                                </span>
                                {group.color && (
                                  <span
                                    className="w-2.5 h-2.5 rounded-sm"
                                    style={{ backgroundColor: group.color }}
                                  />
                                )}
                                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                                  {group.label}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  ({cues.filter(c => c.group_id === group.id).length} cue)
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                    }
                  }

                  // Ukryj cue'y z zwinietej grupy
                  if (cue.group_id && collapsedGroupIds.has(cue.group_id)) {
                    return elements.length > 0 ? elements : null;
                  }

                  const isCurrent = currentCue?.id === cue.id;
                  const isNext = nextCue?.id === cue.id;
                  const isSelected = selectedCueId === cue.id;
                  const currentIndex = visibleIndex;
                  visibleIndex++;

                  elements.push(
                    <SortableCueRow
                      key={cue.id}
                      cue={cue}
                      index={currentIndex}
                      isCurrent={isCurrent}
                      isNext={isNext}
                      isSelected={isSelected}
                      hasNote={!!privateNotes[cue.id]}
                      onClick={handleCueClick}
                      onDoubleClick={handleCueDoubleClick}
                      onContextMenu={handleCueContextMenu}
                      ref={isCurrent ? activeRowRef : undefined}
                      variableMap={variableMap}
                      columns={visibleColumns}
                    />
                  );

                  return elements;
                });
              })()}
            </SortableContext>
          </tbody>
        </table>
      </DndContext>

      {/* Przycisk dodawania cue na końcu tabeli */}
      <div className="flex justify-center py-3">
        <button
          onClick={handleAddCue}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
          title="Dodaj cue"
        >
          <span className="text-lg leading-none">+</span>
          <span>Dodaj cue</span>
        </button>
      </div>

      {/* Dialog zarządzania kolumnami */}
      {showColumnManager && activeRundownId && (
        <ColumnManager
          rundownId={activeRundownId}
          onClose={() => setShowColumnManager(false)}
        />
      )}

      {/* Menu kontekstowe cue (Faza 14) */}
      {contextMenu && (
        <CueContextMenu
          cue={contextMenu.cue}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onEdit={(cueId) => { setSelectedCueId(cueId); onEditCue?.(cueId); }}
          onDuplicate={handleDuplicateCue}
          onInsertAbove={(cue) => handleInsertCue(cue, 'above')}
          onInsertBelow={(cue) => handleInsertCue(cue, 'below')}
          onToggleLocked={handleToggleLocked}
          onChangeColor={handleChangeColor}
          onDelete={handleDeleteCue}
        />
      )}
    </div>
  );
}

// ── CueStatusCell — status cue z dropdown (Faza 14) ──────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ready:   { label: 'Gotowy',     bg: 'bg-slate-700',      text: 'text-slate-400' },
  standby: { label: 'Czekaj',     bg: 'bg-amber-900/50',   text: 'text-amber-300' },
  done:    { label: 'Zrobione',   bg: 'bg-emerald-900/50', text: 'text-emerald-300' },
  skipped: { label: 'Pominięty',  bg: 'bg-slate-800',      text: 'text-slate-500 line-through' },
};

interface CueStatusCellProps {
  cueId: string;
  status: string;
}

function CueStatusCell({ cueId, status }: CueStatusCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.ready!;

  const handleChange = useCallback(async (newStatus: CueSummary['status']) => {
    setIsOpen(false);
    if (newStatus === status) return;
    try {
      const updated = await window.nextime.updateCue(cueId, { status: newStatus });
      if (updated) {
        usePlaybackStore.getState().updateCue(cueId, { status: newStatus as CueSummary['status'] });
      }
    } catch (err) {
      console.error('[CueStatusCell] Błąd zmiany statusu:', err);
    }
  }, [cueId, status]);

  return (
    <td className="py-2 px-3 text-center relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${config.bg} ${config.text} cursor-pointer hover:opacity-80`}
      >
        {config.label}
      </button>
      {isOpen && (
        <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-slate-700 border border-slate-600 rounded shadow-lg py-1 min-w-[100px]">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => handleChange(key as CueSummary['status'])}
              className={`w-full text-left px-3 py-1 text-xs hover:bg-slate-600 ${cfg.text} ${status === key ? 'font-bold' : ''}`}
            >
              {cfg.label}
            </button>
          ))}
        </div>
      )}
    </td>
  );
}

// ── SortableColumnHeader — nagłówek kolumny z DnD + resize (Faza 14) ──

interface SortableColumnHeaderProps {
  column: ColumnInfo;
}

function SortableColumnHeader({ column }: SortableColumnHeaderProps) {
  const updateColumnInStore = usePlaybackStore(s => s.updateColumnInStore);
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style: React.CSSProperties = {
    width: column.width_px,
    minWidth: 80,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    cursor: isResizing ? 'col-resize' : 'grab',
  };

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startX.current = e.clientX;
    startWidth.current = column.width_px;

    const handleMouseMove = (ev: MouseEvent) => {
      const diff = ev.clientX - startX.current;
      const newWidth = Math.max(80, startWidth.current + diff);
      updateColumnInStore(column.id, { width_px: newWidth });
    };

    const handleMouseUp = async () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      try {
        await window.nextime.updateColumn(column.id, { width_px: column.width_px });
      } catch (err) {
        console.error('[ColumnHeader] Błąd zapisu szerokości:', err);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [column.id, column.width_px, updateColumnInStore]);

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="py-2 px-3 text-left relative select-none"
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-1">
        {column.is_script && <span className="text-[10px]" title="Prompter">&#127908;</span>}
        <span className="truncate">{column.name}</span>
      </div>
      {/* Resize handle — blokuje DnD na tej strefie */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/50"
        onMouseDown={handleResizeStart}
        onPointerDown={e => e.stopPropagation()}
      />
    </th>
  );
}

// ── SortableCueRow ──────────────────────────────────────────

interface CueRowProps {
  cue: CueSummary;
  index: number;
  isCurrent: boolean;
  isNext: boolean;
  isSelected: boolean;
  hasNote: boolean;
  onClick: (cueId: string) => void;
  onDoubleClick: (cueId: string) => void;
  onContextMenu: (cue: CueSummary, x: number, y: number) => void;
  variableMap?: Record<string, string>;
  columns: ColumnInfo[];
}

const SortableCueRow = forwardRef<HTMLTableRowElement, CueRowProps>(
  function SortableCueRow({ cue, index, isCurrent, isNext, isSelected, hasNote, onClick, onDoubleClick, onContextMenu, variableMap, columns }, ref) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging: isRowDragging,
    } = useSortable({ id: cue.id });

    // Faza 14: inline edit title/subtitle
    const [editingField, setEditingField] = useState<'title' | 'subtitle' | null>(null);
    const [editValue, setEditValue] = useState('');
    const inlineInputRef = useRef<HTMLInputElement>(null);

    // Auto-focus + select all na otwarciu inline edit
    useEffect(() => {
      if (editingField && inlineInputRef.current) {
        inlineInputRef.current.focus();
        inlineInputRef.current.select();
      }
    }, [editingField]);

    // Rozpocznij inline edycję
    const startInlineEdit = useCallback((field: 'title' | 'subtitle', currentValue: string) => {
      setEditingField(field);
      setEditValue(currentValue);
    }, []);

    // Zapisz inline edycję
    const saveInlineEdit = useCallback(async () => {
      if (!editingField) return;
      const trimmed = editValue.trim();
      // Walidacja: tytuł nie może być pusty
      if (editingField === 'title' && !trimmed) {
        setEditingField(null);
        return;
      }
      const oldValue = editingField === 'title' ? cue.title : cue.subtitle;
      if (trimmed === oldValue) {
        setEditingField(null);
        return;
      }
      try {
        const update = { [editingField]: trimmed };
        const updated = await window.nextime.updateCue(cue.id, update);
        if (updated) {
          usePlaybackStore.getState().updateCue(cue.id, update);
        }
      } catch (err) {
        console.error('[RundownTable] Błąd inline edit:', err);
      }
      setEditingField(null);
    }, [editingField, editValue, cue.id, cue.title, cue.subtitle]);

    // Anuluj inline edycję
    const cancelInlineEdit = useCallback(() => {
      setEditingField(null);
    }, []);

    // Klawiszologia inline input
    const handleInlineKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveInlineEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelInlineEdit();
      }
    }, [saveInlineEdit, cancelInlineEdit]);

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isRowDragging ? 0.5 : 1,
      zIndex: isRowDragging ? 50 : undefined,
    };

    // Kolory wierszy
    let rowBg = index % 2 === 0 ? 'bg-slate-900' : 'bg-slate-850';
    if (isSelected && !isCurrent && !isNext) rowBg = 'bg-blue-900/30';
    if (isNext) rowBg = 'bg-amber-900/30';
    if (isCurrent) rowBg = 'bg-emerald-900/40';

    // Kolor tła cue — zawsze widoczny, z różną przezroczystością
    const customBg = cue.background_color
      ? { backgroundColor: cue.background_color + (isCurrent || isNext ? '22' : '44') }
      : undefined;

    const selectedBorder = isSelected ? 'ring-1 ring-blue-500/50' : '';

    // Połączenie ref z sortable
    const mergedRef = useCallback(
      (node: HTMLTableRowElement | null) => {
        setNodeRef(node);
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLTableRowElement | null>).current = node;
      },
      [setNodeRef, ref],
    );

    // Wyświetlany tytuł (z substitution)
    const displayTitle = variableMap ? substituteVariables(cue.title, variableMap) || '(bez tytułu)' : cue.title || '(bez tytułu)';
    const displaySubtitle = variableMap ? substituteVariables(cue.subtitle, variableMap) : cue.subtitle;

    return (
      <tr
        ref={mergedRef}
        style={{ ...style, ...customBg }}
        className={`${rowBg} ${selectedBorder} hover:bg-slate-700/50 cursor-pointer transition-colors border-b border-slate-800`}
        onClick={() => onClick(cue.id)}
        onDoubleClick={() => onDoubleClick(cue.id)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(cue, e.clientX, e.clientY); }}
      >
        {/* Drag handle */}
        <td className="py-2 px-1 text-center">
          <button
            className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing px-1"
            {...attributes}
            {...listeners}
            onClick={e => e.stopPropagation()}
            title="Przeciągnij aby zmienić kolejność"
          >
            ⠿
          </button>
        </td>

        {/* # */}
        <td className="py-2 px-3 text-slate-500 text-sm font-mono">
          {index + 1}
        </td>

        {/* Title — inline edit (Faza 14) */}
        <td className="py-2 px-3">
          {editingField === 'title' ? (
            <input
              ref={inlineInputRef}
              type="text"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={handleInlineKeyDown}
              onBlur={saveInlineEdit}
              onClick={e => e.stopPropagation()}
              className="w-full bg-slate-900 border border-blue-500 rounded px-2 py-0.5 text-sm text-slate-200 focus:outline-none"
            />
          ) : (
            <div
              className="flex items-center gap-2"
              onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit('title', cue.title); }}
            >
              {isCurrent && (
                <span className="inline-block w-1.5 h-4 bg-emerald-400 rounded-sm" />
              )}
              <span className={`text-sm font-medium ${isCurrent ? 'text-emerald-300' : 'text-slate-200'}`}>
                {displayTitle}
              </span>
              {hasNote && (
                <span className="text-xs text-amber-400/70" title="Ma prywatną notatkę">📝</span>
              )}
              {cue.locked && (
                <span className="text-xs text-slate-500" title="Zablokowany">🔒</span>
              )}
            </div>
          )}
        </td>

        {/* Subtitle — inline edit (Faza 14) */}
        <td className="py-2 px-3 text-sm text-slate-400 max-w-[12rem]">
          {editingField === 'subtitle' ? (
            <input
              ref={inlineInputRef}
              type="text"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={handleInlineKeyDown}
              onBlur={saveInlineEdit}
              onClick={e => e.stopPropagation()}
              className="w-full bg-slate-900 border border-blue-500 rounded px-2 py-0.5 text-sm text-slate-200 focus:outline-none"
            />
          ) : (
            <span
              className="block truncate"
              title={displaySubtitle || undefined}
              onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit('subtitle', cue.subtitle); }}
            >
              {displaySubtitle}
            </span>
          )}
        </td>

        {/* Duration */}
        <td className="py-2 px-3 text-right text-sm font-mono text-slate-300 tabular-nums">
          {formatTime(cue.duration_ms)}
        </td>

        {/* Start Type */}
        <td className="py-2 px-3 text-center">
          {cue.start_type === 'hard' ? (
            <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-red-900/50 text-red-300">
              HARD
            </span>
          ) : (
            <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-slate-700 text-slate-400">
              soft
            </span>
          )}
          {cue.auto_start && (
            <span className="ml-1 text-xs text-amber-400" title="Automatyczny start">
              A
            </span>
          )}
        </td>

        {/* Status cue (Faza 14) */}
        <CueStatusCell cueId={cue.id} status={cue.status} />

        {/* Dynamiczne kolumny — komórki */}
        {columns.map(col => (
          <td key={col.id} className="py-1 px-2" style={{ width: col.width_px, minWidth: 80 }}>
            <CellRenderer cueId={cue.id} column={col} variableMap={variableMap} />
          </td>
        ))}

        {/* Status indicators */}
        <td className="py-2 px-3 text-center">
          {isCurrent && (
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Na żywo (LIVE)" />
          )}
          {isNext && (
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400" title="Następny (NEXT)" />
          )}
        </td>
      </tr>
    );
  },
);
