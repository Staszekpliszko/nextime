import { useState, useEffect, useCallback } from 'react';
import type { CompanionInfo, NetworkAddress, EndpointInfo } from '../../../electron/network-info';

// ── Komponent zakładki Companion ───────────────────────────

export function CompanionTab() {
  const [info, setInfo] = useState<CompanionInfo | null>(null);
  const [clients, setClients] = useState<Array<{ session_id: string; client_type: string; connected_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const loadInfo = useCallback(async () => {
    try {
      const data = await window.nextime.getNetworkInfo();
      setInfo(data);
    } catch (err) {
      console.error('[CompanionTab] Błąd pobierania info:', err);
    }
    setLoading(false);
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const data = await window.nextime.getWsClients();
      setClients(data);
    } catch (err) {
      console.error('[CompanionTab] Błąd pobierania klientów WS:', err);
    }
  }, []);

  useEffect(() => {
    void loadInfo();
    void loadClients();

    // Odświeżaj listę klientów co 5s
    const interval = setInterval(() => { void loadClients(); }, 5000);
    return () => clearInterval(interval);
  }, [loadInfo, loadClients]);

  // Kopiuj URL do schowka
  const copyUrl = async (ip: string, port: number) => {
    const url = `http://${ip}:${port}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      console.error('[CompanionTab] Nie udało się skopiować do schowka');
    }
  };

  if (loading || !info) {
    return <div className="text-slate-400 text-sm">Ładowanie informacji o sieci...</div>;
  }

  const ipv4Addresses = info.addresses.filter((a: NetworkAddress) => a.family === 'IPv4');

  return (
    <div className="space-y-6">
      {/* ── Sekcja: Adresy sieciowe ──────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Adresy sieciowe</h3>
        <p className="text-xs text-slate-500 mb-3">
          Wykryte interfejsy sieciowe tego komputera. Użyj jednego z adresów poniżej w konfiguracji Companion.
        </p>
        {ipv4Addresses.length === 0 ? (
          <p className="text-sm text-yellow-400">Nie wykryto aktywnych interfejsów sieciowych IPv4.</p>
        ) : (
          <div className="space-y-2">
            {ipv4Addresses.map((addr: NetworkAddress) => (
              <div
                key={`${addr.name}-${addr.ip}`}
                className="flex items-center gap-3 bg-slate-700/50 rounded px-3 py-2"
              >
                <span className="text-xs text-slate-500 w-[100px] flex-shrink-0 truncate" title={addr.name}>
                  {addr.name}
                </span>
                <span className="text-sm text-slate-200 font-mono flex-1">{addr.ip}</span>
                <button
                  onClick={() => void copyUrl(addr.ip, info.httpPort)}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors flex-shrink-0"
                  title={`Kopiuj http://${addr.ip}:${info.httpPort}`}
                >
                  {copiedUrl === `http://${addr.ip}:${info.httpPort}` ? 'Skopiowano!' : 'Kopiuj URL'}
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => void loadInfo()}
          className="mt-2 px-3 py-1 bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs rounded transition-colors"
        >
          Odśwież
        </button>
      </div>

      {/* ── Sekcja: Porty ───────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Porty</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-700/50 rounded px-3 py-2">
            <span className="text-xs text-slate-500">HTTP API</span>
            <div className="text-sm text-slate-200 font-mono">{info.httpPort}</div>
          </div>
          <div className="bg-slate-700/50 rounded px-3 py-2">
            <span className="text-xs text-slate-500">WebSocket</span>
            <div className="text-sm text-slate-200 font-mono">{info.wsPort}</div>
          </div>
        </div>
      </div>

      {/* ── Sekcja: Status ──────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Status połączeń WebSocket</h3>
        <div className="bg-slate-700/50 rounded px-3 py-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${clients.length > 0 ? 'bg-green-400' : 'bg-slate-500'}`} />
            <span className="text-sm text-slate-200">
              {clients.length === 0
                ? 'Brak podłączonych klientów'
                : `Podłączonych klientów: ${clients.length}`}
            </span>
          </div>
          {clients.length > 0 && (
            <div className="mt-2 space-y-1">
              {clients.map(c => (
                <div key={c.session_id} className="text-xs text-slate-400 flex items-center gap-2">
                  <span className="bg-slate-600 rounded px-1.5 py-0.5">{c.client_type}</span>
                  <span className="text-slate-500">od {new Date(c.connected_at).toLocaleTimeString('pl-PL')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Sekcja: Dostępne endpointy ──────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Dostępne endpointy HTTP API</h3>
        <p className="text-xs text-slate-500 mb-2">
          Wszystkie endpointy akceptują żądania GET. Parametry :id, :cueId itp. należy zastąpić rzeczywistymi wartościami.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="text-left py-1.5 px-2 w-[50px]">Metoda</th>
                <th className="text-left py-1.5 px-2">Ścieżka</th>
                <th className="text-left py-1.5 px-2">Opis</th>
              </tr>
            </thead>
            <tbody>
              {info.endpoints.map((ep: EndpointInfo, i: number) => (
                <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="py-1.5 px-2">
                    <span className="bg-green-900/40 text-green-400 rounded px-1.5 py-0.5 font-mono">
                      {ep.method}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 font-mono text-slate-300">{ep.path}</td>
                  <td className="py-1.5 px-2 text-slate-400">{ep.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Sekcja: Instrukcja konfiguracji ────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Instrukcja konfiguracji Bitfocus Companion</h3>
        <div className="bg-slate-700/30 rounded p-4 space-y-3 text-sm text-slate-300">
          <div className="flex gap-3">
            <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
            <span>Otwórz aplikację <strong className="text-slate-100">Bitfocus Companion</strong> na swoim komputerze.</span>
          </div>
          <div className="flex gap-3">
            <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
            <span>Dodaj nowe połączenie — wyszukaj <strong className="text-slate-100">&quot;NEXTIME&quot;</strong> lub <strong className="text-slate-100">&quot;Generic HTTP&quot;</strong>.</span>
          </div>
          <div className="flex gap-3">
            <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
            <span>
              W polu <strong className="text-slate-100">Host</strong> wpisz adres IP z listy powyżej
              {ipv4Addresses.length > 0 && (
                <span className="text-blue-400 ml-1">(np. {ipv4Addresses[0]?.ip})</span>
              )}.
            </span>
          </div>
          <div className="flex gap-3">
            <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">4</span>
            <span>W polu <strong className="text-slate-100">Port</strong> wpisz <strong className="text-blue-400 font-mono">{info.httpPort}</strong>.</span>
          </div>
          <div className="flex gap-3">
            <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">5</span>
            <span>Utwórz przycisk na StreamDecku, wybierz akcję i wpisz ścieżkę endpointu z tabeli powyżej.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
