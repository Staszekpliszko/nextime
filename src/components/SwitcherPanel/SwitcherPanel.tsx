import { useEffect, useCallback, useRef } from 'react';
import { useSwitcherStatus } from '@/hooks/useSwitcherStatus';

interface SwitcherPanelProps {
  onClose: () => void;
}

/**
 * Uniwersalny panel PGM/PRV tally — zastępuje AtemPanel.
 * Wyświetla stan aktywnego switchera wizji (ATEM/OBS/vMix)
 * z kolorami tally i możliwością ręcznego przełączania.
 */
export function SwitcherPanel({ onClose }: SwitcherPanelProps) {
  const status = useSwitcherStatus(500);
  const lastClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  // Zamknij na Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Kliknięcie → Preview, dwuklik → CUT na PGM
  const handleInputClick = useCallback((inputId: string) => {
    const now = Date.now();
    const last = lastClickRef.current;

    if (last.id === inputId && now - last.time < 400) {
      // Dwuklik — CUT na PGM
      window.nextime.switcherCut(inputId).catch(err => {
        console.error('[SwitcherPanel] CUT error:', err);
      });
      lastClickRef.current = { id: '', time: 0 };
    } else {
      // Pojedyncze kliknięcie — Preview
      window.nextime.switcherSetPreview(inputId).catch(err => {
        console.error('[SwitcherPanel] Preview error:', err);
      });
      lastClickRef.current = { id: inputId, time: now };
    }
  }, []);

  // Nazwa typu switchera po polsku
  const switcherLabel = status.switcherType === 'atem'
    ? 'ATEM'
    : status.switcherType === 'obs'
      ? 'OBS Studio'
      : status.switcherType === 'vmix'
        ? 'vMix'
        : 'Brak';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl w-[520px] max-h-[80vh] overflow-y-auto">
        {/* Nagłówek */}
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-200">Switcher wizji</h3>
            <div
              className={`w-2 h-2 rounded-full ${status.connected ? 'bg-green-400' : 'bg-red-500'}`}
            />
            <span className="text-[10px] text-slate-400">
              {status.connected
                ? status.modelName ?? switcherLabel
                : status.switcherType === 'none'
                  ? 'Nie skonfigurowano'
                  : `${switcherLabel} — rozłączony`
              }
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg">&times;</button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4">
          {/* Brak switchera */}
          {status.switcherType === 'none' && (
            <div className="text-center py-8 text-slate-500 text-sm">
              <div className="text-3xl mb-2">📡</div>
              <div>Brak aktywnego switchera wizji</div>
              <div className="text-xs mt-1 text-slate-600">
                Ustaw switcher w Ustawienia → Ogólne → Aktywny switcher wizji
              </div>
            </div>
          )}

          {/* PGM / PRV display */}
          {status.switcherType !== 'none' && (
            <div className="flex gap-4 bg-slate-900 rounded p-3">
              <div className="flex-1 text-center">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Program</div>
                <div className="text-2xl font-bold text-red-400 font-mono truncate px-1">
                  {status.programInput ?? '—'}
                </div>
              </div>
              <div className="w-px bg-slate-700" />
              <div className="flex-1 text-center">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Preview</div>
                <div className="text-2xl font-bold text-green-400 font-mono truncate px-1">
                  {status.previewInput ?? '—'}
                </div>
              </div>
            </div>
          )}

          {/* Lista inputów / scen z tally */}
          {status.switcherType !== 'none' && status.connected && status.inputs.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-2">
                {status.switcherType === 'obs' ? 'Sceny' : 'Wejścia'}
                <span className="ml-2 text-slate-600 normal-case">
                  (kliknięcie = PRV, dwuklik = CUT na PGM)
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {status.inputs.map(input => {
                  const isPgm = input.id === status.programInput;
                  const isPrv = input.id === status.previewInput;

                  return (
                    <button
                      key={input.id}
                      onClick={() => handleInputClick(input.id)}
                      className={`px-2 py-2 rounded text-xs font-bold transition-colors text-center truncate ${
                        isPgm
                          ? 'bg-red-600 text-white ring-2 ring-red-400'
                          : isPrv
                            ? 'bg-green-600 text-white ring-2 ring-green-400'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                      title={`${input.label}${isPgm ? ' (PGM)' : isPrv ? ' (PRV)' : ''}`}
                    >
                      <div className="text-base font-mono">
                        {status.switcherType === 'obs' ? '' : input.number}
                      </div>
                      <div className="text-[9px] font-normal truncate mt-0.5">
                        {input.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rozłączony — komunikat */}
          {status.switcherType !== 'none' && !status.connected && (
            <div className="text-center py-6 text-slate-500 text-sm">
              <div className="text-2xl mb-2">🔌</div>
              <div>{switcherLabel} — brak połączenia</div>
              <div className="text-xs mt-1 text-slate-600">
                Połącz się w zakładce {switcherLabel} w Ustawieniach
              </div>
            </div>
          )}

          {/* Połączony ale brak inputów */}
          {status.switcherType !== 'none' && status.connected && status.inputs.length === 0 && (
            <div className="text-center py-4 text-slate-500 text-xs">
              Brak dostępnych wejść/scen
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
