/**
 * @file services/dtn-relay/src/index.js
 * @description Delay/Disruption-Tolerant Network (DTN) relay for GhostChain governance bundles.
 *
 * Provides a lightweight HTTP relay for air-gapped / intermittent-connectivity nodes
 * to submit and retrieve signed governance bundles.
 *
 * Endpoints:
 *   POST /ingest          - Ingest a signed governance bundle
 *   GET  /fetch/:bundleId - Retrieve a stored bundle by ID
 *   GET  /fetch-chain/:chainId - List all bundle IDs for a chain
 *   GET  /status          - Relay health & stats
 *   DELETE /bundle/:bundleId  - Purge an expired / superseded bundle (admin only)
 *
 * Security:
 *   - Bundles are validated on ingest (merkle root + expiry pre-check)
 *   - Admin DELETE requires RELAY_ADMIN_TOKEN env var (fail-closed if unset)
 *   - Listens on 127.0.0.1 by default; set DTN_RELAY_BIND for external
 *   - All logs go to stdout (structured JSON)
 *
 * No external dependencies — Node.js built-in `http`, `crypto`, `url` only.
 */

import http from 'node:http';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.DTN_RELAY_PORT ?? '7740', 10);
const BIND = process.env.DTN_RELAY_BIND ?? '127.0.0.1';
const ADMIN_TOKEN = process.env.RELAY_ADMIN_TOKEN; // fail-closed: must be set for DELETE
const MAX_BUNDLE_SIZE_BYTES = parseInt(process.env.DTN_MAX_BUNDLE_BYTES ?? String(1 * 1024 * 1024), 10); // 1 MB
const MAX_STORED_BUNDLES = parseInt(process.env.DTN_MAX_STORED ?? '1000', 10);

// ─── In-memory store (replace with LevelDB / SQLite for persistence) ─────────

/**
 * @type {Map<string, { bundle: object, receivedAt: number, chainId: number, digest: string }>}
 */
const bundleStore = new Map();

// ─── Structured logging ───────────────────────────────────────────────────────

function log(level, msg, extra = {}) {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }) + '\n');
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'X-DTN-Relay': 'ghostchain-dtn/1.0',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BUNDLE_SIZE_BYTES) {
        reject(new Error(`payload too large (max ${MAX_BUNDLE_SIZE_BYTES} bytes)`));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ─── Bundle pre-validation (lightweight, no key material needed) ──────────────

function preValidateBundle(bundle) {
  const now = Math.floor(Date.now() / 1000);
  const errors = [];

  if (!bundle.header?.bundleId) errors.push('missing header.bundleId');
  if (!bundle.header?.chainId) errors.push('missing header.chainId');
  if (!bundle.header?.nonce == null) errors.push('missing header.nonce');
  if (!bundle.header?.merkleRoot) errors.push('missing header.merkleRoot');
  if (!bundle.bundleDigest) errors.push('missing bundleDigest');
  if (!Array.isArray(bundle.signatures) || bundle.signatures.length === 0) {
    errors.push('bundle must have at least one signature');
  }
  if (!Array.isArray(bundle.artifacts) || bundle.artifacts.length === 0) {
    errors.push('bundle must have at least one artifact');
  }
  if (bundle.header?.validUntil && bundle.header.validUntil < now) {
    errors.push(`bundle expired at ${bundle.header.validUntil}`);
  }

  // Replay check: reject if we already have this bundleId with same or higher nonce
  const existing = bundleStore.get(bundle.header?.bundleId);
  if (existing && existing.bundle.header.nonce >= bundle.header.nonce) {
    errors.push(`replay rejected: nonce ${bundle.header.nonce} not strictly greater than stored ${existing.bundle.header.nonce}`);
  }

  return errors;
}

// ─── Request router ───────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method?.toUpperCase();

  log('info', 'request', { method, path: pathname, ip: req.socket.remoteAddress });

  try {
    // POST /ingest
    if (method === 'POST' && pathname === '/ingest') {
      return await handleIngest(req, res);
    }

    // GET /fetch/:bundleId
    const fetchMatch = pathname.match(/^\/fetch\/([^/]+)$/);
    if (method === 'GET' && fetchMatch) {
      return handleFetch(res, decodeURIComponent(fetchMatch[1]));
    }

    // GET /fetch-chain/:chainId
    const chainMatch = pathname.match(/^\/fetch-chain\/(\d+)$/);
    if (method === 'GET' && chainMatch) {
      return handleFetchChain(res, parseInt(chainMatch[1], 10));
    }

    // GET /status
    if (method === 'GET' && pathname === '/status') {
      return handleStatus(res);
    }

    // DELETE /bundle/:bundleId (admin)
    const deleteMatch = pathname.match(/^\/bundle\/([^/]+)$/);
    if (method === 'DELETE' && deleteMatch) {
      return handleDelete(req, res, decodeURIComponent(deleteMatch[1]));
    }

    json(res, 404, { error: 'not found', path: pathname });
  } catch (err) {
    log('error', 'request-handler-error', { error: err.message });
    json(res, 500, { error: 'internal relay error' });
  }
}

async function handleIngest(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (e) {
    return json(res, 413, { error: e.message });
  }

  let bundle;
  try {
    bundle = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: 'invalid JSON' });
  }

  const errors = preValidateBundle(bundle);
  if (errors.length > 0) {
    log('warn', 'ingest-rejected', { bundleId: bundle?.header?.bundleId, errors });
    return json(res, 422, { error: 'bundle validation failed', details: errors });
  }

  if (bundleStore.size >= MAX_STORED_BUNDLES) {
    // Evict oldest entry by receivedAt
    let oldestKey = null, oldestTs = Infinity;
    for (const [k, v] of bundleStore) {
      if (v.receivedAt < oldestTs) { oldestTs = v.receivedAt; oldestKey = k; }
    }
    if (oldestKey) bundleStore.delete(oldestKey);
  }

  const digest = createHash('sha256').update(raw).digest('hex');
  bundleStore.set(bundle.header.bundleId, {
    bundle,
    receivedAt: Math.floor(Date.now() / 1000),
    chainId: bundle.header.chainId,
    digest,
  });

  log('info', 'ingest-ok', { bundleId: bundle.header.bundleId, chainId: bundle.header.chainId, digest });
  return json(res, 201, { ok: true, bundleId: bundle.header.bundleId, digest });
}

function handleFetch(res, bundleId) {
  const entry = bundleStore.get(bundleId);
  if (!entry) return json(res, 404, { error: 'bundle not found', bundleId });
  return json(res, 200, { bundle: entry.bundle, receivedAt: entry.receivedAt, digest: entry.digest });
}

function handleFetchChain(res, chainId) {
  const ids = [];
  for (const [id, entry] of bundleStore) {
    if (entry.chainId === chainId) ids.push({ bundleId: id, receivedAt: entry.receivedAt, nonce: entry.bundle.header.nonce });
  }
  ids.sort((a, b) => b.nonce - a.nonce); // highest nonce first
  return json(res, 200, { chainId, count: ids.length, bundles: ids });
}

function handleStatus(res) {
  return json(res, 200, {
    relay: 'ghostchain-dtn',
    version: '1.0.0',
    storedBundles: bundleStore.size,
    maxCapacity: MAX_STORED_BUNDLES,
    bindAddress: BIND,
    port: PORT,
    uptime: process.uptime(),
  });
}

function handleDelete(req, res, bundleId) {
  if (!ADMIN_TOKEN) {
    return json(res, 503, { error: 'admin operations disabled (RELAY_ADMIN_TOKEN not set)' });
  }
  const auth = req.headers['x-admin-token'];
  if (!auth || auth !== ADMIN_TOKEN) {
    log('warn', 'delete-unauthorized', { bundleId });
    return json(res, 403, { error: 'forbidden' });
  }
  if (!bundleStore.has(bundleId)) return json(res, 404, { error: 'bundle not found' });
  bundleStore.delete(bundleId);
  log('info', 'bundle-purged', { bundleId });
  return json(res, 200, { ok: true, bundleId });
}

// ─── Server startup ───────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);

server.listen(PORT, BIND, () => {
  log('info', 'dtn-relay-started', { bind: BIND, port: PORT, maxBundles: MAX_STORED_BUNDLES });
});

server.on('error', err => {
  log('error', 'server-error', { error: err.message });
  process.exit(1);
});

process.on('SIGTERM', () => {
  log('info', 'SIGTERM-received-shutting-down');
  server.close(() => process.exit(0));
});

export { server, bundleStore }; // for testing
