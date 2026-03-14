/**
 * GhostStack AI Vault — Auth Controller
 * Handles authentication and token management.
 *
 * Endpoints:
 *   POST  /auth/token    — issue JWT for valid actor+secret
 *   POST  /auth/revoke   — revoke token (blocks its JTI)
 *   GET   /auth/verify   — verify token validity
 *
 * Authentication model:
 *   Actors authenticate with a pre-shared API key (stored as vault secret or
 *   injected via config). On success a HS256 JWT is issued and returned.
 *   The JWT can then be used as Bearer token for all subsequent requests.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  issueJwt,
  validateJwt,
  revokeToken,
  type ActorIdentity,
} from '../core/identity-engine.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { VaultConfig } from '../config/vault-config.js';

export function buildAuthController(
  config: VaultConfig,
  audit: AuditLedger,
): Router {
  const router = Router();

  // ── POST /auth/token ─────────────────────────────────────────────────────────
  router.post('/token', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { actorId, actorType, roles, secret } = req.body as {
        actorId?: string;
        actorType?: string;
        roles?: string[];
        secret?: string;
      };

      if (!actorId || !actorType || !secret) {
        res.status(400).json({ error: 'actorId, actorType, and secret are required' });
        return;
      }

      // Constant-time comparison against the configured JWT secret / vault token
      const expected = Buffer.from(config.jwtSecret, 'utf8');
      const provided = Buffer.from(secret, 'utf8');

      let valid = false;
      if (expected.length === provided.length) {
        valid = timingSafeEqual(expected, provided);
      }

      // Also accept the raw vaultToken as an alternative credential
      if (!valid && config.vaultToken) {
        const vaultToken = Buffer.from(config.vaultToken, 'utf8');
        const prov2      = Buffer.from(secret, 'utf8');
        if (vaultToken.length === prov2.length) {
          valid = timingSafeEqual(vaultToken, prov2);
        }
      }

      if (!valid) {
        audit.append({
          actor: actorId, actorType,
          resource: 'vault://auth/token',
          action: 'auth.token', result: 'denied',
          riskScore: 0.5, message: 'Invalid credentials',
        });
        res.status(401).json({ error: 'authentication failed' });
        return;
      }

      const identity: ActorIdentity = {
        id:    actorId,
        type:  actorType as ActorIdentity['type'],
        roles: roles ?? [],
      };

      const token     = issueJwt(identity, config.jwtSecret, config.jwtExpirySeconds);
      const expiresAt = Date.now() + config.jwtExpirySeconds * 1000;

      audit.append({
        actor: actorId, actorType,
        resource: 'vault://auth/token',
        action: 'auth.token', result: 'success',
        riskScore: 0,
      });

      res.json({ token, expiresAt });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /auth/revoke ────────────────────────────────────────────────────────
  router.post('/revoke', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.body as { token?: string };
      if (!token) {
        res.status(400).json({ error: 'token is required' });
        return;
      }

      // Validate to extract JTI, then revoke it
      try {
        const payload = validateJwt(token, config.jwtSecret);
        revokeToken(payload.jti);
      } catch {
        // Token may already be expired — add to blocklist anyway
        // by hashing the token itself as a fallback
        revokeToken(token.slice(-32));
      }

      const actorId = (req as Request & { actorId?: string }).actorId ?? 'unknown';
      audit.append({
        actor: actorId, actorType: 'human',
        resource: 'vault://auth/token',
        action: 'auth.revoke', result: 'success',
        riskScore: 0.1,
      });

      res.json({ revoked: true });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /auth/verify ─────────────────────────────────────────────────────────
  router.get('/verify', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      res.status(401).json({ valid: false, error: 'no token provided' });
      return;
    }

    try {
      const payload = validateJwt(token, config.jwtSecret);
      res.json({
        valid: true,
        actorId:   payload.sub,
        actorType: payload.type,
        roles:     payload.roles,
        exp:       payload.exp,
      });
    } catch (err) {
      res.status(401).json({ valid: false, error: err instanceof Error ? err.message : 'invalid token' });
    }
  });

  return router;
}
