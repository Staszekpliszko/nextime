/**
 * Snap/magnet utilities dla timeline cue'ów (Faza 39-D)
 *
 * Przyciąganie krawędzi cue'ów do sąsiadów — ułatwia precyzyjne ustawianie
 */

/** Próg snapowania w klatkach */
export const SNAP_THRESHOLD_FRAMES = 5;

export interface SnapCandidate {
  id: string;
  tc_in_frames: number;
  tc_out_frames?: number;
}

/**
 * Sprawdza czy wartość jest blisko jakiejś krawędzi sąsiednich cue'ów.
 * Jeśli tak — zwraca wartość snap (krawędź sąsiada).
 * Jeśli nie — zwraca oryginalną wartość.
 *
 * @param value — pozycja do sprawdzenia (tc_in lub tc_out)
 * @param allCues — wszystkie cue'y na tracku
 * @param excludeId — ID cue'a do pominięcia (bo to ten który przesuwamy)
 * @param threshold — próg w klatkach (domyślnie SNAP_THRESHOLD_FRAMES)
 */
export function snapToNeighbors(
  value: number,
  allCues: SnapCandidate[],
  excludeId: string,
  threshold: number = SNAP_THRESHOLD_FRAMES,
): number {
  // Zbierz krawędzie (tc_in i tc_out) wszystkich cue'ów oprócz excludeId
  const edges: number[] = [];
  for (const cue of allCues) {
    if (cue.id === excludeId) continue;
    edges.push(cue.tc_in_frames);
    if (cue.tc_out_frames !== undefined) {
      edges.push(cue.tc_out_frames);
    }
  }

  if (edges.length === 0) return value;

  // Znajdź najbliższą krawędź
  let closest = edges[0]!;
  let minDist = Math.abs(value - closest);

  for (let i = 1; i < edges.length; i++) {
    const dist = Math.abs(value - edges[i]!);
    if (dist < minDist) {
      minDist = dist;
      closest = edges[i]!;
    }
  }

  // Snap jeśli w progu
  return minDist <= threshold ? closest : value;
}
