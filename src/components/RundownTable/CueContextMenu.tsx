import { useEffect, useRef, useCallback, useState } from 'react';
import type { CueSummary } from '@/store/playback.store';

// Predefiniowane kolory tła (zgodne z CueEditPanel)
const PRESET_COLORS = [
  { value: '', label: 'Brak' },
  { value: '#EF4444', label: 'Czerwony' },
  { value: '#F97316', label: 'Pomarańczowy' },
  { value: '#EAB308', label: 'Żółty' },
  { value: '#22C55E', label: 'Zielony' },
  { value: '#3B82F6', label: 'Niebieski' },
  { value: '#8B5CF6', label: 'Fioletowy' },
  { value: '#EC4899', label: 'Różowy' },
  { value: '#6B7280', label: 'Szary' },
];

interface CueContextMenuProps {
  cue: CueSummary;
  x: number;
  y: number;
  onClose: () => void;
  onEdit: (cueId: string) => void;
  onDuplicate: (cue: CueSummary) => void;
  onInsertAbove: (cue: CueSummary) => void;
  onInsertBelow: (cue: CueSummary) => void;
  onToggleLocked: (cue: CueSummary) => void;
  onChangeColor: (cue: CueSummary, color: string) => void;
  onDelete: (cue: CueSummary) => void;
}

/**
 * Menu kontekstowe cue — prawy klik na wierszu (Faza 14)
 */
export function CueContextMenu({
  cue, x, y, onClose,
  onEdit, onDuplicate, onInsertAbove, onInsertBelow,
  onToggleLocked, onChangeColor, onDelete,
}: CueContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showColorSubmenu, setShowColorSubmenu] = useState(false);

  // Pozycjonowanie — nie wychodź poza viewport
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    let left = x;
    let top = y;

    if (x + rect.width > window.innerWidth) {
      left = window.innerWidth - rect.width - 8;
    }
    if (y + rect.height > window.innerHeight) {
      top = window.innerHeight - rect.height - 8;
    }

    setPos({ left: Math.max(4, left), top: Math.max(4, top) });
  }, [x, y]);

  // Zamknięcie: klik poza menu, Escape, scroll
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();

    // Defer — żeby nie zamknąć natychmiast od prawego kliku
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('scroll', handleScroll, true);
    });

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  const menuItem = useCallback(
    (label: string, onClick: () => void, className?: string) => (
      <button
        onClick={() => { onClick(); onClose(); }}
        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-600 transition-colors ${className ?? 'text-slate-200'}`}
      >
        {label}
      </button>
    ),
    [onClose],
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-slate-700 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[200px]"
      style={{ left: pos.left, top: pos.top }}
    >
      {menuItem('Edytuj cue', () => onEdit(cue.id))}
      {menuItem('Duplikuj cue', () => onDuplicate(cue))}

      <div className="border-t border-slate-600 my-1" />

      {menuItem('Wstaw cue powyżej', () => onInsertAbove(cue))}
      {menuItem('Wstaw cue poniżej', () => onInsertBelow(cue))}

      <div className="border-t border-slate-600 my-1" />

      {menuItem(
        cue.locked ? 'Odblokuj cue' : 'Zablokuj cue',
        () => onToggleLocked(cue),
      )}

      {/* Submenu kolorów */}
      <div className="relative">
        <button
          onClick={() => setShowColorSubmenu(prev => !prev)}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600 transition-colors flex items-center justify-between"
        >
          <span>Zmień kolor tła</span>
          <span className="text-slate-400">&#9654;</span>
        </button>
        {showColorSubmenu && (
          <div className="absolute left-full top-0 ml-1 bg-slate-700 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[140px]">
            {PRESET_COLORS.map(({ value, label }) => (
              <button
                key={value || 'none'}
                onClick={() => { onChangeColor(cue, value); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600 transition-colors flex items-center gap-2"
              >
                <span
                  className="w-3 h-3 rounded-sm border border-slate-500"
                  style={{ backgroundColor: value || 'transparent' }}
                />
                <span>{label}</span>
                {(cue.background_color ?? '') === value && (
                  <span className="ml-auto text-blue-400">&#10003;</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-600 my-1" />

      {menuItem('Usuń cue', () => onDelete(cue), 'text-red-400')}
    </div>
  );
}
