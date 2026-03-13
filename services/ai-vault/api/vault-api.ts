/**
 * GhostStack AI Vault — REST API Entry Point
 * Assembles the Express v5 application with all routers, middleware, and auth.
 *
 * Chains: L1 (14000101), L2 (901), L3 (903). Gas token: GST.
 */

import { createServer, type Server } from 'node:http';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { validateJwt } from '../core/identity-engine.js';
import { buildAuthController } from './auth-controller.js';
import { buildSecretController } from './secret-controller.js';
import { buildKeyController } from './key-controller.js';
import { buildAuditController } from './audit-controller.js';
import type { VaultConfig } from '../config/vault-config.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { SecretManager } from '../core/secret-manager.js';
import type { KeyManager } from '../core/key-manager.js';
import type { SecurityBrain } from '../ai/security-brain.js';

// ── Rate limiter state ────────────────────────────────────────────────────────

interface RateBucket {
  count: number;
  windowStart: number;
  blockedUntil: number;
}

const _rateBuckets = new Map<string, RateBucket>();

function rateLimitMiddleware(windowMs: number, max: number, blockMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    let bucket = _rateBuckets.get(ip);

    if (!bucket || now - bucket.windowStart > windowMs) {
      bucket = { count: 0, windowStart: now, blockedUntil: 0 };
      _rateBuckets.set(ip, bucket);
    }

    if (bucket.blockedUntil > now) {
      res.status(429).json({ error: 'Too many requests — IP temporarily blocked' });
      return;
    }

    bucket.count++;
    if (bucket.count > max) {
      bucket.blockedUntil = now + blockMs;
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }

    next();
  };
}

// ── JWT auth middleware ───────────────────────────────────────────────────────

function authMiddleware(jwtSecret: string, audit: AuditLedger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    const token = authHeader.slice(7);
    try {
      const payload = validateJwt(token, jwtSecret);
      (req as Request & { actor: string }).actor = payload.sub;
      next();
    } catch (err) {
      void audit.append({
        actor:      'unknown',
        actorType:  'service',
        resource:   req.path,
        action:     'auth.deny',
        result:     'denied',
        riskScore:  0.6,
        message:    'JWT validation failed',
        metadata:   { path: req.path, ...(req.ip !== undefined && { ip: req.ip }) },
      });
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

// ── CORS middleware ───────────────────────────────────────────────────────────

function corsMiddleware(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers['origin'];
    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

// ── Error handler ─────────────────────────────────────────────────────────────

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

// ── VaultApi ─────────────────────────────────────────────────────────────────

export class VaultApi {
  private readonly _app: Application;
  private _server?: Server;

  constructor(
    private readonly _config: VaultConfig,
    private readonly _audit: AuditLedger,
    secretMgr: SecretManager,
    keyMgr: KeyManager,
    brain: SecurityBrain,
  ) {
    this._app = express();

    // Body parsing
    this._app.use(express.json({ limit: '1mb' }));

    // CORS
    this._app.use(corsMiddleware(_config.allowedOrigins));

    // Rate limiting (applied globally before auth)
    this._app.use(rateLimitMiddleware(
      _config.rateLimitWindowMs,
      _config.rateLimitMax,
      _config.blockMs,
    ));

    // Security headers
    this._app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });

    // Health check (unauthenticated)
    this._app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', service: 'ghost-ai-vault', ts: Date.now() });
    });

    // Auth routes (/auth/*) — no JWT middleware (these create tokens)
    this._app.use('/auth', buildAuthController(_config, _audit));

    // Protected routes — require valid JWT
    const protect = authMiddleware(_config.jwtSecret, _audit);
    this._app.use('/vault/secret', protect, buildSecretController(secretMgr, brain, _audit));
    this._app.use('/vault/key',    protect, buildKeyController(keyMgr, brain, _audit));
    this._app.use('/vault/audit',  protect, buildAuditController(_audit));

    // 404 handler
    this._app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this._app.use(errorHandler as unknown as Parameters<typeof this._app.use>[0]);
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this._server = createServer(this._app);
      this._server.listen(this._config.port, this._config.host, () => {
        console.log(`[GhostVault] API listening on ${this._config.host}:${this._config.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._server) { resolve(); return; }
      this._server.close((err) => {
        if (err) reject(err); else resolve();
      });
    });
  }

  /** Exposed for testing */
  get app(): Application { return this._app; }
}
