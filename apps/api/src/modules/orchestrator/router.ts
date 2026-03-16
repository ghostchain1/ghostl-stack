/**
 * modules/orchestrator/router.ts — BFF proxy for the GhostBrain Orchestrator.
 *
 * Forwards requests from the web frontend to the orchestrator service at :7895.
 * Attaches HMAC credentials to mutating endpoints before proxying.
 *
 * Security:
 *   - Path validated: only known sub-paths are proxied (allowlist)
 *   - HMAC secret never exposed to the client
 *   - No user-supplied URL fragments reach the upstream request
 *   - AbortController timeout on every upstream call
 *   - Non-2xx upstream responses forwarded as-is (status + JSON body)
 */

import express from 'express';
import { createHmac } from 'node:crypto';
import { env } from '../../config/env';

// ── Allowlisted upstream paths ────────────────────────────────────────────────

const ALLOWED_GET  = new Set(['/health', '/status', '/nodes', '/validators', '/containers', '/anomalies']);
const ALLOWED_POST = new Set(['/scan', '/scale']);
// repair/:name and patch/:name are validated separately below

const PARAM_PATH_RE = /^\/(repair|patch)\/([a-z0-9][a-z0-9_\-.]{0,127})$/i;

// ── HMAC helper ───────────────────────────────────────────────────────────────

const HMAC_SECRET = process.env['CONTROL_PLANE_HMAC_SECRET'] ?? '';

function hmacHeaders(body: string): Record<string, string> {
  const ts = Date.now().toString();
  const sig = HMAC_SECRET
    ? createHmac('sha256', HMAC_SECRET).update(`${ts}:${body}`).digest('hex')
    : 'unsigned';
  return { 'x-hmac-timestamp': ts, 'x-hmac-signature': sig };
}

// ── Proxy helper ──────────────────────────────────────────────────────────────

const BASE = env.GHOSTBRAIN_ORCHESTRATOR_URL;

async function proxyRequest(
  res: express.Response,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<void> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);

  try {
    const bodyStr   = body !== undefined ? JSON.stringify(body) : '';
    const extraHdrs = method === 'POST' ? hmacHeaders(bodyStr) : {};

    const upstream = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        ...extraHdrs,
      },
      body: method === 'POST' ? bodyStr || undefined : undefined,
      signal: ac.signal,
    });

    const json: unknown = await upstream.json().catch(() => ({ error: 'invalid_response' }));
    res.status(upstream.status).json(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'upstream_error';
    res.status(502).json({ error: 'orchestrator_unavailable', details: msg });
  } finally {
    clearTimeout(timer);
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export function buildOrchestratorRouter(): express.Router {
  const router = express.Router();

  // GET read-only endpoints (no HMAC needed)
  router.get('/:resource', async (req, res) => {
    const path = `/${req.params['resource'] ?? ''}`;
    if (!ALLOWED_GET.has(path)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await proxyRequest(res, 'GET', path);
  });

  // POST scan / scale (HMAC attached by proxyRequest)
  router.post('/:resource', async (req, res) => {
    const path = `/${req.params['resource'] ?? ''}`;
    if (!ALLOWED_POST.has(path)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await proxyRequest(res, 'POST', path, req.body);
  });

  // POST repair/:name  /  patch/:name
  router.post('/:action/:name', async (req, res) => {
    const action = req.params['action'] ?? '';
    const name   = req.params['name']   ?? '';
    const full   = `/${action}/${name}`;

    if (!PARAM_PATH_RE.test(full)) {
      res.status(400).json({ error: 'invalid_path' });
      return;
    }
    await proxyRequest(res, 'POST', full, req.body);
  });

  return router;
}
