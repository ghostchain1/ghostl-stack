/**
 * @file src/api/http.js
 * @description HTTP API server for ghostbrain-gsa.
 *
 * Endpoints:
 *  GET  /health              — always 200; no auth required
 *  GET  /status              — agent status + config summary
 *  POST /scan                — run read-only analysis pipeline
 *  POST /plan                — generate patch plan from last scan
 *  POST /apply               — apply a plan step (DISABLED by default)
 *  POST /verify              — run tests + audit regression
 *  POST /bundle/verify       — offline governance bundle verification
 *  POST /commands            — receive typed commands from ghostbrain-core (HMAC required)
 *
 * Auth:
 *   Inbound from ghostbrain-core: HMAC-SHA256 verified on /commands.
 *   Outbound to ghostbrain-core:  HMAC-SHA256 signed via events/bus.js.
 * Rate limiting: sliding window per IP.
 */

import { createServer } from 'node:http';
import { config }       from '../config.js';
import { checkRateLimit, verifyHmac } from '../security/auth.js';
import { verifyBundleJson } from '../bundles/ogb-verifier.js';
import { runScan, runPlan, runVerify, runApply } from '../agent/agent.js';
import { events } from '../events/bus.js';

// In-memory last scan result (single-process; production should use Redis)
let lastScan = null;

/** Simple JSON response helper */
function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

/** Collect raw body from request */
async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Parse JSON body; returns null on error */
function parseJson(text) {
  try { return JSON.parse(text || '{}'); } catch { return null; }
}

/**
 * Create and return the HTTP server (not yet listening).
 * @returns {import('node:http').Server}
 */
export function createHttpServer() {
  return createServer(async (req, res) => {
    const ip   = req.socket.remoteAddress ?? 'unknown';
    const url  = new URL(req.url ?? '/', `http://localhost`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    // Rate limiting (skip for health)
    if (path !== '/health' && path !== '/healthz') {
      const rl = checkRateLimit(ip);
      if (!rl.ok) return send(res, 429, { ok: false, error: 'rate_limit_exceeded' });
    }

    // ── GET /health ─────────────────────────────────────────────────────────
    if ((path === '/health' || path === '/healthz') && method === 'GET') {
      return send(res, 200, { ok: true, service: 'ghostbrain-gsa', ts: new Date().toISOString() });
    }

    // ── GET /status ──────────────────────────────────────────────────────────
    if (path === '/status' && method === 'GET') {
      return send(res, 200, {
        ok: true,
        agentId:      config.agentId,
        applyEnabled: config.applyEnabled,
        pqRequired:   config.pqSignaturesRequired,
        brand:        config.brand,
        lastScanAt:   lastScan?.observedAt ?? null,
        lastScanOk:   lastScan?.ok ?? null,
      });
    }

    // ── POST /scan ───────────────────────────────────────────────────────────
    if (path === '/scan' && method === 'POST') {
      try {
        const result = await runScan({ repoRoot: config.repoRoot });
        lastScan = result;
        return send(res, 200, { ok: result.ok, correlationId: result.correlationId, summary: result.diagnosis.summary, artifactHash: result.artifactHash });
      } catch (err) {
        return send(res, 500, { ok: false, error: err.message });
      }
    }

    // ── POST /plan ───────────────────────────────────────────────────────────
    if (path === '/plan' && method === 'POST') {
      if (!lastScan) return send(res, 409, { ok: false, error: 'no_scan: run POST /scan first' });
      try {
        const plan = await runPlan(lastScan);
        return send(res, 200, { ok: true, planId: plan.planId, stepCount: plan.steps.length, artifactHash: plan.artifactHash });
      } catch (err) {
        return send(res, 500, { ok: false, error: err.message });
      }
    }

    // ── POST /apply ──────────────────────────────────────────────────────────
    if (path === '/apply' && method === 'POST') {
      if (!config.applyEnabled) {
        return send(res, 403, { ok: false, error: 'apply_disabled: set GSA_APPLY_ENABLED=true to enable' });
      }
      const body = parseJson(await readBody(req));
      if (!body) return send(res, 400, { ok: false, error: 'invalid_json' });
      const { step, bundle } = body;
      if (!step || !bundle) return send(res, 400, { ok: false, error: 'missing fields: step, bundle' });
      try {
        const result = await runApply(step, bundle);
        return send(res, result.ok ? 200 : 403, result);
      } catch (err) {
        return send(res, 500, { ok: false, error: err.message });
      }
    }

    // ── POST /verify ─────────────────────────────────────────────────────────
    if (path === '/verify' && method === 'POST') {
      try {
        const result = await runVerify({ repoRoot: config.repoRoot });
        return send(res, result.ok ? 200 : 422, { ok: result.ok, correlationId: result.correlationId, checks: result.auditResult?.checks });
      } catch (err) {
        return send(res, 500, { ok: false, error: err.message });
      }
    }

    // ── POST /bundle/verify ──────────────────────────────────────────────────
    if (path === '/bundle/verify' && method === 'POST') {
      const raw = await readBody(req);
      const result = verifyBundleJson(raw);
      if (result.ok) {
        return send(res, 200, { ok: true, bundleHash: result.hash });
      } else {
        return send(res, 422, { ok: false, error: result.reason });
      }
    }

    // ── POST /commands ──────────────────────────────────────────────────────
    // Receive typed commands pushed by ghostbrain-core (e.g. 'scan', 'plan',
    // 'verify', 'apply', 'status').  HMAC-SHA256 verification is required when
    // CONTROL_PLANE_HMAC_SECRET is set.  Unknown types are accepted and logged
    // (forward-compat for new brain command types).
    if (path === '/commands' && method === 'POST') {
      const rawBody = await readBody(req);

      // ── HMAC verification ────────────────────────────────────────────────
      const sig = req.headers['x-hmac-signature'] ?? '';
      const ts  = req.headers['x-hmac-timestamp']  ?? '';
      if (config.controlPlaneSecret) {
        const auth = verifyHmac(rawBody, sig, ts);
        if (!auth.ok) {
          return send(res, 401, { ok: false, error: auth.reason });
        }
      } else if (process.env.NODE_ENV === 'production') {
        // In production, /commands always requires a secret
        return send(res, 401, { ok: false, error: 'auth_required' });
      }

      let cmd;
      try { cmd = JSON.parse(rawBody || '{}'); } catch {
        return send(res, 400, { ok: false, error: 'invalid_json' });
      }

      const { type, correlationId, payload } = cmd;
      if (!type || !correlationId) {
        return send(res, 400, { ok: false, error: 'missing fields: type, correlationId' });
      }

      console.log(`[gsa/commands] received: type=${type} cid=${correlationId}`);

      // Emit locally so agents subscribed via bus.subscribe() can react
      await events.auditRecord({ type, correlationId, payload, receivedAt: new Date().toISOString() }, correlationId);

      // Dispatch well-known command types
      try {
        if (type === 'scan') {
          const result = await runScan({ repoRoot: config.repoRoot, ...payload });
          lastScan = result;
          return send(res, 200, {
            ok:            result.ok,
            correlationId: result.correlationId,
            summary:       result.diagnosis?.summary,
            artifactHash:  result.artifactHash,
          });
        }

        if (type === 'plan') {
          if (!lastScan) {
            return send(res, 409, { ok: false, error: 'no_scan: run scan first' });
          }
          const plan = await runPlan(lastScan);
          return send(res, 200, {
            ok:          true,
            planId:      plan.planId,
            stepCount:   plan.steps.length,
            artifactHash: plan.artifactHash,
          });
        }

        if (type === 'verify') {
          const result = await runVerify({ repoRoot: config.repoRoot });
          return send(res, result.ok ? 200 : 422, {
            ok:            result.ok,
            correlationId: result.correlationId,
            checks:        result.auditResult?.checks,
          });
        }

        if (type === 'apply') {
          if (!config.applyEnabled) {
            return send(res, 403, { ok: false, error: 'apply_disabled' });
          }
          const { step, bundle } = payload ?? {};
          if (!step || !bundle) {
            return send(res, 400, { ok: false, error: 'missing fields in payload: step, bundle' });
          }
          const result = await runApply(step, bundle);
          return send(res, result.ok ? 200 : 403, result);
        }

        if (type === 'status') {
          return send(res, 200, {
            ok:           true,
            agentId:      config.agentId,
            applyEnabled: config.applyEnabled,
            brand:        config.brand,
            lastScanAt:   lastScan?.observedAt ?? null,
            lastScanOk:   lastScan?.ok ?? null,
          });
        }

        // Unknown type — accept and log (forward-compat)
        console.log(`[gsa/commands] unknown type "${type}" — acknowledged`);
        return send(res, 202, { ok: true, acknowledged: true, type, correlationId });

      } catch (err) {
        return send(res, 500, { ok: false, error: err.message });
      }
    }

    // 404
    send(res, 404, { ok: false, error: `not_found: ${method} ${path}` });
  });
}
