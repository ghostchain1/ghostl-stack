/**
 * @file services/hyper-ghost-ai/src/index.js
 * @description Hyper Ghost AI HTTP API
 *
 * Endpoints:
 *   POST /action         - Dispatch a role-based action
 *   GET  /audit          - Retrieve recent audit log
 *   POST /veto/:id       - Auditor veto a pending action
 *   GET  /roles          - List roles and their allowed actions
 *   GET  /status         - Service health
 *
 * Security:
 *   - Binds to 127.0.0.1 by default (HYPER_GHOST_BIND env to override)
 *   - All requests require X-Role header matching a valid Role (or body.role for backwards compat)
 *   - Governor actions require X-Governor-Token header
 *   - Optional: require GhostBrain token for all mutating endpoints
 *   - All executor actions are allowlist-gated (infra/safeops/allowlist.yml)
 */

import http from 'node:http';
import { URL } from 'node:url';
import { dispatch, vetoAction, getAuditLog, HANDLERS, Role } from './supervisor.js';
import { ROLE_PERMISSIONS } from './roles.js';

const PORT = parseInt(process.env.HYPER_GHOST_PORT ?? '7741', 10);
const BIND = process.env.HYPER_GHOST_BIND ?? '127.0.0.1';

// Hardening knobs
const MAX_BODY_BYTES     = parseInt(process.env.HYPER_GHOST_MAX_BODY_BYTES     ?? '262144', 10); // 256 KiB
const MAX_AUDIT_LIMIT   = parseInt(process.env.HYPER_GHOST_MAX_AUDIT_LIMIT    ?? '200',    10);
const REQUIRE_BRAIN_TOKEN = (process.env.HYPER_GHOST_REQUIRE_BRAIN_TOKEN ?? '0') === '1';
const BRAIN_TOKEN       = process.env.HYPER_GHOST_BRAIN_TOKEN ?? '';

function log(level, msg, extra = {}) {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }) + '\n');
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'X-Hyper-Ghost-AI': '1.1',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data  = '';
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        reject(Object.assign(new Error('payload too large'), { code: 'PAYLOAD_TOO_LARGE' }));
        return;
      }
      data += c;
    });
    req.on('end',   () => resolve(data));
    req.on('error', reject);
  });
}

function requireBrain(req) {
  if (!REQUIRE_BRAIN_TOKEN) return { ok: true };
  if (!BRAIN_TOKEN) return { ok: false, error: 'Server misconfigured: missing HYPER_GHOST_BRAIN_TOKEN' };
  const tok = req.headers['x-brain-token'];
  if (!tok || tok !== BRAIN_TOKEN) return { ok: false, error: 'Unauthorized: invalid brain token' };
  return { ok: true };
}

// Never trust Host header for URL resolution — only needed for pathname/query
function safeBaseUrl() { return 'http://localhost'; }

async function handleRequest(req, res) {
  const method    = req.method?.toUpperCase() ?? 'GET';
  const u         = new URL(req.url ?? '/', safeBaseUrl());
  const path      = u.pathname;
  const reqIdHdr  = req.headers['x-request-id'];
  const requestId = typeof reqIdHdr === 'string' && reqIdHdr ? reqIdHdr : undefined;

  log('info', 'request', { method, path, requestId });

  try {
    // ── Read-only / public endpoints ──────────────────────────────────────────
    if (method === 'GET' && path === '/status') {
      return json(res, 200, { service: 'hyper-ghost-ai', version: '1.1.0', uptime: process.uptime() });
    }

    if (method === 'GET' && path === '/roles') {
      const data = {};
      for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) data[role] = [...perms];
      return json(res, 200, { roles: data });
    }

    if (method === 'GET' && path === '/audit') {
      const limitRaw = parseInt(u.searchParams.get('limit') ?? '50', 10);
      const limit    = Number.isFinite(limitRaw) ? Math.max(1, Math.min(MAX_AUDIT_LIMIT, limitRaw)) : 50;
      return json(res, 200, { audit: getAuditLog(limit) });
    }

    // ── Mutating endpoints — brain-token gate ─────────────────────────────────
    if (method === 'POST' && path === '/action') {
      const brain = requireBrain(req);
      if (!brain.ok) return json(res, 401, { ok: false, error: brain.error });

      let raw = '';
      try { raw = await readBody(req); }
      catch (e) {
        if (e?.code === 'PAYLOAD_TOO_LARGE') return json(res, 413, { ok: false, error: 'payload too large' });
        throw e;
      }

      let body;
      try { body = raw ? JSON.parse(raw) : {}; }
      catch { return json(res, 400, { ok: false, error: 'invalid JSON' }); }

      const role = req.headers['x-role'] ?? body.role;
      if (!role || !Role[role]) {
        return json(res, 400, { ok: false, error: `Invalid or missing role. Valid: ${Object.keys(Role).join(', ')}` });
      }

      const { action, params, requestId: bodyReqId } = body;
      const effectiveRequestId = bodyReqId ?? requestId;

      if (!action)              return json(res, 400, { ok: false, error: 'action is required' });
      if (!effectiveRequestId)  return json(res, 400, { ok: false, error: 'requestId is required (body.requestId or X-Request-Id)' });

      const handler = HANDLERS[action];
      if (!handler) return json(res, 400, { ok: false, error: `No handler for action: ${action}` });

      const governorToken = req.headers['x-governor-token'];
      const result = await dispatch({
        role, action, params: params ?? {},
        requestId: effectiveRequestId, governorToken, handler,
      });

      return json(res, result.ok ? 200 : 403, result);
    }

    const vetoMatch = path.match(/^\/veto\/([^/]+)$/);
    if (method === 'POST' && vetoMatch) {
      const brain = requireBrain(req);
      if (!brain.ok) return json(res, 401, { ok: false, error: brain.error });

      const role = req.headers['x-role'];
      if (role !== Role.AUDITOR) {
        return json(res, 403, { ok: false, error: 'Only AUDITOR role may veto actions' });
      }

      let raw = '';
      try { raw = await readBody(req); }
      catch (e) {
        if (e?.code === 'PAYLOAD_TOO_LARGE') return json(res, 413, { ok: false, error: 'payload too large' });
        throw e;
      }

      let body = {};
      if (raw) {
        try { body = JSON.parse(raw); }
        catch { return json(res, 400, { ok: false, error: 'invalid JSON' }); }
      }

      const requestIdToVeto = decodeURIComponent(vetoMatch[1]);
      vetoAction(requestIdToVeto, body.auditorId ?? 'unknown', body.reason ?? '');
      return json(res, 200, { ok: true, vetoed: requestIdToVeto });
    }

    return json(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    log('error', 'handler-error', { error: err?.message ?? String(err), requestId });
    return json(res, 500, { ok: false, error: 'internal error' });
  }
}

const server = http.createServer(handleRequest);

server.listen(PORT, BIND, () => {
  log('info', 'hyper-ghost-ai-started', {
    bind: BIND, port: PORT,
    requireBrainToken: REQUIRE_BRAIN_TOKEN,
    maxBodyBytes: MAX_BODY_BYTES,
  });
});

server.on('error', err => { log('error', 'server-error', { error: err.message }); process.exit(1); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });

export { server };
