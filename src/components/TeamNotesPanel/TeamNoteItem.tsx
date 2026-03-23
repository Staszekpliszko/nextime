import type { TeamNote } from '../../../electron/db/repositories/team-note.repo';

interface TeamNoteItemProps {
  note: TeamNote;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
}

/** Formatuje czas relatywnie (przed chwilą, 5 min temu, 2 godz. temu, itd.) */
function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'przed chwilą';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min temu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} godz. temu`;
  const days = Math.floor(hours / 24);
  return `${days} dn. temu`;
}

export function TeamNoteItem({ note, onResolve, onDelete }: TeamNoteItemProps) {
  return (
    <div
      className={`px-3 py-2 rounded border transition-colors ${
        note.resolved
          ? 'bg-slate-700/30 border-slate-700/50'
          : 'bg-slate-700/50 border-slate-600/50'
      }`}
    >
      {/* Nagłówek: autor + czas */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-blue-400 truncate">
          {note.author_name}
        </span>
        <span className="text-[10px] text-slate-500 ml-2 whitespace-nowrap">
          {formatRelativeTime(note.created_at)}
        </span>
      </div>

      {/* Treść */}
      <p className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${
        note.resolved ? 'text-slate-500 line-through' : 'text-slate-300'
      }`}>
        {note.content}
      </p>

      {/* Cue badge (jeśli per cue) */}
      {note.cue_id && (
        <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] bg-slate-600/50 text-slate-400 rounded">
          Cue: {note.cue_id.slice(0, 8)}…
        </span>
      )}

      {/* Akcje */}
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => onResolve(note.id, !note.resolved)}
          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
            note.resolved
              ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
              : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
          }`}
        >
          {note.resolved ? 'Otwórz ponownie' : 'Rozwiązane'}
        </button>
        <button
          onClick={() => onDelete(note.id)}
          className="text-[10px] px-2 py-0.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
        >
          Usuń
        </button>
        {note.resolved && (
          <span className="ml-auto text-[10px] text-green-500 font-medium">
            ✓ Rozwiązane
          </span>
        )}
      </div>
    </div>
  );
}
