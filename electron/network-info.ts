import os from 'os';

// ── Typy ────────────────────────────────────────────────

/** Adres sieciowy interfejsu */
export interface NetworkAddress {
  name: string;
  ip: string;
  family: 'IPv4' | 'IPv6';
}

/** Opis endpointu HTTP API */
export interface EndpointInfo {
  method: string;
  path: string;
  description: string;
}

/** Pełna informacja o połączeniu Companion */
export interface CompanionInfo {
  addresses: NetworkAddress[];
  httpPort: number;
  wsPort: number;
  endpoints: EndpointInfo[];
}

// ── Funkcje ─────────────────────────────────────────────

/**
 * Zwraca listę adresów sieciowych (filtruje loopback i internal).
 * Używa os.networkInterfaces() do wykrycia aktywnych interfejsów.
 */
export function getNetworkAddresses(): NetworkAddress[] {
  const interfaces = os.networkInterfaces();
  const results: NetworkAddress[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      // Pomijamy loopback i wewnętrzne adresy
      if (addr.internal) continue;

      // Node.js < 18.4 zwraca number (4/6), nowsze zwracają string ('IPv4'/'IPv6')
      const family = String(addr.family) === 'IPv4' || String(addr.family) === '4'
        ? 'IPv4' as const
        : 'IPv6' as const;

      results.push({ name, ip: addr.address, family });
    }
  }

  return results;
}

// ── Lista endpointów Companion ──────────────────────────

/** Kompletna lista 15 endpointów HTTP API (4 basic + 11 extended) */
const COMPANION_ENDPOINTS: EndpointInfo[] = [
  // 4 basic (http-server.ts)
  { method: 'GET', path: '/api/rundown/:id/start', description: 'Uruchom playback rundownu' },
  { method: 'GET', path: '/api/rundown/:id/pause', description: 'Zatrzymaj playback rundownu' },
  { method: 'GET', path: '/api/rundown/:id/next', description: 'Przejdź do następnego cue' },
  { method: 'GET', path: '/api/rundown/:id/prev', description: 'Wróć do poprzedniego cue' },
  // 11 extended (companion-extended.ts)
  { method: 'GET', path: '/api/rundown/:id/goto/:cueId', description: 'Skocz do wybranego cue po ID' },
  { method: 'GET', path: '/api/rundown/:id/state', description: 'Pobierz pełny stan rundownu (cue, czas, over/under)' },
  { method: 'GET', path: '/api/rundown/:id/cues', description: 'Lista wszystkich cue w rundownie' },
  { method: 'GET', path: '/api/rundown/:id/speed/:value', description: 'Zmień prędkość playbacku (0.1–10.0)' },
  { method: 'GET', path: '/api/act/:id/step_next', description: 'Następny vision cue na timeline' },
  { method: 'GET', path: '/api/act/:id/take_shot', description: 'Wymuś następne ujęcie (take shot)' },
  { method: 'GET', path: '/api/act/:id/hold_toggle', description: 'Przełącz tryb hold (wstrzymanie timeline)' },
  { method: 'GET', path: '/api/act/:id/step_toggle', description: 'Przełącz tryb step (krok po kroku)' },
  { method: 'GET', path: '/api/atem/cut/:input', description: 'ATEM CUT — przełącz input na Program' },
  { method: 'GET', path: '/api/atem/preview/:input', description: 'ATEM Preview — ustaw input na Preview' },
  { method: 'GET', path: '/api/ptz/:camera/preset/:nr', description: 'PTZ — wywołaj preset kamery (1–16)' },
];

/**
 * Zwraca pełną informację o połączeniu Companion:
 * wykryte adresy IP, porty HTTP/WS, lista endpointów.
 */
export function getCompanionInfo(httpPort: number, wsPort: number): CompanionInfo {
  return {
    addresses: getNetworkAddresses(),
    httpPort,
    wsPort,
    endpoints: COMPANION_ENDPOINTS,
  };
}
