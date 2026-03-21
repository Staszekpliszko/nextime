import { useState, useEffect, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import type { CueSummary } from '@/store/playback.store';
import { PrivateNotePanel } from '@/components/PrivateNotePanel/PrivateNotePanel';

// ── Helper: parsuj MM:SS na ms ───────────────────────────────

function parseDurationInput(value: string): number | null {
  // Akceptuje formaty: "MM:SS", "M:SS", "HH:MM:SS"
  const parts = value.split(':').map(Number);
  if (parts.some(isNaN)) return null;

  if (parts.length === 2) {
    const [m, s] = parts as [number, number];
    if (m < 0 || s < 0 || s >= 60) return null;
    return (m * 60 + s) * 1000;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts as [number, number, number];
    if (h < 0 || m < 0 || m >= 60 || s < 0 || s >= 60) return null;
    return (h * 3600 + m * 60 + s) * 1000;
  }
  return null;
}

/** Formatuje ms → "MM:SS" do wyświetlenia w input */
function formatDurationForInput(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Predefiniowane kolory tła ────────────────────────────────

const PRESET_COLORS = [
  '', // brak koloru
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280',
];

// ── Props ────────────────────────────────────────────────────

interface CueEditPanelProps {
  cue: CueSummary;
  onClose: () => void;
}

// ── Komponent ────────────────────────────────────────────────

export function CueEditPanel({ cue, onClose }: CueEditPanelProps) {
  const updateCueInStore = usePlaybackStore(s => s.updateCue);

  // Lokalne pola formularza
  const [title, setTitle] = useState(cue.title);
  const [subtitle, setSubtitle] = useState(cue.subtitle);
  const [durationInput, setDurationInput] = useState(formatDurationForInput(cue.duration_ms));
  const [startType, setStartType] = useState<'soft' | 'hard'>(cue.start_type);
  const [hardStartDatetime, setHardStartDatetime] = useState(
    cue.start_type === 'hard' && cue.hard_start_datetime
      ? cue.hard_start_datetime.slice(0, 16) // "YYYY-MM-DDTHH:MM"
      : '',
  );
  const [autoStart, setAutoStart] = useState(cue.auto_start);
  const [backgroundColor, setBackgroundColor] = useState(cue.background_color ?? '');
  const [durationError, setDurationError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset formularza gdy zmieni się cue
  useEffect(() => {
    setTitle(cue.title);
    setSubtitle(cue.subtitle);
    setDurationInput(formatDurationForInput(cue.duration_ms));
    setStartType(cue.start_type);
    setHardStartDatetime(
      cue.start_type === 'hard' && cue.hard_start_datetime
        ? cue.hard_start_datetime.slice(0, 16)
        : '',
    );
    setAutoStart(cue.auto_start);
    setBackgroundColor(cue.background_color ?? '');
    setDurationError(false);
  }, [cue.id, cue.title, cue.subtitle, cue.duration_ms, cue.start_type, cue.hard_start_datetime, cue.auto_start, cue.background_color]);

  // Walidacja duration
  const validateDuration = useCallback((value: string) => {
    const parsed = parseDurationInput(value);
    setDurationError(parsed === null);
    return parsed;
  }, []);

  // Zapisz zmiany
  const handleSave = useCallback(async () => {
    const parsedMs = parseDurationInput(durationInput);
    if (parsedMs === null) {
      setDurationError(true);
      return;
    }

    setSaving(true);
    try {
      const input: Record<string, unknown> = {
        title,
        subtitle,
        duration_ms: parsedMs,
        start_type: startType,
        auto_start: autoStart,
        background_color: backgroundColor || undefined,
      };

      if (startType === 'hard' && hardStartDatetime) {
        input.hard_start_datetime = new Date(hardStartDatetime).toISOString();
      } else if (startType === 'soft') {
        input.hard_start_datetime = undefined;
      }

      const updated = await window.nextime.updateCue(cue.id, input);
      if (updated) {
        // Aktualizuj store lokalnie
        updateCueInStore(cue.id, {
          title,
          subtitle,
          duration_ms: parsedMs,
          start_type: startType,
          hard_start_datetime: startType === 'hard' && hardStartDatetime
            ? new Date(hardStartDatetime).toISOString()
            : undefined,
          auto_start: autoStart,
          background_color: backgroundColor || undefined,
        });
      }
    } catch (err) {
      console.error('[CueEditPanel] Błąd zapisu:', err);
    } finally {
      setSaving(false);
    }
  }, [cue.id, title, subtitle, durationInput, startType, hardStartDatetime, autoStart, backgroundColor, updateCueInStore]);

  // Usuń cue
  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(`Czy na pewno chcesz usunąć cue "${cue.title || '(bez tytułu)'}"?`);
    if (!confirmed) return;

    try {
      const deleted = await window.nextime.deleteCue(cue.id);
      if (deleted) {
        usePlaybackStore.getState().removeCue(cue.id);
        onClose();
      }
    } catch (err) {
      console.error('[CueEditPanel] Błąd usuwania:', err);
    }
  }, [cue.id, cue.title, onClose]);

  return (
    <div className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-200">Edycja cue</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 text-lg leading-none"
          title="Zamknij"
        >
          &times;
        </button>
      </div>

      {/* Formularz */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Tytuł</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            placeholder="Nazwa cue"
          />
        </div>

        {/* Subtitle */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Podtytuł</label>
          <input
            type="text"
            value={subtitle}
            onChange={e => setSubtitle(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            placeholder="Opis"
          />
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Czas trwania (MM:SS)</label>
          <input
            type="text"
            value={durationInput}
            onChange={e => {
              setDurationInput(e.target.value);
              validateDuration(e.target.value);
            }}
            className={`w-full bg-slate-900 border rounded px-3 py-1.5 text-sm font-mono text-slate-200 focus:outline-none ${
              durationError ? 'border-red-500' : 'border-slate-600 focus:border-blue-500'
            }`}
            placeholder="05:00"
          />
          {durationError && (
            <p className="text-xs text-red-400 mt-1">Format: MM:SS lub HH:MM:SS</p>
          )}
        </div>

        {/* Start Type */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Typ startu</label>
          <div className="flex gap-2">
            <button
              onClick={() => setStartType('soft')}
              className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                startType === 'soft'
                  ? 'bg-slate-600 text-slate-200'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Miękki
            </button>
            <button
              onClick={() => setStartType('hard')}
              className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                startType === 'hard'
                  ? 'bg-red-900/50 text-red-300'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Twardy
            </button>
          </div>
        </div>

        {/* Hard Start Datetime — tylko dla hard */}
        {startType === 'hard' && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Czas startu (twardy)</label>
            <input
              type="datetime-local"
              value={hardStartDatetime}
              onChange={e => setHardStartDatetime(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}

        {/* Auto-start */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="auto-start"
            checked={autoStart}
            onChange={e => setAutoStart(e.target.checked)}
            className="w-4 h-4 bg-slate-900 border-slate-600 rounded text-blue-500 focus:ring-blue-500"
          />
          <label htmlFor="auto-start" className="text-xs text-slate-400">
            Automatyczny start (po zakończeniu poprzedniego)
          </label>
        </div>

        {/* Background Color */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Kolor tła</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color || 'none'}
                onClick={() => setBackgroundColor(color)}
                className={`w-7 h-7 rounded border-2 transition-all ${
                  backgroundColor === color
                    ? 'border-blue-400 scale-110'
                    : 'border-slate-600 hover:border-slate-400'
                }`}
                style={{
                  backgroundColor: color || 'transparent',
                }}
                title={color || 'Brak koloru'}
              >
                {!color && (
                  <span className="text-slate-500 text-xs">&oslash;</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Prywatna notatka (Faza 13) */}
      <div className="px-4">
        <PrivateNotePanel cueId={cue.id} cueTitle={cue.title} />
      </div>

      {/* Footer — przyciski Save / Cancel / Delete */}
      <div className="px-4 py-3 border-t border-slate-700 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || durationError}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-blue-400 text-white text-sm py-1.5 rounded transition-colors"
          >
            {saving ? 'Zapisuję...' : 'Zapisz'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-1.5 rounded transition-colors"
          >
            Anuluj
          </button>
        </div>
        <button
          onClick={handleDelete}
          className="w-full bg-red-900/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 text-sm py-1.5 rounded transition-colors"
        >
          Usuń cue
        </button>
      </div>
    </div>
  );
}
