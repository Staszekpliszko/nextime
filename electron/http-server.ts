import express from 'express';
import type { Express, Request, Response } from 'express';
import type { PlaybackEngine } from './playback-engine';
import type { createOutputConfigRepo } from './db/repositories/output-config.repo';
import type { createCueRepo } from './db/repositories/cue.repo';
import type { createColumnRepo } from './db/repositories/column.repo';
import type { createCellRepo } from './db/repositories/cell.repo';
import type { createRundownRepo } from './db/repositories/rundown.repo';
import type { createTextVariableRepo } from './db/repositories/text-variable.repo';

// ── Typ odpowiedzi (zgodny z docs/ws-protocol.ts CompanionApiResponse) ──

interface CompanionApiResponse {
  ok: boolean;
  timesnap: ReturnType<PlaybackEngine['buildTimesnap']>;
  error?: string;
}

// ── Repozytoria opcjonalne (do testów wstecznej kompatybilności) ──

interface HttpServerRepos {
  outputConfigRepo: ReturnType<typeof createOutputConfigRepo>;
  cueRepo: ReturnType<typeof createCueRepo>;
  columnRepo: ReturnType<typeof createColumnRepo>;
  cellRepo: ReturnType<typeof createCellRepo>;
  rundownRepo: ReturnType<typeof createRundownRepo>;
  textVariableRepo?: ReturnType<typeof createTextVariableRepo>;
  wsPort: number;
}

/** Tworzy Express app z endpointami Companion-compatible + Output views */
export function createHttpServer(engine: PlaybackEngine, repos?: HttpServerRepos): Express {
  const app = express();

  // ── Companion-compatible endpoints ──────────────────────────

  // Helper: obsługuje komendę Companion i zwraca response
  const companionHandler = (action: () => void) => {
    return (req: Request, res: Response) => {
      // Walidacja: rundown ID musi zgadzać się z załadowanym
      const state = engine.getState();
      if (!state || state.mode !== 'rundown_ms' || state.rundownId !== req.params.id) {
        res.status(404).json({
          ok: false,
          timesnap: null,
          error: 'Rundown not loaded or ID mismatch',
        });
        return;
      }
      try {
        action();
        const response: CompanionApiResponse = {
          ok: true,
          timesnap: engine.buildTimesnap(),
        };
        res.json(response);
      } catch (err) {
        res.status(500).json({
          ok: false,
          timesnap: null,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    };
  };

  // Companion-compatible endpoints (GET, jak Rundown Studio)
  app.get('/api/rundown/:id/start', companionHandler(() => engine.play()));
  app.get('/api/rundown/:id/pause', companionHandler(() => engine.pause()));
  app.get('/api/rundown/:id/next',  companionHandler(() => engine.next()));
  app.get('/api/rundown/:id/prev',  companionHandler(() => engine.prev()));

  // ── Output API — konfiguracja i dane dla CueApp/Prompter ──────

  if (repos) {
    const { outputConfigRepo, cueRepo, columnRepo, cellRepo, rundownRepo, textVariableRepo, wsPort } = repos;

    // Helper: bezpieczne pobranie tokenu z parametrów route
    const getToken = (req: Request): string => {
      const token = req.params.token;
      if (typeof token !== 'string') return '';
      return token;
    };

    // API: pobierz konfigurację outputu po share_token
    app.get('/api/output/:token/config', (req: Request, res: Response) => {
      const config = outputConfigRepo.findByToken(getToken(req));
      if (!config) {
        res.status(404).json({ ok: false, error: 'Output not found' });
        return;
      }
      res.json({ ok: true, config });
    });

    // API: pobierz cue'y rundownu dla outputu
    app.get('/api/output/:token/cues', (req: Request, res: Response) => {
      const config = outputConfigRepo.findByToken(getToken(req));
      if (!config) {
        res.status(404).json({ ok: false, error: 'Output not found' });
        return;
      }
      const cues = cueRepo.findByRundown(config.rundown_id);
      res.json({ ok: true, cues });
    });

    // API: pobierz tekst skryptu (dla promptera) — cue'y + content z kolumny script
    app.get('/api/output/:token/script', (req: Request, res: Response) => {
      const config = outputConfigRepo.findByToken(getToken(req));
      if (!config) {
        res.status(404).json({ ok: false, error: 'Output not found' });
        return;
      }

      // Pobierz cue'y
      const cues = cueRepo.findByRundown(config.rundown_id);

      // Pobierz mapę zmiennych (do substitution w richtext)
      let variableMap: Record<string, string> = {};
      if (textVariableRepo) {
        const vars = textVariableRepo.findByRundown(config.rundown_id);
        for (const v of vars) {
          variableMap[v.key] = v.value;
        }
      }

      // Pobierz tekst z kolumny script (jeśli column_id ustawiony)
      const scriptColumnId = config.column_id;
      const scriptEntries: Array<{
        cue_id: string;
        title: string;
        subtitle: string;
        duration_ms: number;
        sort_order: number;
        script_text: string;
      }> = [];

      for (const cue of cues) {
        let scriptText = '';
        if (scriptColumnId) {
          const cell = cellRepo.findByCueAndColumn(cue.id, scriptColumnId);
          if (cell) {
            if (cell.dropdown_value) {
              scriptText = cell.dropdown_value;
            } else if (cell.richtext) {
              // Wyciągnij plain text z richtext z substitution zmiennych
              scriptText = extractPlainText(cell.richtext, variableMap);
            }
          }
        }
        scriptEntries.push({
          cue_id: cue.id,
          title: cue.title,
          subtitle: cue.subtitle,
          duration_ms: cue.duration_ms,
          sort_order: cue.sort_order,
          script_text: scriptText,
        });
      }

      res.json({ ok: true, script: scriptEntries });
    });

    // API: pobierz komórki dla cue'ów (dla CueApp rozszerzonego — Faza 13)
    app.get('/api/output/:token/cells', (req: Request, res: Response) => {
      const config = outputConfigRepo.findByToken(getToken(req));
      if (!config) {
        res.status(404).json({ ok: false, error: 'Output not found' });
        return;
      }

      const cues = cueRepo.findByRundown(config.rundown_id);
      const allColumns = columnRepo.findByRundown(config.rundown_id);

      // Pobierz mapę zmiennych do substitution
      let variableMap: Record<string, string> = {};
      if (textVariableRepo) {
        const vars = textVariableRepo.findByRundown(config.rundown_id);
        for (const v of vars) {
          variableMap[v.key] = v.value;
        }
      }

      // Buduj odpowiedź: komórki per cue, per kolumna
      const result: Array<{
        cue_id: string;
        title: string;
        cells: Array<{
          column_id: string;
          column_name: string;
          text: string;
        }>;
      }> = [];

      for (const cue of cues) {
        const cueCells: Array<{ column_id: string; column_name: string; text: string }> = [];
        for (const col of allColumns) {
          const cell = cellRepo.findByCueAndColumn(cue.id, col.id);
          if (cell) {
            let text = '';
            if (cell.dropdown_value) {
              text = cell.dropdown_value;
            } else if (cell.richtext) {
              text = extractPlainText(cell.richtext, variableMap);
            }
            if (text) {
              cueCells.push({ column_id: col.id, column_name: col.name, text });
            }
          }
        }
        result.push({ cue_id: cue.id, title: cue.title, cells: cueCells });
      }

      res.json({ ok: true, cells: result });
    });

    // API: aktualny stan playbacku (dla CueApp/Prompter polling)
    app.get('/api/output/:token/state', (req: Request, res: Response) => {
      const config = outputConfigRepo.findByToken(getToken(req));
      if (!config) {
        res.status(404).json({ ok: false, error: 'Output not found' });
        return;
      }
      const timesnap = engine.buildTimesnap();
      res.json({ ok: true, timesnap, ws_port: wsPort });
    });

    // ── Widok HTML — CueApp / Prompter / Single ──────────────────

    app.get('/output/:token', (req: Request, res: Response) => {
      const config = outputConfigRepo.findByToken(getToken(req));
      if (!config) {
        res.status(404).send('<!DOCTYPE html><html><body><h1>404 — Output not found</h1></body></html>');
        return;
      }

      const html = generateOutputHtml(config.layout, config.settings, config.share_token, wsPort);
      res.type('html').send(html);
    });
  }

  // 404 dla nieznanych routów
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}

// ── Helper: wyciągnij plain text z richtext JSON ──────────────

function extractPlainText(richtext: unknown, variableMap?: Record<string, string>): string {
  if (typeof richtext === 'string') return richtext;
  if (!richtext || typeof richtext !== 'object') return '';

  const rt = richtext as Record<string, unknown>;

  // TipTap/ProseMirror doc format: { type: 'doc', content: [...] }
  if (rt.type === 'doc' && Array.isArray(rt.content)) {
    return extractTipTapNodes(rt.content as unknown[], variableMap);
  }

  // Prosty tekst node: { type: 'text', text: '...' }
  if (rt.type === 'text' && typeof rt.text === 'string') {
    return resolveTextWithMarks(rt, variableMap);
  }

  // Legacy format: { text: "..." }
  if (typeof rt.text === 'string') return rt.text;

  // Legacy format: { blocks: [{ text: "..." }] }
  if (Array.isArray(rt.blocks)) {
    return rt.blocks
      .map((b: unknown) => {
        if (typeof b === 'string') return b;
        if (b && typeof b === 'object' && typeof (b as Record<string, unknown>).text === 'string') {
          return (b as Record<string, unknown>).text as string;
        }
        return '';
      })
      .join('\n');
  }

  // Fallback: JSON stringify
  return JSON.stringify(richtext);
}

/** Rekursywnie wyciąga tekst z tablicy nodów TipTap */
function extractTipTapNodes(nodes: unknown[], variableMap?: Record<string, string>): string {
  const parts: string[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const n = node as Record<string, unknown>;

    if (n.type === 'text' && typeof n.text === 'string') {
      parts.push(resolveTextWithMarks(n, variableMap));
    } else if (n.type === 'hardBreak') {
      parts.push('\n');
    } else if (n.type === 'paragraph' && Array.isArray(n.content)) {
      const text = extractTipTapNodes(n.content as unknown[], variableMap);
      parts.push(text);
      parts.push('\n'); // paragrafy oddzielone newline
    } else if (Array.isArray(n.content)) {
      parts.push(extractTipTapNodes(n.content as unknown[], variableMap));
    }
  }

  // Usuń trailing newline
  const result = parts.join('');
  return result.endsWith('\n') ? result.slice(0, -1) : result;
}

/** Rozwiązuje tekst z markami — w szczególności textVariable */
function resolveTextWithMarks(node: Record<string, unknown>, variableMap?: Record<string, string>): string {
  const text = node.text as string;
  const marks = node.marks as Array<{ type: string; attrs?: Record<string, unknown> }> | undefined;

  if (marks && variableMap) {
    const varMark = marks.find(m => m.type === 'textVariable');
    if (varMark && typeof varMark.attrs?.key === 'string') {
      const key = varMark.attrs.key as string;
      return variableMap[key] ?? `$${key}`;
    }
  }

  return text;
}

// ── Generator HTML dla widoków output ─────────────────────────

import type { OutputSettings, OutputLayout } from './db/repositories/output-config.repo';

function generateOutputHtml(
  layout: OutputLayout,
  settings: OutputSettings,
  shareToken: string,
  wsPort: number,
): string {
  // Wspólny CSS
  const bgColor = settings.background_color ?? (layout === 'prompter' ? '#000000' : '#0f172a');
  const mirror = settings.mirror ?? 'off';
  const mirrorTransform = mirror === 'vertical' ? 'scaleX(-1)'
    : mirror === 'horizontal' ? 'scaleY(-1)'
    : mirror === 'vertical,horizontal' ? 'scale(-1, -1)'
    : 'none';

  // Prompter-specific
  const textSize = settings.prompter_text_size ?? 48;
  const margin = settings.prompter_margin ?? 40;
  const indicator = settings.prompter_indicator ?? 30;
  const uppercase = settings.prompter_uppercase ?? false;
  const autoScroll = settings.prompter_auto_scroll ?? true;

  const commonStyles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${escapeHtml(bgColor)};
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      overflow-x: hidden;
      transform: ${mirrorTransform};
    }
    .cue-active { background: rgba(34, 197, 94, 0.15) !important; border-left: 4px solid #22c55e; }
    .cue-next { background: rgba(234, 179, 8, 0.1) !important; border-left: 4px solid #eab308; }
    .status-bar { position: fixed; top: 0; left: 0; right: 0; height: 32px; background: rgba(0,0,0,0.8);
      display: flex; align-items: center; padding: 0 12px; font-size: 12px; color: #94a3b8; z-index: 100; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; }
    .status-connected { background: #22c55e; }
    .status-disconnected { background: #ef4444; }
  `;

  if (layout === 'list') {
    return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NextTime — Output (List)</title>
<style>${commonStyles}
  body { padding-top: 40px; }
  .cue-table { width: 100%; border-collapse: collapse; }
  .cue-row { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.3s; cursor: default; }
  .cue-title { font-size: 16px; font-weight: 600; color: #f1f5f9; }
  .cue-subtitle { font-size: 13px; color: #94a3b8; margin-top: 2px; }
  .cue-duration { font-size: 13px; color: #64748b; font-variant-numeric: tabular-nums; }
  .cue-number { font-size: 13px; color: #64748b; min-width: 30px; }
  @media (max-width: 768px) {
    .cue-row { padding: 10px 12px; }
    .cue-title { font-size: 14px; }
  }
</style></head><body>
<div class="status-bar"><div class="status-dot status-disconnected" id="statusDot"></div><span id="statusText">Łączenie...</span></div>
<div id="cueList"></div>
<script>${generateWsClientScript(shareToken, wsPort, 'list')}</script>
</body></html>`;
  }

  if (layout === 'single') {
    const showTimeOfDay = settings.time_of_day === 'on';
    const showNextCue = (settings as Record<string, unknown>).next_cue === 'on';
    return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NextTime — Output (Single)</title>
<style>${commonStyles}
  body { display: flex; flex-direction: column; height: 100vh; padding-top: 40px; }
  .main { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 40px; text-align: center; }
  .cue-title-large { font-size: clamp(32px, 6vw, 72px); font-weight: 700; color: #f8fafc; line-height: 1.2; }
  .cue-subtitle-large { font-size: clamp(18px, 3vw, 36px); color: #94a3b8; margin-top: 12px; }
  .countdown { font-size: clamp(48px, 10vw, 120px); font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 24px; }
  .countdown-ok { color: #22c55e; }
  .countdown-warning { color: #eab308; }
  .countdown-danger { color: #ef4444; }
  .next-preview { position: fixed; bottom: 0; left: 0; right: 0; padding: 16px 24px; background: rgba(0,0,0,0.6);
    font-size: 16px; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.1); }
  .next-label { color: #eab308; font-weight: 600; }
  .time-of-day { position: fixed; top: 40px; right: 16px; font-size: 24px; font-variant-numeric: tabular-nums; color: #64748b; }
</style></head><body>
<div class="status-bar"><div class="status-dot status-disconnected" id="statusDot"></div><span id="statusText">Łączenie...</span></div>
${showTimeOfDay ? '<div class="time-of-day" id="timeOfDay">--:--:--</div>' : ''}
<div class="main">
  <div class="cue-title-large" id="cueTitle">—</div>
  <div class="cue-subtitle-large" id="cueSubtitle"></div>
  <div class="countdown countdown-ok" id="countdown">--:--</div>
</div>
${showNextCue ? '<div class="next-preview"><span class="next-label">NEXT:</span> <span id="nextCueTitle">—</span></div>' : ''}
<script>
var showTimeOfDay = ${showTimeOfDay};
var showNextCue = ${showNextCue};
${generateWsClientScript(shareToken, wsPort, 'single')}
</script>
</body></html>`;
  }

  if (layout === 'prompter') {
    return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NextTime — Prompter</title>
<style>${commonStyles}
  body { padding-top: 40px; background: #000; color: #fff; }
  .prompter-container { padding: ${margin}px; }
  .prompter-entry { margin-bottom: 32px; transition: opacity 0.5s; }
  .prompter-entry.past { opacity: 0.3; }
  .prompter-entry.active { opacity: 1; }
  .prompter-entry.future { opacity: 0.6; }
  .prompter-cue-title { font-size: ${Math.round(textSize * 0.6)}px; color: #94a3b8; font-weight: 600;
    margin-bottom: 8px; ${uppercase ? 'text-transform: uppercase;' : ''} }
  .prompter-text { font-size: ${textSize}px; line-height: 1.4; color: #ffffff;
    ${uppercase ? 'text-transform: uppercase;' : ''} }
  .indicator { position: fixed; left: 0; right: 0; height: 3px; background: #ef4444; pointer-events: none;
    top: ${indicator}%; z-index: 50; opacity: 0.7; }
</style></head><body>
<div class="status-bar"><div class="status-dot status-disconnected" id="statusDot"></div><span id="statusText">Łączenie...</span></div>
<div class="indicator"></div>
<div class="prompter-container" id="prompterContainer"></div>
<script>
var autoScroll = ${autoScroll};
${generateWsClientScript(shareToken, wsPort, 'prompter')}
</script>
</body></html>`;
  }

  // Fallback
  return '<!DOCTYPE html><html><body><h1>Unknown layout</h1></body></html>';
}

// ── Helper: escape HTML ──────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Generator WebSocket klient (inline JS) ───────────────────

function generateWsClientScript(shareToken: string, wsPort: number, layout: string): string {
  // Escapujemy token dla bezpieczeństwa (jest UUID, ale na wszelki wypadek)
  const safeToken = shareToken.replace(/[^a-f0-9-]/gi, '');

  return `
(function() {
  var wsPort = ${wsPort};
  var shareToken = '${safeToken}';
  var layout = '${layout}';
  var ws = null;
  var reconnectTimer = null;
  var reconnectDelay = 1000;
  var cuesData = [];
  var currentCueId = null;
  var nextCueId = null;
  var lastTimesnapAt = 0;
  var lastPlayback = null;

  // Inicjalizacja — pobierz cue'y z API
  fetch('/api/output/' + shareToken + (layout === 'prompter' ? '/script' : '/cues'))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        cuesData = layout === 'prompter' ? data.script : data.cues;
        render();
      }
    })
    .catch(function(e) { console.error('[CueApp] Fetch error:', e); });

  function connect() {
    var host = window.location.hostname || 'localhost';
    ws = new WebSocket('ws://' + host + ':' + wsPort);

    ws.onopen = function() {
      // Handshake
      ws.send(JSON.stringify({
        event: 'client:hello',
        payload: {
          client_type: layout === 'prompter' ? 'prompter' : 'cueapp',
          auth_token: '',
          client_version: '1.0.0'
        }
      }));
    };

    ws.onmessage = function(e) {
      try {
        var msg = JSON.parse(e.data);
        handleMessage(msg);
      } catch(err) {}
    };

    ws.onclose = function() {
      setStatus(false);
      scheduleReconnect();
    };

    ws.onerror = function() {
      setStatus(false);
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function() {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
  }

  function handleMessage(msg) {
    switch(msg.event) {
      case 'server:welcome':
        setStatus(true);
        reconnectDelay = 1000;
        if (msg.payload && msg.payload.initial_state && msg.payload.initial_state.playback) {
          handleTimesnap(msg.payload.initial_state.playback);
        }
        break;
      case 'playback:timesnap':
        handleTimesnap(msg.payload);
        break;
      case 'rundown:current_cue':
        if (msg.payload) {
          currentCueId = msg.payload.cue_id || null;
          nextCueId = msg.payload.next_cue_id || null;
          render();
        }
        break;
      case 'rundown:delta':
        // Odśwież dane po zmianach (Faza 13)
        if (msg.payload && msg.payload.changes) {
          var needsRefresh = false;
          for (var ci = 0; ci < msg.payload.changes.length; ci++) {
            var change = msg.payload.changes[ci];
            if (change.op === 'cell_updated' || change.op === 'cue_added' || change.op === 'cue_deleted' || change.op === 'cue_updated') {
              needsRefresh = true;
            }
          }
          if (needsRefresh) {
            // Ponownie pobierz dane z API
            fetch('/api/output/' + shareToken + (layout === 'prompter' ? '/script' : '/cues'))
              .then(function(r) { return r.json(); })
              .then(function(data) {
                if (data.ok) {
                  cuesData = layout === 'prompter' ? data.script : data.cues;
                  render();
                }
              })
              .catch(function() {});
          }
        }
        break;
    }
  }

  function handleTimesnap(snap) {
    lastPlayback = snap;
    lastTimesnapAt = Date.now();
    if (snap.tc_mode === 'rundown_ms') {
      currentCueId = snap.rundown_cue_id || null;
      nextCueId = snap.next_cue_id || null;
    }
    render();
  }

  function setStatus(connected) {
    var dot = document.getElementById('statusDot');
    var text = document.getElementById('statusText');
    if (dot) {
      dot.className = 'status-dot ' + (connected ? 'status-connected' : 'status-disconnected');
    }
    if (text) {
      text.textContent = connected ? 'Połączono' : 'Rozłączono';
    }
  }

  function formatMs(ms) {
    if (ms === null || ms === undefined) return '--:--';
    var totalSec = Math.floor(Math.abs(ms) / 1000);
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    var h = Math.floor(m / 60);
    m = m % 60;
    if (h > 0) return pad(h) + ':' + pad(m) + ':' + pad(s);
    return pad(m) + ':' + pad(s);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function render() {
    if (layout === 'list') renderList();
    else if (layout === 'single') renderSingle();
    else if (layout === 'prompter') renderPrompter();
  }

  function renderList() {
    var container = document.getElementById('cueList');
    if (!container || !cuesData.length) return;

    var html = '';
    for (var i = 0; i < cuesData.length; i++) {
      var cue = cuesData[i];
      var cls = 'cue-row';
      if (cue.id === currentCueId) cls += ' cue-active';
      else if (cue.id === nextCueId) cls += ' cue-next';

      var durStr = formatMs(cue.duration_ms);
      html += '<div class="' + cls + '" id="cue-' + cue.id + '" style="display:flex;align-items:center;gap:12px;">';
      html += '<span class="cue-number">' + (i + 1) + '</span>';
      html += '<div style="flex:1"><div class="cue-title">' + escapeH(cue.title) + '</div>';
      if (cue.subtitle) html += '<div class="cue-subtitle">' + escapeH(cue.subtitle) + '</div>';
      html += '</div>';
      html += '<span class="cue-duration">' + durStr + '</span>';
      html += '</div>';
    }
    container.innerHTML = html;

    // Auto-scroll do aktywnego cue
    if (currentCueId) {
      var el = document.getElementById('cue-' + currentCueId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function renderSingle() {
    var titleEl = document.getElementById('cueTitle');
    var subtitleEl = document.getElementById('cueSubtitle');
    var countdownEl = document.getElementById('countdown');

    if (!lastPlayback || !cuesData.length) return;

    var cue = null;
    for (var i = 0; i < cuesData.length; i++) {
      if (cuesData[i].id === currentCueId) { cue = cuesData[i]; break; }
    }

    if (titleEl) titleEl.textContent = cue ? cue.title : '—';
    if (subtitleEl) subtitleEl.textContent = cue ? (cue.subtitle || '') : '';

    // Countdown obliczenie
    if (countdownEl && lastPlayback.tc_mode === 'rundown_ms') {
      var tc = lastPlayback.tc;
      var remaining;
      if (tc.is_playing) {
        remaining = tc.deadline_ms - Date.now();
      } else {
        remaining = tc.deadline_ms - tc.last_stop_ms;
      }
      countdownEl.textContent = formatMs(remaining);
      countdownEl.className = 'countdown ' + (remaining < 0 ? 'countdown-danger' : remaining < 10000 ? 'countdown-warning' : 'countdown-ok');
    }

    // Next cue
    if (typeof showNextCue !== 'undefined' && showNextCue) {
      var nextEl = document.getElementById('nextCueTitle');
      if (nextEl) {
        var nextCue = null;
        for (var j = 0; j < cuesData.length; j++) {
          if (cuesData[j].id === nextCueId) { nextCue = cuesData[j]; break; }
        }
        nextEl.textContent = nextCue ? nextCue.title : '—';
      }
    }

    // Time of day
    if (typeof showTimeOfDay !== 'undefined' && showTimeOfDay) {
      var todEl = document.getElementById('timeOfDay');
      if (todEl) {
        var now = new Date();
        todEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
      }
    }
  }

  function renderPrompter() {
    var container = document.getElementById('prompterContainer');
    if (!container || !cuesData.length) return;

    var html = '';
    var activeIdx = -1;
    for (var i = 0; i < cuesData.length; i++) {
      var entry = cuesData[i];
      var state = 'future';
      if (entry.cue_id === currentCueId) { state = 'active'; activeIdx = i; }
      else if (activeIdx >= 0) { state = 'future'; }
      else { state = 'past'; }

      html += '<div class="prompter-entry ' + state + '" id="prompt-' + entry.cue_id + '">';
      var indicator = state === 'active' ? '<span style="color:#22c55e;margin-right:8px;">&#9654;</span>' : '';
      html += '<div class="prompter-cue-title">' + indicator + escapeH(entry.title) + '</div>';
      if (entry.script_text) {
        html += '<div class="prompter-text">' + escapeH(entry.script_text).replace(/\\n/g, '<br>') + '</div>';
      } else if (entry.subtitle) {
        html += '<div class="prompter-text">' + escapeH(entry.subtitle) + '</div>';
      }
      html += '</div>';
    }
    container.innerHTML = html;

    // Auto-scroll do aktywnego
    if (typeof autoScroll !== 'undefined' && autoScroll && currentCueId) {
      var el = document.getElementById('prompt-' + currentCueId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function escapeH(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Countdown update loop (dla trybu single)
  if (layout === 'single') {
    setInterval(function() { render(); }, 200);
  }

  // Time of day update
  if (layout === 'single') {
    setInterval(function() {
      if (typeof showTimeOfDay !== 'undefined' && showTimeOfDay) {
        var todEl = document.getElementById('timeOfDay');
        if (todEl) {
          var now = new Date();
          todEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
        }
      }
    }, 1000);
  }

  // Polling skryptu dla promptera co 5s (odświeżanie treści — Faza 13)
  if (layout === 'prompter') {
    setInterval(function() {
      fetch('/api/output/' + shareToken + '/script')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.ok) {
            cuesData = data.script;
            render();
          }
        })
        .catch(function() {});
    }, 5000);
  }

  connect();
})();
`;
}
