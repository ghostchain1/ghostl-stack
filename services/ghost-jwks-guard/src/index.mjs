import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import yaml from 'js-yaml';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';

const PORT = Number(process.env.PORT || 8090);
const POLICY_PATH = process.env.AUTHZ_POLICIES_FILE || '/etc/ghost/authz/policies.yml';
const REQUEST_ID_HEADER = 'x-request-id';

const requiredAudiences = String(process.env.JWKS_GUARD_AUDIENCE || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const clockToleranceSeconds = Number(process.env.JWKS_GUARD_CLOCK_TOLERANCE_SECONDS || 5);

const realmConfigFromEnv = () => {
  const base = String(process.env.KEYCLOAK_BASE_URL || '').replace(/\/$/, '');
  const usersRealm = process.env.KEYCLOAK_REALM_USERS || 'ghost-users';
  const employeesRealm = process.env.KEYCLOAK_REALM_EMPLOYEES || 'ghost-employees';
  const adminsRealm = process.env.KEYCLOAK_REALM_ADMINS || 'ghost-admins';

  const usersIssuer = process.env.OIDC_ISSUER_USERS || (base ? `${base}/realms/${usersRealm}` : '');
  const employeesIssuer = process.env.OIDC_ISSUER_EMPLOYEES || (base ? `${base}/realms/${employeesRealm}` : '');
  const adminsIssuer = process.env.OIDC_ISSUER_ADMINS || (base ? `${base}/realms/${adminsRealm}` : '');

  const config = {
    users: usersIssuer,
    employees: employeesIssuer,
    admins: adminsIssuer
  };

  for (const [realm, issuer] of Object.entries(config)) {
    if (!issuer) {
      throw new Error(`Missing issuer for realm '${realm}'. Set OIDC_ISSUER_* or KEYCLOAK_BASE_URL + KEYCLOAK_REALM_*.`);
    }
  }

  return config;
};

const loadPolicy = (policyPath) => {
  const absolute = path.isAbsolute(policyPath) ? policyPath : path.join(process.cwd(), policyPath);
  const source = fs.readFileSync(absolute, 'utf8');
  const parsed = yaml.load(source);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.routes)) {
    throw new Error(`invalid_policy_file:${absolute}`);
  }

  const routes = parsed.routes
    .map((route) => ({
      id: String(route.id || ''),
      pathPrefix: String(route.path_prefix || '').trim(),
      allowAnonymous: Boolean(route.allow_anonymous),
      realm: route.realm ? String(route.realm).trim() : undefined,
      rolesAny: Array.isArray(route.roles_any) ? route.roles_any.map((role) => String(role).trim()).filter(Boolean) : [],
      permissionsAny: Array.isArray(route.permissions_any)
        ? route.permissions_any.map((permission) => String(permission).trim()).filter(Boolean)
        : []
    }))
    .filter((route) => route.id && route.pathPrefix.startsWith('/'))
    .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

  return {
    version: parsed.version || 1,
    defaults: parsed.defaults || {},
    routes
  };
};

const normalizePathname = (forwardedUri) => {
  if (!forwardedUri) return '/';
  try {
    return new URL(forwardedUri, 'http://localhost').pathname;
  } catch {
    return '/';
  }
};

const matchesPrefix = (pathname, prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`);

const resolvePolicy = (pathname, policyConfig) => {
  return policyConfig.routes.find((route) => matchesPrefix(pathname, route.pathPrefix));
};

const extractBearerToken = (headerValue) => {
  if (!headerValue) return null;
  const [type, token] = String(headerValue).split(' ', 2);
  if (!type || !token || type.toLowerCase() !== 'bearer') return null;
  return token.trim();
};

const collectTokenRoles = (payload) => {
  const roles = new Set();

  const realmRoles = payload?.realm_access?.roles;
  if (Array.isArray(realmRoles)) {
    realmRoles.filter((entry) => typeof entry === 'string').forEach((entry) => roles.add(entry));
  }

  const resourceAccess = payload?.resource_access;
  if (resourceAccess && typeof resourceAccess === 'object') {
    for (const entry of Object.values(resourceAccess)) {
      const scopedRoles = entry?.roles;
      if (Array.isArray(scopedRoles)) {
        scopedRoles.filter((role) => typeof role === 'string').forEach((role) => roles.add(role));
      }
    }
  }

  return [...roles];
};

const collectTokenPermissions = (payload) => {
  if (!Array.isArray(payload?.permissions)) return [];
  return payload.permissions.filter((entry) => typeof entry === 'string');
};

const makeVerifier = (issuerByRealm) => {
  const realmByIssuer = new Map();
  const jwksByRealm = new Map();

  for (const [realm, issuer] of Object.entries(issuerByRealm)) {
    realmByIssuer.set(issuer, realm);
    const jwksUrl = new URL(`${issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`);
    jwksByRealm.set(
      realm,
      createRemoteJWKSet(jwksUrl, {
        timeoutDuration: 5000,
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60 * 1000
      })
    );
  }

  return async (token) => {
    const decoded = decodeJwt(token);
    const issuer = typeof decoded.iss === 'string' ? decoded.iss : '';
    const realm = realmByIssuer.get(issuer);
    if (!realm) {
      throw new Error('wrong_issuer');
    }

    const jwks = jwksByRealm.get(realm);
    if (!jwks) {
      throw new Error('jwks_not_configured');
    }

    const verifyOptions = {
      issuer,
      clockTolerance: clockToleranceSeconds
    };
    if (requiredAudiences.length) {
      verifyOptions.audience = requiredAudiences;
    }

    const { payload } = await jwtVerify(token, jwks, verifyOptions);

    return {
      realm,
      payload
    };
  };
};

const respond = (res, status, requestId, error) => {
  if (requestId) res.set('X-Correlation-Id', requestId);
  res.set('Cache-Control', 'no-store');
  res.status(status).json({ error });
};

const policyConfig = loadPolicy(POLICY_PATH);
const issuerByRealm = realmConfigFromEnv();
const verifyToken = makeVerifier(issuerByRealm);

const app = express();

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ghost-jwks-guard', policyVersion: policyConfig.version });
});

app.use('/verify', async (req, res) => {
  const requestId = req.header(REQUEST_ID_HEADER) || req.header('x-correlation-id') || '';
  const forwardedUri = req.header('x-forwarded-uri') || '/';
  const pathname = normalizePathname(forwardedUri);
  const routePolicy = resolvePolicy(pathname, policyConfig);

  if (!routePolicy) {
    if (requestId) res.set('X-Correlation-Id', requestId);
    res.status(200).send('ok');
    return;
  }

  if (routePolicy.allowAnonymous) {
    if (requestId) res.set('X-Correlation-Id', requestId);
    res.status(200).send('ok');
    return;
  }

  const token = extractBearerToken(req.header('authorization'));
  if (!token) {
    respond(res, 401, requestId, 'missing_bearer_token');
    return;
  }

  try {
    const verified = await verifyToken(token);
    const subject = typeof verified.payload.sub === 'string' ? verified.payload.sub : '';
    const sessionId = typeof verified.payload.jti === 'string' ? verified.payload.jti : '';
    const roles = collectTokenRoles(verified.payload);
    const permissions = collectTokenPermissions(verified.payload);

    if (routePolicy.realm && verified.realm !== routePolicy.realm) {
      respond(res, 403, requestId, 'realm_mismatch');
      return;
    }

    if (routePolicy.rolesAny.length > 0 && !routePolicy.rolesAny.some((role) => roles.includes(role))) {
      respond(res, 403, requestId, 'missing_required_role');
      return;
    }

    if (
      routePolicy.permissionsAny.length > 0 &&
      !routePolicy.permissionsAny.some((permission) => permissions.includes(permission))
    ) {
      respond(res, 403, requestId, 'missing_required_permission');
      return;
    }

    res.set('X-Ghost-Realm', verified.realm);
    if (subject) res.set('X-Ghost-Subject', subject);
    if (roles.length) res.set('X-Ghost-Roles', roles.join(','));
    if (sessionId) res.set('X-Ghost-Session-Id', sessionId);
    if (requestId) res.set('X-Correlation-Id', requestId);
    res.status(200).send('ok');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'token_verify_failed';
    const authErrors = new Set(['ERR_JWT_EXPIRED', 'ERR_JWT_CLAIM_VALIDATION_FAILED', 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED']);
    if (authErrors.has(message) || message === 'wrong_issuer') {
      respond(res, 401, requestId, message === 'wrong_issuer' ? 'wrong_issuer' : 'invalid_or_expired_token');
      return;
    }
    respond(res, 401, requestId, 'invalid_or_expired_token');
  }
});

app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      event: 'ghost_jwks_guard_started',
      port: PORT,
      policyPath: POLICY_PATH,
      issuers: issuerByRealm,
      audiences: requiredAudiences
    })
  );
});
