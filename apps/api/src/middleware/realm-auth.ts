/**
 * realm-auth.ts — OIDC realm-aware JWT validation middleware for apps/api
 *
 * Validates Bearer JWTs issued by Keycloak (via ghost-jwks-guard proxy or
 * directly from the Keycloak JWKS endpoint). Populates req.session.realmClaim
 * when a valid JWT is present. Falls through silently when no token is present
 * or OIDC is not configured, so existing session/password auth is unaffected.
 *
 * Usage (applied globally in server.ts, before route handlers):
 *   app.use(realmAuthMiddleware);
 */
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import type { OIDCRealm, RealmClaim } from '../../../../packages/types/index.js';
import { mapRealmClaimToPermissions } from '../lib/rbac.js';

// ─── JWKS key cache ───────────────────────────────────────────────────────────

interface JwkKey {
  kty: string;
  kid?: string;
  use?: string;
  n?: string;
  e?: string;
  x5c?: string[];
  alg?: string;
}

interface JwksResponse {
  keys: JwkKey[];
}

const jwksCache = new Map<string, { keys: JwkKey[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchJwks(jwksUrl: string): Promise<JwkKey[]> {
  const cached = jwksCache.get(jwksUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.keys;
  }
  const res = await fetch(jwksUrl, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status} ${jwksUrl}`);
  const body = (await res.json()) as JwksResponse;
  const keys = body.keys ?? [];
  jwksCache.set(jwksUrl, { keys, fetchedAt: Date.now() });
  return keys;
}

// ─── JWT parsing (header.payload.signature, no external dep required) ─────────

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  preferred_username?: string;
  email?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
}

function parseJwt(token: string): { header: JwtHeader; payload: JwtPayload; signature: string; signed: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid_jwt_format');
  const [headerB64, payloadB64, signature] = parts;
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as JwtHeader;
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as JwtPayload;
  return { header, payload, signature, signed: `${headerB64}.${payloadB64}` };
}

function verifyRs256(signed: string, signature: string, jwk: JwkKey): boolean {
  if (!jwk.n || !jwk.e) return false;
  try {
    const pubKey = crypto.createPublicKey({
      key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
      format: 'jwk',
    } as crypto.JsonWebKeyInput);
    return crypto.verify(
      'SHA256',
      Buffer.from(signed),
      { key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}

// ─── Realm → issuer/JWKS URL resolution ──────────────────────────────────────

function issuerForRealm(realm: OIDCRealm): string | undefined {
  const base = (env.KEYCLOAK_BASE_URL ?? '').replace(/\/$/, '');
  switch (realm) {
    case 'users':
      return env.OIDC_ISSUER_USERS ?? (base ? `${base}/realms/${env.KEYCLOAK_REALM_USERS}` : undefined);
    case 'employees':
      return env.OIDC_ISSUER_EMPLOYEES ?? (base ? `${base}/realms/${env.KEYCLOAK_REALM_EMPLOYEES}` : undefined);
    case 'admins':
      return env.OIDC_ISSUER_ADMINS ?? (base ? `${base}/realms/${env.KEYCLOAK_REALM_ADMINS}` : undefined);
  }
}

function jwksUrlForRealm(realm: OIDCRealm): string | undefined {
  if (env.JWKS_GUARD_URL) {
    // ghost-jwks-guard proxies all realms: /realms/<realm>/certs
    return `${env.JWKS_GUARD_URL.replace(/\/$/, '')}/realms/${realm}/certs`;
  }
  const issuer = issuerForRealm(realm);
  return issuer ? `${issuer}/protocol/openid-connect/certs` : undefined;
}

// ─── Middleware ────────────────────────────────────────────────────────────────

/**
 * Detects the realm from the JWT issuer claim by matching against configured
 * issuer URLs.
 */
function detectRealm(iss: string): OIDCRealm | undefined {
  const realms: OIDCRealm[] = ['users', 'employees', 'admins'];
  for (const r of realms) {
    const expected = issuerForRealm(r);
    if (expected && iss.startsWith(expected)) return r;
  }
  return undefined;
}

/** Validate a Bearer JWT and return a RealmClaim, or null on any failure. */
async function validateBearerToken(token: string): Promise<RealmClaim | null> {
  try {
    const { header, payload, signature, signed } = parseJwt(token);

    if (!payload.iss || !payload.sub) return null;

    // Detect realm from issuer
    const realm = detectRealm(payload.iss);
    if (!realm) return null;

    // Expiry check (with configurable clock tolerance)
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp !== undefined && payload.exp + env.OIDC_CLOCK_TOLERANCE_SECONDS < nowSec) {
      return null; // expired
    }

    // Audience check (optional — only enforce when OIDC_AUDIENCE is set)
    if (env.OIDC_AUDIENCE) {
      const requiredAud = env.OIDC_AUDIENCE.split(',').map((s) => s.trim()).filter(Boolean);
      if (requiredAud.length > 0) {
        const tokenAud = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
        const hasAud = requiredAud.some((a) => tokenAud.includes(a));
        if (!hasAud) return null;
      }
    }

    // Fetch JWKS and verify signature
    const jwksUrl = jwksUrlForRealm(realm);
    if (!jwksUrl) return null;

    const keys = await fetchJwks(jwksUrl);
    const matchingKey = header.kid
      ? keys.find((k) => k.kid === header.kid)
      : keys.find((k) => k.use === 'sig' || !k.use);
    if (!matchingKey) return null;

    if (header.alg !== 'RS256') return null; // only RS256 supported currently
    const valid = verifyRs256(signed, signature, matchingKey);
    if (!valid) return null;

    // Build RealmClaim
    const realmRoles = payload.realm_access?.roles ?? [];
    const clientRoles = Object.values(payload.resource_access ?? {}).flatMap((c) => c.roles ?? []);

    return {
      realm,
      sub: payload.sub,
      preferredUsername: payload.preferred_username,
      email: payload.email,
      realmRoles,
      clientRoles,
      exp: payload.exp ?? 0,
      iss: payload.iss,
    };
  } catch {
    return null;
  }
}

/**
 * Public export for use by routes that need to validate a token they received
 * in a request body (when the client didn't send an Authorization header).
 * Alias for the internal validateBearerToken function.
 */
export const validateBearerTokenForRouter = validateBearerToken;

/**
 * Realm-auth middleware.
 *
 * Extracts `Authorization: Bearer <jwt>` header, validates it against the
 * appropriate Keycloak realm JWKS, and populates `req.session.realmClaim`.
 * Passes through silently on any error to preserve backward-compatible auth.
 */
export const realmAuthMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  // Only proceed if OIDC is configured
  if (!env.KEYCLOAK_BASE_URL && !env.OIDC_ISSUER_USERS && !env.JWKS_GUARD_URL) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7).trim();
  if (!token) return next();

  try {
    const claim = await validateBearerToken(token);
    if (claim) {
      req.session.realmClaim      = claim;
      req.session.oidcRealm       = claim.realm;
      req.session.oidcAccessToken = token;
      // Map realm roles → session roles for RBAC compatibility
      if (!req.session.roles || req.session.roles.length === 0) {
        req.session.roles = claim.realmRoles;
      }
      // Map realm roles → GhostChain permission strings so requirePermission()
      // works for OIDC sessions without requiring a SQLite RBAC lookup.
      if (!req.session.permissions || req.session.permissions.length === 0) {
        req.session.permissions = mapRealmClaimToPermissions(claim);
      }
    }
  } catch {
    // Never block on auth middleware errors
  }

  next();
};

/**
 * Guard middleware: requires a valid realm claim in the session.
 * Use on routes that must only be accessed via OIDC JWT.
 */
export const requireRealmClaim = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.session.realmClaim) {
    res.status(401).json({ error: 'oidc_token_required' });
    return;
  }
  next();
};

/**
 * Guard middleware: requires a specific realm.
 */
export const requireRealm = (realm: OIDCRealm) => (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.session.oidcRealm !== realm) {
    res.status(403).json({ error: 'wrong_realm', required: realm, actual: req.session.oidcRealm ?? null });
    return;
  }
  next();
};

/**
 * Guard middleware: requires any one of the listed realms.
 * Useful for routes shared between employees and admins, etc.
 */
export const requireAnyRealm = (realms: OIDCRealm[]) => (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.session.oidcRealm || !realms.includes(req.session.oidcRealm as OIDCRealm)) {
    res.status(403).json({ error: 'wrong_realm', required: realms, actual: req.session.oidcRealm ?? null });
    return;
  }
  next();
};

/**
 * Guard middleware: requires a specific role to be present in the realm claim.
 * Checks both realmRoles and clientRoles (case-insensitive).
 */
export const requireRealmRole = (role: string) => (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const claim = req.session.realmClaim;
  if (!claim) {
    res.status(401).json({ error: 'oidc_token_required' });
    return;
  }
  const roleLower = role.toLowerCase();
  const allRoles = [...claim.realmRoles, ...claim.clientRoles].map((r) => r.toLowerCase());
  if (!allRoles.includes(roleLower)) {
    res.status(403).json({ error: 'insufficient_realm_role', required: role });
    return;
  }
  next();
};

/**
 * Unified authentication guard.
 *
 * Passes the request through if the caller holds EITHER:
 *   (a) a valid password/session authentication (`req.session.userId` set), OR
 *   (b) a validated OIDC realm claim (`req.session.realmClaim` set).
 *
 * Use this in place of manual session checks on routes that should accept
 * both auth methods.  Authorization (permissions/roles) is enforced separately
 * downstream with requirePermission() or requireRealmRole().
 */
export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.session.userId || req.session.realmClaim) {
    next();
    return;
  }
  res.status(401).json({ error: 'unauthenticated' });
};
