import { useState, useEffect, useRef } from 'react';
import type { UnifiedSwitcherStatus, SwitcherInput } from '../../electron/ipc/switcher-ipc';

/** Stan zwracany przez useSwitcherStatus */
export interface SwitcherStatusState {
  switcherType: 'atem' | 'obs' | 'vmix' | 'none';
  connected: boolean;
  programInput: string | null;
  previewInput: string | null;
  programNumber: number | null;
  previewNumber: number | null;
  inputs: SwitcherInput[];
  modelName: string | null;
  loading: boolean;
}

const DEFAULT_STATE: SwitcherStatusState = {
  switcherType: 'none',
  connected: false,
  programInput: null,
  previewInput: null,
  programNumber: null,
  previewNumber: null,
  inputs: [],
  modelName: null,
  loading: true,
};

/**
 * Hook polling status aktywnego switchera wizji co intervalMs (domyślnie 500ms).
 * Zwraca zunifikowany stan PGM/PRV/inputy niezależnie od typu switchera.
 */
export function useSwitcherStatus(intervalMs = 500): SwitcherStatusState {
  const [state, setState] = useState<SwitcherStatusState>(DEFAULT_STATE);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const poll = async () => {
      try {
        const status = await window.nextime.switcherGetStatus() as UnifiedSwitcherStatus;
        if (!mountedRef.current) return;
        setState({
          switcherType: status.switcherType,
          connected: status.connected,
          programInput: status.programInput,
          previewInput: status.previewInput,
          programNumber: status.programNumber,
          previewNumber: status.previewNumber,
          inputs: status.inputs,
          modelName: status.modelName,
          loading: false,
        });
      } catch {
        if (!mountedRef.current) return;
        setState(prev => ({ ...prev, loading: false }));
      }
    };

    // Pierwsze pobranie natychmiast
    poll();

    const timer = setInterval(poll, intervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return state;
}
