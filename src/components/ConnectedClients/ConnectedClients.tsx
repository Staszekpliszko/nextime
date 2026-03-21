import { useState, useRef } from 'react';
import { usePlaybackStore } from '@/store/playback.store';
import type { ConnectedClientInfo } from '@/store/playback.store';

// Ikony per typ klienta
const CLIENT_ICONS: Record<string, string> = {
  editor: '\u{1F4BB}',    // laptop
  cueapp: '\u{1F4F1}',    // telefon
  prompter: '\u{1F4DF}',  // pager
  output: '\u{1F5A5}',    // monitor
};

const CLIENT_LABELS: Record<string, string> = {
  editor: 'Editor',
  cueapp: 'CueApp',
  prompter: 'Prompter',
  output: 'Output',
};

function formatConnectedTime(connectedAt: string): string {
  const diff = Date.now() - new Date(connectedAt).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'teraz';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function ConnectedClients() {
  const [showPopup, setShowPopup] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const connectedClients = usePlaybackStore(s => s.connectedClients);

  const count = connectedClients.length;

  // Oblicz pozycję popup na podstawie pozycji przycisku
  const getPopupStyle = (): React.CSSProperties => {
    if (!buttonRef.current) return { top: 0, left: 0 };
    const rect = buttonRef.current.getBoundingClientRect();
    return {
      top: rect.bottom + 4,
      left: Math.max(8, rect.left), // nie wychodzi poza lewy margines
    };
  };

  return (
    <>
      {/* Badge z liczbą klientów */}
      <button
        ref={buttonRef}
        onClick={() => setShowPopup(!showPopup)}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-slate-700 transition-colors"
        title={`${count} podlaczonych klientow`}
      >
        <span className="text-sm">{'\u{1F465}'}</span>
        <span className={`font-mono font-bold ${count > 0 ? 'text-green-400' : 'text-slate-500'}`}>
          {count}
        </span>
      </button>

      {/* Popup z lista klientow — fixed, nie przyciety przez overflow */}
      {showPopup && (
        <>
          {/* Backdrop do zamykania */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setShowPopup(false)}
          />

          <div
            className="fixed w-72 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-[9999]"
            style={getPopupStyle()}
          >
            <div className="px-3 py-2 border-b border-slate-700 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Polaczeni klienci ({count})
            </div>

            {count === 0 ? (
              <div className="px-3 py-4 text-center text-slate-500 text-xs">
                Brak polaczonych klientow
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                {connectedClients.map((client: ConnectedClientInfo) => (
                  <div
                    key={client.session_id}
                    className="px-3 py-2 flex items-center gap-2 hover:bg-slate-700/50 border-b border-slate-700/50 last:border-0"
                  >
                    <span className="text-base">
                      {CLIENT_ICONS[client.client_type] ?? '\u{2753}'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-200">
                        {CLIENT_LABELS[client.client_type] ?? client.client_type}
                        {client.camera_filter !== undefined && (
                          <span className="ml-1 text-cyan-400">CAM {client.camera_filter}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">
                        {client.session_id.substring(0, 8)}... | {formatConnectedTime(client.connected_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
