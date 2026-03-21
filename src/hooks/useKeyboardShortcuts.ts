import { useEffect, useCallback } from 'react';
import { usePlaybackStore } from '@/store/playback.store';

interface UseKeyboardShortcutsOptions {
  sendCommand: (event: string, payload?: Record<string, unknown>) => void;
}

/** Sprawdza czy element to edytowalny input */
function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * Globalny system skrótów klawiszowych (CuePilot PC-style)
 *
 * Space — Play/Pause toggle
 * F3 — Toggle Step Mode (timeline)
 * F8 — Take next shot (timeline)
 * F9 — Toggle Hold Mode (timeline)
 * J — Step to next cue (timeline)
 * Left/Right — Scrub ±1 frame (timeline)
 * Shift+Left/Right — Scrub ±10 frames (timeline)
 * Ctrl+Left/Right — Move selected cue ±1 frame (timeline)
 * Ctrl+Shift+Left/Right — Move selected cue ±10 frames (timeline)
 */
export function useKeyboardShortcuts({ sendCommand }: UseKeyboardShortcutsOptions): void {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Nie przechwytuj gdy focus w polu edycyjnym
    if (isEditable(document.activeElement)) return;

    const state = usePlaybackStore.getState();
    const isTimeline = state.viewMode === 'timeline';

    switch (e.key) {
      case ' ': {
        // Space — Play/Pause toggle
        e.preventDefault();
        const isPlaying = state.playback?.tc.is_playing ?? false;
        sendCommand(isPlaying ? 'cmd:pause' : 'cmd:play');
        break;
      }

      case 'F3': {
        // Toggle Step Mode
        if (!isTimeline) return;
        e.preventDefault();
        sendCommand('cmd:step_mode');
        break;
      }

      case 'F8': {
        // Take next shot
        if (!isTimeline) return;
        e.preventDefault();
        sendCommand('cmd:take_shot');
        break;
      }

      case 'F9': {
        // Toggle Hold Mode
        if (!isTimeline) return;
        e.preventDefault();
        sendCommand('cmd:hold_mode');
        break;
      }

      case 'j':
      case 'J': {
        // Step to next cue
        if (!isTimeline) return;
        e.preventDefault();
        sendCommand('cmd:step_next');
        break;
      }

      case 'ArrowLeft':
      case 'ArrowRight': {
        if (!isTimeline) return;
        e.preventDefault();

        const delta = e.key === 'ArrowRight' ? 1 : -1;
        const step = e.shiftKey ? 10 : 1;
        const offset = delta * step;

        if (e.ctrlKey || e.metaKey) {
          // Ctrl+strzałki — przesuń zaznaczony cue
          moveCue(offset);
        } else {
          // Strzałki — scrub
          const currentFrames = state.currentTcFrames;
          const newFrames = Math.max(0, Math.floor(currentFrames) + offset);
          sendCommand('cmd:scrub', { frames: newFrames });
        }
        break;
      }

      case 'F1': {
        // Faza 10: Cycle LTC source (internal → ltc → mtc → manual → internal)
        if (!isTimeline) return;
        e.preventDefault();
        const sources: Array<'internal' | 'ltc' | 'mtc' | 'manual'> = ['internal', 'ltc', 'mtc', 'manual'];
        const currentLtc = state.ltcSource ?? 'internal';
        const ltcIdx = sources.indexOf(currentLtc);
        const nextLtc = sources[(ltcIdx + 1) % sources.length]!;
        sendCommand('cmd:set_ltc_source', { source: nextLtc });
        break;
      }

      case 'F7': {
        // Faza 10: Recall PTZ presets (placeholder — brak obsługi WS, wymaga IPC)
        if (!isTimeline) return;
        e.preventDefault();
        // PTZ recall wymaga aktywnego vision cue — obsługa w przyszłości
        break;
      }

      case 'Delete': {
        // Faza 14: Delete — usuwa zaznaczony cue (tryb rundown)
        if (isTimeline) return;
        if (!state.selectedCueId) return;
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('nextime:delete-selected-cue'));
        break;
      }

      case 'd':
      case 'D': {
        // Faza 14: Ctrl+D — duplikuj zaznaczony cue (tryb rundown)
        if (isTimeline) return;
        if (!(e.ctrlKey || e.metaKey)) return;
        if (!state.selectedCueId) return;
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('nextime:duplicate-selected-cue'));
        break;
      }

      case 'Enter': {
        // Faza 14: Ctrl+Enter — wstaw nowy cue poniżej zaznaczonego (tryb rundown)
        if (isTimeline) return;
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('nextime:insert-cue-below'));
        break;
      }

      case 'Escape': {
        // Faza 14: Escape — odznacz cue + zamknij CueEditPanel
        e.preventDefault();
        usePlaybackStore.getState().setSelectedCueId(null);
        break;
      }

      case '?': {
        // Faza 11: Shortcut help overlay
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('nextime:toggle-shortcut-help'));
        break;
      }

      // Placeholdery — F2, F4, F5, F6, F10
      case 'F2':
      case 'F4':
      case 'F5':
      case 'F6':
      case 'F10':
        if (!isTimeline) return;
        e.preventDefault();
        // Placeholder — obsługa w przyszłych fazach
        break;
    }
  }, [sendCommand]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/** Przesuwa zaznaczony timeline cue o podany offset w klatkach */
async function moveCue(offsetFrames: number): Promise<void> {
  const state = usePlaybackStore.getState();
  const { selectedTimelineCueId, timelineCues } = state;
  if (!selectedTimelineCueId) return;

  const cue = timelineCues.find(c => c.id === selectedTimelineCueId);
  if (!cue) return;

  const newTcIn = Math.max(0, cue.tc_in_frames + offsetFrames);
  const newTcOut = cue.tc_out_frames !== undefined
    ? Math.max(0, cue.tc_out_frames + offsetFrames)
    : undefined;

  try {
    const updated = await window.nextime.updateTimelineCue(selectedTimelineCueId, {
      tc_in_frames: newTcIn,
      tc_out_frames: newTcOut,
    });
    if (updated) {
      usePlaybackStore.getState().updateTimelineCue(updated.id, {
        tc_in_frames: updated.tc_in_frames,
        tc_out_frames: updated.tc_out_frames,
      });
    }
  } catch (err) {
    console.error('[KeyboardShortcuts] Błąd przesuwania cue:', err);
  }
}
