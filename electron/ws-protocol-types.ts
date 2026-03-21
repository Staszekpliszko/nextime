/**
 * Typy WS protocol dla main process.
 * Podzbiór docs/ws-protocol.ts — tylko to, co potrzebne w Electron main.
 */

/** Lekki opis cue do broadcastu WS (zgodny z WsCueSummary z docs/ws-protocol.ts) */
export interface WsCueSummary {
  id: string;
  title: string;
  subtitle: string;
  duration_ms: number;
  start_type: 'soft' | 'hard';
  hard_start_datetime?: string;
  auto_start: boolean;
  locked: boolean;
  background_color?: string;
  group_id?: string;
  sort_order: number;
}

/** Pojedyncza zmiana w rundownie — broadcast rundown:delta */
export type RundownChange =
  | { op: 'cue_added'; cue: WsCueSummary }
  | { op: 'cue_updated'; cue: WsCueSummary }
  | { op: 'cue_deleted'; cue_id: string }
  | { op: 'cue_moved'; cue_id: string; new_order: number; new_group_id?: string }
  | { op: 'group_added'; group: { id: string; label: string; sort_order: number } }
  | { op: 'group_deleted'; group_id: string }
  | { op: 'variable_changed'; variable: { key: string; value: string } }
  | { op: 'column_added'; column: { id: string; name: string; type: string; sort_order: number } }
  | { op: 'column_deleted'; column_id: string }
  | { op: 'cell_updated'; cue_id: string; column_id: string; richtext?: unknown; dropdown_value?: string };
