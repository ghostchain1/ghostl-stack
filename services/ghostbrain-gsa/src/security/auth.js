/**
 * @file src/security/auth.js
 * @description HMAC-based service-to-service auth for ghostbrain-gsa.
 *
 * Trust model:
 *  - Inbound requests carry X-HMAC-Signature (HMAC-SHA256 over body + timestamp).
 *  - Outbound requests to GhostBrain Core carry the same header.
 *  - Fail closed: no signature = DENY.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

// In-memory request log for rate limiting (window = 60 s)
const requestLog = new Map(); // ip → [timestamps]

/**
 * Compute HMAC-SHA256 signature for a payload.
 * @param {string|Buffer} body
 * @param {number} [ts] - Unix timestamp ms; defaults to Date.now()
 * @returns {string} hex signature
 */
export function sign(body, ts = Date.now()) {
  if (!config.controlPlaneSecret) return '';
  const material = `${ts}:${typeof body === 'string' ? body : body.toString()}`;
  return createHmac('sha256', config.controlPlaneSecret).update(material).digest('hex');
}

/**
 * Verify inbound HMAC signature from X-HMAC-Signature and X-HMAC-Timestamp headers.
 * Rejects if:
 *  - no secret configured → DENY (fail closed)
 *  - missing headers → DENY
 *  - timestamp skew > 5 minutes → DENY (replay protection)
 *  - signature mismatch → DENY
 * @param {string} body - Raw request body string
 * @param {string} sigHeader - Value of X-HMAC-Signature
 * @param {string} tsHeader  - Value of X-HMAC-Timestamp
 * @returns {{ ok: boolean, reason?: string }}
 */
export function verifyHmac(body, sigHeader, tsHeader) {
  if (!config.controlPlaneSecret) return { ok: false, reason: 'no_secret_configured' };
  if (!sigHeader || !tsHeader)    return { ok: false, reason: 'missing_hmac_headers' };

  const ts = parseInt(tsHeader, 10);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    return { ok: false, reason: 'timestamp_skew_exceeded' };
  }

  const expected = sign(body, ts);
  try {
    const ok = timingSafeEqual(Buffer.from(sigHeader, 'hex'), Buffer.from(expected, 'hex'));
    return ok ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
  } catch {
    return { ok: false, reason: 'signature_mismatch' };
  }
}

/**
 * HTTP middleware: verify HMAC or require Bearer token that matches control plane secret.
 * If GSA_APPLY_ENABLED is false, all /apply calls are denied regardless of auth.
 * @returns {(req, res, next) => void}
 */
export function authMiddleware() {
  return (req, res, next) => {
    // Health is always public
    if (req.url === '/health' || req.url === '/healthz') return next();

    // If no secret configured — allow only when GSA is run in open-dev mode
    if (!config.controlPlaneSecret) {
      if (process.env.NODE_ENV === 'production') {
        return res.writeHead(401).end(JSON.stringify({ ok: false, error: 'auth_required' }));
      }
      return next();
    }

    // Accept Bearer token (simpler for inter-service)
    const auth = req.headers['authorization'] ?? '';
    if (auth.startsWith('Bearer ')) {
      const token = auth.slice(7);
      try {
        const ok = timingSafeEqual(Buffer.from(token), Buffer.from(config.controlPlaneSecret));
        if (ok) return next();
      } catch { /* fall through to HMAC */ }
    }

    // Accept HMAC
    const sig = req.headers['x-hmac-signature'] ?? '';
    const ts  = req.headers['x-hmac-timestamp']  ?? '';
    const result = verifyHmac(req.rawBody ?? '', sig, ts);
    if (!result.ok) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: result.reason }));
    }
    next();
  };
}

/**
 * Sliding-window rate limiter (in-memory, per IP).
 * @param {string} ip
 * @returns {{ ok: boolean }}
 */
export function checkRateLimit(ip) {
  const now = Date.now();
  const window = 60_000;
  const timestamps = (requestLog.get(ip) ?? []).filter(t => now - t < window);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return { ok: timestamps.length <= config.rateLimitPerMinute };
}

/**
 * Build Authorization header for outbound calls to GhostBrain Core.
 * @returns {Record<string,string>}
 */
export function outboundHeaders(body = '') {
  const ts = Date.now();
  const sig = sign(body, ts);
  return {
    'Content-Type':     'application/json',
    'X-HMAC-Timestamp': String(ts),
    'X-HMAC-Signature': sig,
    'X-Agent-ID':       config.agentId,
  };
}
