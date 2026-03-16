import crypto from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import type {
  ApiKeyService,
  AuthService,
  AuditLogService,
  RBACService,
  UserService
} from './services';
import { requirePermission } from '../../lib/rbac';
import { requireAuth } from '../../middleware/realm-auth';
import type { User } from '../../../../../packages/types';
import type { WalletService } from '../../services/wallet-store';
import type { GhostWalletService } from '../../services/ghostwallet';
import { env } from '../../config/env';
import { emitEvent } from '../../lib/events';
import { isAddress, verifyMessage } from '@ghostchain/sdk';
import { openSqlite } from '../../services/db';

const asyncHandler =
  <TReq extends Request = Request, TRes extends Response = Response>(
    fn: (req: TReq, res: TRes, next: NextFunction) => Promise<unknown>
  ) =>
  (req: TReq, res: TRes, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export interface IdentityAccessDeps {
  authService: AuthService;
  rbacService: RBACService;
  auditLogService: AuditLogService;
  apiKeyService: ApiKeyService;
  userService: UserService;
  walletService?: WalletService;
  ghostWalletService?: GhostWalletService;
}

const attachSession = async (req: Request, user: User | null, deps: IdentityAccessDeps) => {
  if (!user) return { permissions: [] as string[] };
  const permissions = await deps.rbacService.getUserPermissions(user);
  req.session.userId = user.id;
  req.session.roles = user.roles;
  req.session.permissions = permissions;
  req.session.ip = req.ip;
  req.session.userAgent = req.headers['user-agent'];
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomUUID();
  }
  const ttlMs = env.SESSION_TTL_MS || 30 * 60 * 1000;
  const now = Date.now();
  req.session.expiresAt = now + ttlMs;
  req.session.lastSeenAt = now;
  return { permissions, csrfToken: req.session.csrfToken as string };
};

const formatAuthError = (err: unknown) => {
  const message = err instanceof Error ? err.message : 'internal_error';
  switch (message) {
    case 'invalid_credentials':
      return { status: 401, error: 'invalid_credentials' };
    case 'account_locked':
      return { status: 429, error: 'account_locked' };
    case 'password_not_set':
      return { status: 409, error: 'password_not_set' };
    case 'user_exists':
      return { status: 409, error: 'user_exists' };
    case 'bootstrap_disabled':
      return { status: 409, error: 'bootstrap_disabled' };
    case 'SSO_JWT_SECRET not configured':
      return { status: 503, error: 'sso_not_configured' };
    default:
      return { status: 500, error: 'internal_error', message };
  }
};

const respondAuthError = (res: Response, err: unknown) => {
  const mapped = formatAuthError(err);
  res.status(mapped.status).json(mapped);
};

const maskEmail = (value?: string | null) => {
  const trimmed = value?.trim() || '';
  if (!trimmed) return '';
  const [user, domain] = trimmed.split('@');
  if (!domain) return `${trimmed.slice(0, 2)}***`;
  const prefix = user ? `${user.slice(0, 2)}***` : '***';
  return `${prefix}@${domain}`;
};

const logAuthEvent = (level: 'info' | 'warn' | 'error', event: string, meta: Record<string, unknown>) => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...meta }));
};

export const buildIdentityAccessRouter = (deps: IdentityAccessDeps) => {
  const router = Router();
  const walletLinkDb = openSqlite(process.env.AUTH_DB_PATH || process.env.SQLITE_DB_PATH || 'data/auth.db');
  if (walletLinkDb) {
    walletLinkDb.exec(`
      create table if not exists wallet_link_challenges (
        id text primary key,
        user_id text not null,
        wallet_address text not null,
        nonce_hash text not null,
        statement text not null,
        chain_id text not null,
        issued_at text not null,
        expires_at text not null,
        used_at text,
        created_at text not null
      );
      create table if not exists wallet_link_proofs (
        id text primary key,
        user_id text not null,
        wallet_address text not null,
        challenge_id text not null,
        method text not null,
        signature_hash text not null,
        verified_at text not null,
        subject text,
        session_id text
      );
    `);
  }

  const challengeStoreFallback = new Map<
    string,
    {
      id: string;
      userId: string;
      walletAddress: string;
      nonceHash: string;
      statement: string;
      chainId: string;
      issuedAt: string;
      expiresAt: string;
      usedAt?: string | null;
    }
  >();

  const rateLimitState = new Map<string, { count: number; resetAt: number }>();
  const allowWithinRate = (key: string, limit: number, windowMs: number) => {
    const now = Date.now();
    const current = rateLimitState.get(key);
    if (!current || current.resetAt <= now) {
      rateLimitState.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    rateLimitState.set(key, current);
    return true;
  };

  const normalizeWalletAddress = (value: string) => value.trim().toLowerCase();
  const hashValue = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

  const resolveWalletLinkUserId = (req: Request): string | undefined => {
    if (req.session.userId) return req.session.userId;
    // OIDC session: sub from validated realm claim takes precedence over raw headers
    if (req.session.realmClaim?.sub) return req.session.realmClaim.sub;
    const realm = String(req.header('x-ghost-realm') || '').trim();
    const subject = String(req.header('x-ghost-subject') || '').trim();
    if (realm === 'users' && subject) return subject;
    return undefined;
  };

  const createChallenge = (challenge: {
    id: string;
    userId: string;
    walletAddress: string;
    nonceHash: string;
    statement: string;
    chainId: string;
    issuedAt: string;
    expiresAt: string;
  }) => {
    if (walletLinkDb) {
      walletLinkDb
        .prepare(
          `
          insert into wallet_link_challenges
            (id, user_id, wallet_address, nonce_hash, statement, chain_id, issued_at, expires_at, created_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          challenge.id,
          challenge.userId,
          challenge.walletAddress,
          challenge.nonceHash,
          challenge.statement,
          challenge.chainId,
          challenge.issuedAt,
          challenge.expiresAt,
          challenge.issuedAt
        );
      return;
    }
    challengeStoreFallback.set(challenge.id, challenge);
  };

  const getChallenge = (challengeId: string) => {
    if (walletLinkDb) {
      const row = walletLinkDb
        .prepare('select * from wallet_link_challenges where id = ?')
        .get(challengeId) as
        | {
            id: string;
            user_id: string;
            wallet_address: string;
            nonce_hash: string;
            statement: string;
            chain_id: string;
            issued_at: string;
            expires_at: string;
            used_at?: string | null;
          }
        | undefined;
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        walletAddress: row.wallet_address,
        nonceHash: row.nonce_hash,
        statement: row.statement,
        chainId: row.chain_id,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        usedAt: row.used_at
      };
    }
    return challengeStoreFallback.get(challengeId) || null;
  };

  const markChallengeUsed = (challengeId: string, usedAt: string) => {
    if (walletLinkDb) {
      walletLinkDb.prepare('update wallet_link_challenges set used_at = ? where id = ?').run(usedAt, challengeId);
      return;
    }
    const challenge = challengeStoreFallback.get(challengeId);
    if (challenge) {
      challenge.usedAt = usedAt;
      challengeStoreFallback.set(challengeId, challenge);
    }
  };

  const writeWalletProof = (input: {
    id: string;
    userId: string;
    walletAddress: string;
    challengeId: string;
    signature: string;
    verifiedAt: string;
    subject?: string;
    sessionId?: string;
  }) => {
    if (!walletLinkDb) return;
    walletLinkDb
      .prepare(
        `
        insert into wallet_link_proofs
          (id, user_id, wallet_address, challenge_id, method, signature_hash, verified_at, subject, session_id)
        values (?, ?, ?, ?, 'evm_sign_message', ?, ?, ?, ?)
      `
      )
      .run(
        input.id,
        input.userId,
        input.walletAddress,
        input.challengeId,
        hashValue(input.signature),
        input.verifiedAt,
        input.subject || null,
        input.sessionId || null
      );
  };

  const rotateSession = async (req: Request) => {
    const previous = req.sessionID;
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    req.session.rotatedFrom = previous;
    return previous;
  };

  const requestContext = (req: Request) => ({
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  const setCsrfCookie = (res: Response, token: string) => {
    res.cookie('csrf_token', token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });
  };

  router.post(
    '/auth/register',
    asyncHandler(async (req, res) => {
      if (!env.ALLOW_PUBLIC_SIGNUP) {
        res.status(403).json({ error: 'signup_disabled' });
        return;
      }
      const { email, password, createWallet } = req.body as { email?: string; password?: string; createWallet?: boolean };
      if (!email || !password) {
        res.status(400).json({ error: 'email and password required' });
        return;
      }
      try {
        const user = await deps.authService.registerWithPassword(email, password, undefined, requestContext(req));
        await rotateSession(req);
        const { permissions, csrfToken } = await attachSession(req, user, deps);
        const session = await deps.authService.createSession(user.id, req.sessionID, {
          ...requestContext(req),
          rotatedFrom: req.session.rotatedFrom as string | undefined
        });
        if (createWallet !== false && user && deps.ghostWalletService) {
          await deps.ghostWalletService.createWallet({ userId: user.id, label: 'Primary GhostWallet', chainId: 'l1' });
        }
        await deps.auditLogService.append({
          actorId: user?.id || 'unknown',
          action: 'register',
          resource: user?.id || 'unknown',
          meta: { correlationId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'] }
        });
        await emitEvent({
          scope: 'auth',
          type: 'auth:register',
          actorId: user?.id,
          status: 'ok',
          payload: { email }
        });
        if (csrfToken) setCsrfCookie(res, csrfToken);
        res.json({ session, user, permissions, csrfToken });
      } catch (err) {
        await deps.auditLogService.append({
          actorId: 'unknown',
          action: 'register:failed',
          resource: email,
          meta: { correlationId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'] }
        });
        await emitEvent({
          scope: 'auth',
          type: 'auth:register',
          status: 'error',
          payload: { email, error: err instanceof Error ? err.message : 'register_failed' }
        });
        respondAuthError(res, err);
      }
    })
  );

  router.post(
    '/auth/bootstrap',
    asyncHandler(async (req, res) => {
      const { email, password, token } = req.body as { email?: string; password?: string; token?: string };
      if (!env.SETUP_TOKEN || token !== env.SETUP_TOKEN) {
        res.status(403).json({ error: 'invalid_setup_token' });
        return;
      }
      if (!email || !password) {
        res.status(400).json({ error: 'email and password required' });
        return;
      }
      try {
        const user = await deps.authService.bootstrapAdmin(email, password, requestContext(req));
        await rotateSession(req);
        const { permissions, csrfToken } = await attachSession(req, user, deps);
        const session = await deps.authService.createSession(user.id, req.sessionID, {
          ...requestContext(req),
          rotatedFrom: req.session.rotatedFrom as string | undefined
        });
        await deps.auditLogService.append({
          actorId: user.id,
          action: 'bootstrap:admin',
          resource: user.id,
          meta: { correlationId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'] }
        });
        await emitEvent({
          scope: 'auth',
          type: 'auth:bootstrap',
          actorId: user.id,
          status: 'ok',
          payload: { email }
        });
        if (csrfToken) setCsrfCookie(res, csrfToken);
        res.json({ session, user, permissions, csrfToken });
      } catch (err) {
        await emitEvent({
          scope: 'auth',
          type: 'auth:bootstrap',
          status: 'error',
          payload: { email, error: err instanceof Error ? err.message : 'bootstrap_failed' }
        });
        respondAuthError(res, err);
      }
    })
  );

  router.post(
    '/api/auth/login',
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        logAuthEvent('warn', 'auth.login.invalid_payload', {
          correlationId: req.correlationId,
          path: req.path,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        res.status(400).json({ error: 'email and password required' });
        return;
      }
      try {
        logAuthEvent('info', 'auth.login.attempt', {
          correlationId: req.correlationId,
          path: req.path,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          email: maskEmail(email),
          method: 'password'
        });
        const user = await deps.authService.loginWithPassword(email, password, requestContext(req));
        await rotateSession(req);
        const { csrfToken } = await attachSession(req, user, deps);
        await deps.authService.createSession(user.id, req.sessionID, {
          ...requestContext(req),
          rotatedFrom: req.session.rotatedFrom as string | undefined
        });
        await deps.auditLogService.append({
          actorId: user?.id || 'unknown',
          action: 'login:password',
          resource: user?.id || 'unknown',
          meta: { correlationId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'] }
        });
        await emitEvent({
          scope: 'auth',
          type: 'auth:login',
          actorId: user?.id,
          status: 'ok',
          payload: { email, method: 'password' }
        });
        logAuthEvent('info', 'auth.login.success', {
          correlationId: req.correlationId,
          path: req.path,
          actorId: user?.id,
          email: maskEmail(email)
        });
        if (csrfToken) setCsrfCookie(res, csrfToken);
        res.json({ user: { id: user.id, email: user.email, username: user.username, role: user.roles?.[0] } });
      } catch (err) {
        logAuthEvent('error', 'auth.login.failure', {
          correlationId: req.correlationId,
          path: req.path,
          email: maskEmail(email),
          error: err instanceof Error ? err.message : 'login_failed'
        });
        await deps.auditLogService.append({
          actorId: 'unknown',
          action: 'login:failed',
          resource: email,
          meta: { correlationId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'] }
        });
        await emitEvent({
          scope: 'auth',
          type: 'auth:login',
          status: 'error',
          payload: { email, method: 'password', error: err instanceof Error ? err.message : 'login_failed' }
        });
        respondAuthError(res, err);
      }
    })
  );

  router.post(
    '/auth/login/password',
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        logAuthEvent('warn', 'auth.login.invalid_payload', {
          correlationId: req.correlationId,
          path: req.path,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        res.status(400).json({ error: 'email and password required' });
        return;
      }
      try {
        logAuthEvent('info', 'auth.login.attempt', {
          correlationId: req.correlationId,
          path: req.path,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          email: maskEmail(email),
          method: 'password'
        });
        const user = await deps.authService.loginWithPassword(email, password, requestContext(req));
        await rotateSession(req);
        const { permissions, csrfToken } = await attachSession(req, user, deps);
        const session = await deps.authService.createSession(user.id, req.sessionID, {
          ...requestContext(req),
          rotatedFrom: req.session.rotatedFrom as string | undefined
        });
        if (user && deps.ghostWalletService) {
          const wallets = deps.walletService ? await deps.walletService.list() : [];
          const owned = wallets.filter((w) => w.ownerUserId === user.id && w.type === 'custodial');
          if (!owned.length) {
            await deps.ghostWalletService.createWallet({ userId: user.id, label: 'Primary GhostWallet', chainId: 'l1' });
          }
        }
        await deps.auditLogService.append({
          actorId: user?.id || 'unknown',
          action: 'login:password',
          resource: user?.id || 'unknown',
          meta: { correlationId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'] }
        });
        await emitEvent({
          scope: 'auth',
          type: 'auth:login',
          actorId: user?.id,
          status: 'ok',
          payload: { email, method: 'password' }
        });
        logAuthEvent('info', 'auth.login.success', {
          correlationId: req.correlationId,
          path: req.path,
          actorId: user?.id,
          email: maskEmail(email)
        });
        if (csrfToken) setCsrfCookie(res, csrfToken);
        res.json({ session, user, permissions, csrfToken });
      } catch (err) {
        logAuthEvent('error', 'auth.login.failure', {
          correlationId: req.correlationId,
          path: req.path,
          email: maskEmail(email),
          error: err instanceof Error ? err.message : 'login_failed'
        });
        await deps.auditLogService.append({
          actorId: 'unknown',
          action: 'login:failed',
          resource: email,
          meta: { correlationId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'] }
        });
        await emitEvent({
          scope: 'auth',
          type: 'auth:login',
          status: 'error',
          payload: { email, method: 'password', error: err instanceof Error ? err.message : 'login_failed' }
        });
        respondAuthError(res, err);
      }
    })
  );

  router.post(
    '/auth/login/sso',
    asyncHandler(async (req, res) => {
      const { token } = req.body as { token?: string };
      if (!token) {
        res.status(400).json({ error: 'token required' });
        return;
      }
      try {
        const user = await deps.authService.loginWithSso(token, requestContext(req));
        await rotateSession(req);
        const { permissions, csrfToken } = await attachSession(req, user, deps);
        const session = await deps.authService.createSession(user.id, req.sessionID, {
          ...requestContext(req),
          rotatedFrom: req.session.rotatedFrom as string | undefined
        });
        await deps.auditLogService.append({
          actorId: user?.id || 'unknown',
          action: 'login:sso',
          resource: user?.id || 'unknown',
          meta: { correlationId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'] }
        });
        await emitEvent({
          scope: 'auth',
          type: 'auth:login',
          actorId: user?.id,
          status: 'ok',
          payload: { method: 'sso' }
        });
        if (csrfToken) setCsrfCookie(res, csrfToken);
        res.json({ session, user, permissions, csrfToken });
      } catch (err) {
        await deps.auditLogService.append({
          actorId: 'unknown',
          action: 'login:sso_failed',
          resource: 'unknown',
          meta: { correlationId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'] }
        });
        await emitEvent({
          scope: 'auth',
          type: 'auth:login',
          status: 'error',
          payload: { method: 'sso', error: err instanceof Error ? err.message : 'login_failed' }
        });
        respondAuthError(res, err);
      }
    })
  );

  router.post(
    '/auth/logout',
    asyncHandler(async (req, res) => {
      const actorId = req.session.userId || 'unknown';
      if (req.sessionID) {
        await deps.authService.revokeSession(req.sessionID);
      }
      req.session.destroy(() => undefined);
      await deps.auditLogService.append({
        actorId,
        action: 'logout',
        resource: actorId,
        meta: { correlationId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'] }
      });
      await emitEvent({
        scope: 'auth',
        type: 'auth:logout',
        actorId,
        status: 'ok',
        payload: { userId: actorId }
      });
      res.json({ ok: true });
    })
  );

  router.post(
    '/api/auth/logout',
    asyncHandler(async (req, res) => {
      const actorId = req.session.userId || 'unknown';
      if (req.sessionID) {
        await deps.authService.revokeSession(req.sessionID);
      }
      req.session.destroy(() => undefined);
      await deps.auditLogService.append({
        actorId,
        action: 'logout',
        resource: actorId,
        meta: { correlationId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'] }
      });
      await emitEvent({
        scope: 'auth',
        type: 'auth:logout',
        actorId,
        status: 'ok',
        payload: { userId: actorId }
      });
      res.json({ ok: true });
    })
  );

  router.get(
    '/auth/session',
    asyncHandler(async (req, res) => {
      if (!req.session.userId) {
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }
      const user = await deps.userService.get(req.session.userId);
      const permissions = req.session.permissions || [];
      if (req.session.csrfToken) {
        setCsrfCookie(res, req.session.csrfToken as string);
      }
      res.json({ user, roles: req.session.roles || [], permissions, csrfToken: req.session.csrfToken || null });
    })
  );

  router.get(
    '/api/auth/me',
    asyncHandler(async (req, res) => {
      if (!req.session.userId) {
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }
      const user = await deps.userService.get(req.session.userId);
      if (!user) {
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }
      if (req.session.csrfToken) {
        setCsrfCookie(res, req.session.csrfToken as string);
      }
      res.json({ user: { id: user.id, email: user.email, username: user.username, role: user.roles?.[0] } });
    })
  );

  router.get(
    '/users',
    requirePermission('iam:read'),
    asyncHandler(async (_req, res) => {
      const users = await deps.userService.list();
      res.json(users);
    })
  );

  router.get(
    '/users/lookup',
    requirePermission('iam:read'),
    asyncHandler(async (req, res) => {
      const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
      const address = typeof req.query.address === 'string' ? req.query.address.trim().toLowerCase() : '';
      const users = await deps.userService.list();
      let matches = users;
      if (username) {
        matches = matches.filter((u) => (u.username || '').toLowerCase() === username.toLowerCase());
      }
      if (address) {
        matches = matches.filter((u) => (u.wallets || []).map((w) => w.toLowerCase()).includes(address));
      }
      res.json({ users: matches });
    })
  );

  router.get(
    '/identity/mappings',
    requirePermission('iam:read'),
    asyncHandler(async (_req, res) => {
      const users = await deps.userService.list();
      const mappings = users.flatMap((user) =>
        (user.wallets || []).map((walletAddress) => ({
          userId: user.id,
          username: user.username || null,
          email: user.email,
          walletAddress
        }))
      );
      res.json({ mappings });
    })
  );

  router.post(
    '/v1/wallet/link/challenge',
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = resolveWalletLinkUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }
      if (!allowWithinRate(`wallet-link-challenge:${req.ip}:${userId}`, 10, 60_000)) {
        res.status(429).json({ error: 'rate_limited' });
        return;
      }

      const body = (req.body || {}) as { walletAddress?: string; chainId?: string };
      const walletAddress = normalizeWalletAddress(String(body.walletAddress || ''));
      if (!walletAddress || !isAddress(walletAddress)) {
        res.status(400).json({ error: 'invalid_wallet_address' });
        return;
      }

      const user = await deps.userService.get(userId);
      if (!user) {
        res.status(404).json({ error: 'user_not_found' });
        return;
      }

      const challengeId = crypto.randomUUID();
      const nonce = crypto.randomBytes(16).toString('hex');
      const issuedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      const chainId = String(body.chainId || process.env.CHAIN_ID || '901');
      const domain = req.header('x-forwarded-host') || req.header('host') || 'ghostchain.cloud';
      const statement = [
        `GhostStack wallet ownership proof`,
        `Domain: ${domain}`,
        `Address: ${walletAddress}`,
        `ChainId: ${chainId}`,
        `IssuedAt: ${issuedAt}`,
        `Nonce: ${nonce}`
      ].join('\n');

      createChallenge({
        id: challengeId,
        userId,
        walletAddress,
        nonceHash: hashValue(nonce),
        statement,
        chainId,
        issuedAt,
        expiresAt
      });

      await deps.auditLogService.append({
        actorId: userId,
        action: 'wallet_link:challenge_issued',
        resource: challengeId,
        meta: { correlationId: req.correlationId, walletAddress, expiresAt, chainId }
      });

      res.json({ challengeId, nonce, statement, expiresAt });
    })
  );

  router.post(
    '/v1/wallet/link/verify',
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = resolveWalletLinkUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }
      if (!allowWithinRate(`wallet-link-verify:${req.ip}:${userId}`, 20, 60_000)) {
        res.status(429).json({ error: 'rate_limited' });
        return;
      }

      const body = (req.body || {}) as { challengeId?: string; walletAddress?: string; signature?: string };
      const challengeId = String(body.challengeId || '').trim();
      const walletAddress = normalizeWalletAddress(String(body.walletAddress || ''));
      const signature = String(body.signature || '').trim();
      if (!challengeId || !walletAddress || !signature) {
        res.status(400).json({ error: 'challengeId, walletAddress, signature required' });
        return;
      }
      if (!isAddress(walletAddress)) {
        res.status(400).json({ error: 'invalid_wallet_address' });
        return;
      }

      const challenge = getChallenge(challengeId);
      if (!challenge) {
        res.status(404).json({ error: 'challenge_not_found' });
        return;
      }
      if (challenge.userId !== userId) {
        res.status(403).json({ error: 'challenge_user_mismatch' });
        return;
      }
      if (challenge.usedAt) {
        res.status(409).json({ error: 'challenge_already_used' });
        return;
      }
      if (new Date(challenge.expiresAt).getTime() < Date.now()) {
        res.status(410).json({ error: 'challenge_expired' });
        return;
      }
      if (challenge.walletAddress !== walletAddress) {
        res.status(400).json({ error: 'wallet_address_mismatch' });
        return;
      }
      if (!challenge.statement.includes(`Nonce: `)) {
        res.status(400).json({ error: 'challenge_statement_invalid' });
        return;
      }
      const nonceLine = challenge.statement
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('Nonce: '));
      const nonceValue = nonceLine ? nonceLine.slice('Nonce: '.length).trim() : '';
      if (!nonceValue || hashValue(nonceValue) !== challenge.nonceHash) {
        res.status(400).json({ error: 'challenge_nonce_invalid' });
        return;
      }

      let recoveredAddress: string;
      try {
        recoveredAddress = normalizeWalletAddress(verifyMessage(challenge.statement, signature));
      } catch {
        res.status(400).json({ error: 'invalid_signature' });
        return;
      }
      if (recoveredAddress !== walletAddress) {
        res.status(400).json({ error: 'signature_address_mismatch' });
        return;
      }

      const user = await deps.userService.get(userId);
      if (!user) {
        res.status(404).json({ error: 'user_not_found' });
        return;
      }
      const nextWallets = Array.from(new Set([...(user.wallets || []), walletAddress]));
      const updated = await deps.userService.update(user.id, { wallets: nextWallets });

      const verifiedAt = new Date().toISOString();
      markChallengeUsed(challengeId, verifiedAt);
      writeWalletProof({
        id: crypto.randomUUID(),
        userId,
        walletAddress,
        challengeId,
        signature,
        verifiedAt,
        subject: String(req.header('x-ghost-subject') || ''),
        sessionId: req.sessionID
      });

      await deps.auditLogService.append({
        actorId: userId,
        action: 'wallet_link:verified',
        resource: challengeId,
        meta: { correlationId: req.correlationId, walletAddress }
      });
      await emitEvent({
        scope: 'identity',
        type: 'wallet:linked',
        actorId: userId,
        status: 'ok',
        payload: { walletAddress, challengeId, verifiedAt }
      });

      res.json({ user: updated, linked: walletAddress, challengeId, verifiedAt });
    })
  );

  // ─── GET /v1/wallet/link/proofs ─────────────────────────────────────────────
  // Returns the audit trail of verified wallet-link proofs for the authenticated
  // user. Requires session or OIDC auth (no admin permission needed — own data).
  router.get(
    '/v1/wallet/link/proofs',
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = resolveWalletLinkUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }
      if (!walletLinkDb) {
        res.json({ proofs: [] });
        return;
      }
      const rows = walletLinkDb
        .prepare(
          `select id, wallet_address, challenge_id, method, verified_at, subject, session_id
           from wallet_link_proofs
           where user_id = ?
           order by verified_at desc
           limit 100`
        )
        .all(userId) as Array<{
          id: string;
          wallet_address: string;
          challenge_id: string;
          method: string;
          verified_at: string;
          subject: string | null;
          session_id: string | null;
        }>;
      res.json({
        proofs: rows.map((r) => ({
          id: r.id,
          walletAddress: r.wallet_address,
          challengeId: r.challenge_id,
          method: r.method,
          verifiedAt: r.verified_at,
          subject: r.subject ?? null,
          sessionId: r.session_id ?? null
        }))
      });
    })
  );

  // ─── DELETE /v1/wallet/link ───────────────────────────────────────────────
  // Unlinks a wallet from the authenticated user. Writes an audit log entry and
  // emits a wallet:unlinked event.
  // Query: ?walletAddress=0x...
  router.delete(
    '/v1/wallet/link',
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = resolveWalletLinkUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }
      const walletAddress = normalizeWalletAddress(
        typeof req.query.walletAddress === 'string' ? req.query.walletAddress : ''
      );
      if (!walletAddress || !isAddress(walletAddress)) {
        res.status(400).json({ error: 'walletAddress query param required (0x...)' });
        return;
      }

      const user = await deps.userService.get(userId);
      if (!user) {
        res.status(404).json({ error: 'user_not_found' });
        return;
      }

      const existing = (user.wallets || []).map((w) => w.toLowerCase());
      if (!existing.includes(walletAddress)) {
        res.status(404).json({ error: 'wallet_not_linked' });
        return;
      }

      const nextWallets = (user.wallets || []).filter((w) => w.toLowerCase() !== walletAddress);
      const updated = await deps.userService.update(user.id, { wallets: nextWallets });

      await deps.auditLogService.append({
        actorId: userId,
        action: 'wallet_link:removed',
        resource: userId,
        meta: { correlationId: req.correlationId, walletAddress }
      });
      await emitEvent({
        scope: 'identity',
        type: 'wallet:unlinked',
        actorId: userId,
        status: 'ok',
        payload: { walletAddress, removedAt: new Date().toISOString() }
      });

      res.json({ user: updated, removed: walletAddress });
    })
  );

  router.post(
    '/identity/mappings/upsert',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      const body = (req.body || {}) as { userId?: string; username?: string; walletAddress?: string };
      const walletAddress = (body.walletAddress || '').trim().toLowerCase();
      const requestedUserId = (body.userId || '').trim();
      const requestedUsername = (body.username || '').trim();

      if (!walletAddress || !walletAddress.startsWith('0x')) {
        res.status(400).json({ error: 'walletAddress required (0x...)' });
        return;
      }
      if (!requestedUserId && !requestedUsername) {
        res.status(400).json({ error: 'userId or username required' });
        return;
      }

      const users = await deps.userService.list();
      const user = requestedUserId
        ? users.find((entry) => entry.id === requestedUserId)
        : users.find((entry) => (entry.username || '').toLowerCase() === requestedUsername.toLowerCase());

      if (!user) {
        res.status(404).json({ error: 'user_not_found' });
        return;
      }

      const nextWallets = Array.from(new Set([...(user.wallets || []), walletAddress]));
      const updated = await deps.userService.update(user.id, { wallets: nextWallets });
      await deps.auditLogService.append({
        actorId: req.session.userId || 'unknown',
        action: 'identity_mapping:upsert',
        resource: updated.id,
        meta: { correlationId: req.correlationId, walletAddress }
      });
      res.json({ user: updated, linked: walletAddress });
    })
  );

  router.delete(
    '/identity/mappings',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
      const walletAddress = typeof req.query.walletAddress === 'string' ? req.query.walletAddress.trim().toLowerCase() : '';

      if (!userId || !walletAddress) {
        res.status(400).json({ error: 'userId and walletAddress required' });
        return;
      }

      const user = await deps.userService.get(userId);
      if (!user) {
        res.status(404).json({ error: 'user_not_found' });
        return;
      }

      const nextWallets = (user.wallets || []).filter((wallet) => wallet.toLowerCase() !== walletAddress);
      const updated = await deps.userService.update(user.id, { wallets: nextWallets });
      await deps.auditLogService.append({
        actorId: req.session.userId || 'unknown',
        action: 'identity_mapping:remove',
        resource: updated.id,
        meta: { correlationId: req.correlationId, walletAddress }
      });
      res.json({ user: updated, removed: walletAddress });
    })
  );

  router.post(
    '/users',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      const created = await deps.userService.create(req.body);
      await deps.auditLogService.append({
        actorId: req.session.userId || 'unknown',
        action: 'user:create',
        resource: created.id,
        meta: { correlationId: req.correlationId }
      });
      res.status(201).json(created);
    })
  );

  router.patch(
    '/users/:id',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const updated = await deps.userService.update(userId, req.body);
      await deps.auditLogService.append({
        actorId: req.session.userId || 'unknown',
        action: 'user:update',
        resource: updated.id,
        meta: { correlationId: req.correlationId }
      });
      res.json(updated);
    })
  );

  router.get(
    '/roles',
    requirePermission('iam:read'),
    asyncHandler(async (_req, res) => {
      const roles = await deps.rbacService.listRoles();
      res.json(roles);
    })
  );

  router.post(
    '/roles',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      const role = await deps.rbacService.createRole(req.body);
      await deps.auditLogService.append({
        actorId: req.session.userId || 'unknown',
        action: 'role:create',
        resource: role.id,
        meta: { correlationId: req.correlationId }
      });
      res.status(201).json(role);
    })
  );

  router.patch(
    '/roles/:id',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      const roleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const role = await deps.rbacService.updateRole(roleId, req.body);
      await deps.auditLogService.append({
        actorId: req.session.userId || 'unknown',
        action: 'role:update',
        resource: role.id,
        meta: { correlationId: req.correlationId }
      });
      res.json(role);
    })
  );

  router.delete(
    '/roles/:id',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      const roleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await deps.rbacService.deleteRole(roleId);
      await deps.auditLogService.append({
        actorId: req.session.userId || 'unknown',
        action: 'role:delete',
        resource: roleId,
        meta: { correlationId: req.correlationId }
      });
      res.status(204).end();
    })
  );

  router.get(
    '/api-keys',
    requirePermission('iam:read'),
    asyncHandler(async (req, res) => {
      const rawUserId = req.query.userId;
      const userId =
        typeof rawUserId === 'string'
          ? rawUserId
          : Array.isArray(rawUserId) && typeof rawUserId[0] === 'string'
            ? rawUserId[0]
            : undefined;
      const list = await deps.apiKeyService.list(userId);
      res.json(list);
    })
  );

  router.post(
    '/api-keys',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      const { userId, name, scopes } = req.body as { userId: string; name: string; scopes: string[] };
      const key = await deps.apiKeyService.create(userId, name, scopes || []);
      await deps.auditLogService.append({
        actorId: req.session.userId || 'unknown',
        action: 'api_key:create',
        resource: key.id,
        meta: { correlationId: req.correlationId, userId, name, scopes }
      });
      res.status(201).json(key);
    })
  );

  router.delete(
    '/api-keys/:id',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      const apiKeyId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await deps.apiKeyService.revoke(apiKeyId);
      await deps.auditLogService.append({
        actorId: req.session.userId || 'unknown',
        action: 'api_key:revoke',
        resource: apiKeyId,
        meta: { correlationId: req.correlationId }
      });
      res.status(204).end();
    })
  );

  router.get(
    '/audit',
    requirePermission('iam:read'),
    asyncHandler(async (_req, res) => {
      const logs = await deps.auditLogService.list(50);
      res.json(logs);
    })
  );

  // ─── OIDC token exchange ─────────────────────────────────────────────────────
  // POST /auth/oidc/token
  // Accepts an OIDC access_token (already validated externally, e.g. in the SPA
  // after the authorization_code flow) and attaches the realm claim to the
  // server-side session, returning a session cookie + CSRF token.
  // The actual JWT signature verification happens in the global realmAuthMiddleware
  // (applied in server.ts) which runs before this route and populates
  // req.session.realmClaim. This handler only needs to confirm the claim is
  // present and build the session response.
  router.post(
    '/auth/oidc/token',
    asyncHandler(async (req, res) => {
      const { accessToken, realm } = (req.body || {}) as { accessToken?: string; realm?: string };
      if (!accessToken || typeof accessToken !== 'string') {
        res.status(400).json({ error: 'access_token_required' });
        return;
      }

      // Inject the token into the authorization header so the upstream
      // realmAuthMiddleware logic can be re-invoked synchronously via a
      // minimal inline path — or rely on the claim already populated by
      // the global middleware for this same request if the client sent the
      // Bearer header alongside the body.
      const existingClaim = req.session.realmClaim;
      if (!existingClaim) {
        // Token wasn't in the Authorization header; run inline validation.
        // Import lazily to avoid circular dep: middleware → router → middleware.
        const { validateBearerTokenForRouter } = await import('../../middleware/realm-auth.js');
        const claim = await validateBearerTokenForRouter(accessToken);
        if (!claim) {
          res.status(401).json({ error: 'invalid_or_expired_oidc_token' });
          return;
        }
        req.session.realmClaim = claim;
        req.session.oidcRealm = claim.realm;
        req.session.oidcAccessToken = accessToken;
      }

      const claim = req.session.realmClaim!;

      // Verify realm matches if caller specified one
      if (realm && claim.realm !== realm) {
        res.status(403).json({ error: 'realm_mismatch', expected: realm, actual: claim.realm });
        return;
      }

      // Attach a CSRF token if not already present
      if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomUUID();
      }

      const now = Date.now();
      req.session.lastSeenAt = now;
      // Use the JWT expiry for session TTL (capped to env SESSION_TTL_MS)
      const jwtTtlMs = claim.exp > 0 ? (claim.exp * 1000 - now) : 0;
      const maxTtl = env.SESSION_TTL_MS || 30 * 60 * 1000;
      req.session.expiresAt = now + Math.min(jwtTtlMs > 0 ? jwtTtlMs : maxTtl, maxTtl);

      await deps.auditLogService.append({
        actorId: claim.sub,
        action: 'auth:oidc_session',
        resource: claim.realm,
        meta: {
          correlationId: req.correlationId,
          sub: claim.sub,
          email: claim.email,
          realm: claim.realm,
          roles: claim.realmRoles,
        },
      }).catch(() => undefined);

      logAuthEvent('info', 'oidc_session_created', {
        sub: claim.sub,
        realm: claim.realm,
        ip: req.ip,
        ua: req.headers['user-agent'],
      });

      res.json({
        ok: true,
        user: {
          sub: claim.sub,
          email: claim.email,
          preferredUsername: claim.preferredUsername,
          realm: claim.realm,
          roles: claim.realmRoles,
          clientRoles: claim.clientRoles,
        },
        csrfToken: req.session.csrfToken,
      });
    })
  );

  // ─── OIDC discovery: GET /auth/oidc/realms ──────────────────────────────────
  // Returns the configured issuer URLs and client IDs for each realm so the SPA
  // can build authorization URLs without hard-coding Keycloak details.
  // This endpoint is intentionally unauthenticated.
  router.get(
    '/auth/oidc/realms',
    asyncHandler(async (_req, res) => {
      const realmMeta = (realm: string, issuerEnv?: string, clientId?: string) => {
        const base = (env.KEYCLOAK_BASE_URL ?? '').replace(/\/$/, '');
        let realmName: string;
        switch (realm) {
          case 'users':     realmName = env.KEYCLOAK_REALM_USERS;     break;
          case 'employees': realmName = env.KEYCLOAK_REALM_EMPLOYEES; break;
          case 'admins':    realmName = env.KEYCLOAK_REALM_ADMINS;    break;
          default:          realmName = realm;
        }
        const issuerUrl = issuerEnv ?? (base ? `${base}/realms/${realmName}` : null);
        return {
          realm,
          issuerUrl,
          clientId: clientId ?? null,
          configured: Boolean(issuerUrl && clientId),
        };
      };

      res.json({
        ok: true,
        realms: [
          realmMeta('users',     env.OIDC_ISSUER_USERS,     env.OIDC_CLIENT_ID_USERS),
          realmMeta('employees', env.OIDC_ISSUER_EMPLOYEES, env.OIDC_CLIENT_ID_EMPLOYEES),
          realmMeta('admins',    env.OIDC_ISSUER_ADMINS,    env.OIDC_CLIENT_ID_ADMINS),
        ],
        oidcEnabled: Boolean(env.KEYCLOAK_BASE_URL || env.OIDC_ISSUER_USERS),
      });
    })
  );

  // ─── OIDC login initiation: GET /auth/oidc/login ────────────────────────────
  // Starts the PKCE authorization-code flow (BFF-as-client pattern).
  //
  // Query params:
  //   realm       — required: 'users' | 'employees' | 'admins'
  //   redirect_to — optional post-login destination (must be same-origin or
  //                 within OIDC_ALLOWED_REDIRECT_ORIGINS); defaults to '/'
  //
  // Returns JSON { authorizeUrl } so SPA can perform the redirect itself
  // (keeps API stateless from the HTTP method perspective):
  //   { ok: true, authorizeUrl: "https://keycloak.../auth?..." }
  //
  // Stores PKCE code_verifier + state nonce in the server-side session so the
  // callback handler can validate and exchange the auth code securely.
  router.get(
    '/auth/oidc/login',
    asyncHandler(async (req, res) => {
      const qs = req.query as Record<string, string>;
      const realm = (qs.realm ?? '').trim() as 'users' | 'employees' | 'admins';
      const redirectTo = (qs.redirect_to ?? '/').trim();

      if (!['users', 'employees', 'admins'].includes(realm)) {
        res.status(400).json({ error: 'invalid_realm', valid: ['users', 'employees', 'admins'] });
        return;
      }

      // ── Open-redirect guard ─────────────────────────────────────────────
      const allowedOrigins = (env.OIDC_ALLOWED_REDIRECT_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      // Also accept relative paths (start with /) as safe same-origin redirects
      const isRelative = redirectTo.startsWith('/') && !redirectTo.startsWith('//');
      if (!isRelative) {
        let originOk = false;
        try {
          const parsed = new URL(redirectTo);
          originOk = allowedOrigins.some((o) => parsed.origin === o || parsed.href.startsWith(o));
        } catch {
          originOk = false;
        }
        if (!originOk) {
          res.status(400).json({ error: 'redirect_not_allowed' });
          return;
        }
      }

      // ── Resolve issuer / client config ─────────────────────────────────
      const base = (env.KEYCLOAK_BASE_URL ?? '').replace(/\/$/, '');
      let issuerUrl: string | undefined;
      let clientId:  string | undefined;
      let realmName: string;
      switch (realm) {
        case 'users':
          issuerUrl = env.OIDC_ISSUER_USERS     ?? (base ? `${base}/realms/${env.KEYCLOAK_REALM_USERS}`     : undefined);
          clientId  = env.OIDC_CLIENT_ID_USERS;
          realmName = env.KEYCLOAK_REALM_USERS;
          break;
        case 'employees':
          issuerUrl = env.OIDC_ISSUER_EMPLOYEES ?? (base ? `${base}/realms/${env.KEYCLOAK_REALM_EMPLOYEES}` : undefined);
          clientId  = env.OIDC_CLIENT_ID_EMPLOYEES;
          realmName = env.KEYCLOAK_REALM_EMPLOYEES;
          break;
        case 'admins':
          issuerUrl = env.OIDC_ISSUER_ADMINS    ?? (base ? `${base}/realms/${env.KEYCLOAK_REALM_ADMINS}`    : undefined);
          clientId  = env.OIDC_CLIENT_ID_ADMINS;
          realmName = env.KEYCLOAK_REALM_ADMINS;
          break;
      }
      if (!issuerUrl) {
        res.status(503).json({ error: 'oidc_not_configured', realm });
        return;
      }
      const redirectUri = env.OIDC_REDIRECT_URI;
      if (!redirectUri) {
        res.status(503).json({ error: 'oidc_redirect_uri_not_configured' });
        return;
      }
      void realmName; // used above for URL derivation; eslint appeasement

      // ── PKCE: generate code_verifier + code_challenge ──────────────────
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      // ── State: opaque nonce stored in session (CSRF protection) ────────
      const state = crypto.randomUUID();

      // Persist into session — both will be consumed exactly once in /callback
      req.session.oidcPkceVerifier = codeVerifier;
      req.session.oidcState        = state;
      req.session.oidcRealm        = realm;
      req.session.oidcRedirectTo   = redirectTo;

      // ── Build Keycloak authorization URL ───────────────────────────────
      const authEndpoint = `${issuerUrl}/protocol/openid-connect/auth`;
      const params = new URLSearchParams({
        response_type:         'code',
        client_id:             clientId!,
        redirect_uri:          redirectUri,
        scope:                 'openid email profile',
        state,
        code_challenge:        codeChallenge,
        code_challenge_method: 'S256',
      });
      const authorizeUrl = `${authEndpoint}?${params.toString()}`;

      logAuthEvent('info', 'oidc_login_initiated', {
        realm,
        ip:  req.ip,
        ua:  req.headers['user-agent'],
        cid: req.correlationId,
      });

      res.json({ ok: true, authorizeUrl, realm });
    })
  );

  // ─── OIDC callback: GET /auth/oidc/callback ─────────────────────────────────
  // Receives the authorization code from Keycloak, exchanges it for tokens
  // (using PKCE), validates the access token, and creates a server-side session.
  //
  // Query params (set by Keycloak):
  //   code  — authorization code
  //   state — must match the value stored in session (CSRF guard)
  //
  // On success: redirects to the post-login destination stored in session, or
  // returns JSON if the Accept header doesn't include text/html.
  router.get(
    '/auth/oidc/callback',
    asyncHandler(async (req, res) => {
      const qs = req.query as Record<string, string>;
      const code  = (qs.code  ?? '').trim();
      const state = (qs.state ?? '').trim();

      if (!code || !state) {
        res.status(400).json({ error: 'missing_code_or_state' });
        return;
      }

      // ── CSRF: validate state matches the one stored in session ─────────
      const expectedState  = req.session.oidcState;
      const codeVerifier   = req.session.oidcPkceVerifier;
      const realm          = req.session.oidcRealm as 'users' | 'employees' | 'admins' | undefined;
      const redirectTo     = req.session.oidcRedirectTo ?? '/';

      // Consume state immediately to prevent replay
      delete req.session.oidcState;
      delete req.session.oidcPkceVerifier;
      req.session.oidcRedirectTo = undefined;

      if (!expectedState || !codeVerifier || !realm) {
        res.status(400).json({ error: 'invalid_session_state' });
        return;
      }
      if (!crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) {
        res.status(400).json({ error: 'state_mismatch' });
        return;
      }

      // ── Resolve issuer / client for token exchange ─────────────────────
      const base = (env.KEYCLOAK_BASE_URL ?? '').replace(/\/$/, '');
      let issuerUrl: string | undefined;
      let clientId:  string | undefined;
      switch (realm) {
        case 'users':
          issuerUrl = env.OIDC_ISSUER_USERS     ?? (base ? `${base}/realms/${env.KEYCLOAK_REALM_USERS}`     : undefined);
          clientId  = env.OIDC_CLIENT_ID_USERS;
          break;
        case 'employees':
          issuerUrl = env.OIDC_ISSUER_EMPLOYEES ?? (base ? `${base}/realms/${env.KEYCLOAK_REALM_EMPLOYEES}` : undefined);
          clientId  = env.OIDC_CLIENT_ID_EMPLOYEES;
          break;
        case 'admins':
          issuerUrl = env.OIDC_ISSUER_ADMINS    ?? (base ? `${base}/realms/${env.KEYCLOAK_REALM_ADMINS}`    : undefined);
          clientId  = env.OIDC_CLIENT_ID_ADMINS;
          break;
      }
      if (!issuerUrl || !clientId) {
        res.status(503).json({ error: 'oidc_not_configured', realm });
        return;
      }
      const redirectUri = env.OIDC_REDIRECT_URI;
      if (!redirectUri) {
        res.status(503).json({ error: 'oidc_redirect_uri_not_configured' });
        return;
      }

      // ── Exchange auth code for tokens ──────────────────────────────────
      const tokenEndpoint = `${issuerUrl}/protocol/openid-connect/token`;
      const body = new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     clientId,
        redirect_uri:  redirectUri,
        code,
        code_verifier: codeVerifier,
      });

      let accessToken: string;
      try {
        const tokenRes = await fetch(tokenEndpoint, {
          method:  'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body:    body.toString(),
          signal:  AbortSignal.timeout(10_000),
        });
        if (!tokenRes.ok) {
          const errBody = await tokenRes.text().catch(() => '');
          logAuthEvent('warn', 'oidc_token_exchange_failed', {
            realm, status: tokenRes.status, body: errBody, cid: req.correlationId,
          });
          res.status(502).json({ error: 'token_exchange_failed' });
          return;
        }
        const tokenData = (await tokenRes.json()) as Record<string, unknown>;
        if (typeof tokenData['access_token'] !== 'string') {
          res.status(502).json({ error: 'unexpected_token_response' });
          return;
        }
        accessToken = tokenData['access_token'];
      } catch (err) {
        logAuthEvent('error', 'oidc_token_exchange_error', {
          realm, err: err instanceof Error ? err.message : String(err), cid: req.correlationId,
        });
        res.status(502).json({ error: 'token_exchange_error' });
        return;
      }

      // ── Validate token and build realm claim ───────────────────────────
      const { validateBearerTokenForRouter } = await import('../../middleware/realm-auth.js');
      const claim = await validateBearerTokenForRouter(accessToken);
      if (!claim) {
        res.status(401).json({ error: 'invalid_or_expired_oidc_token' });
        return;
      }
      if (claim.realm !== realm) {
        res.status(403).json({ error: 'realm_mismatch', expected: realm, actual: claim.realm });
        return;
      }

      // ── Persist claim in session ───────────────────────────────────────
      req.session.realmClaim      = claim;
      req.session.oidcRealm       = claim.realm;
      req.session.oidcAccessToken = accessToken;
      if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomUUID();
      }
      const now = Date.now();
      req.session.lastSeenAt = now;
      const jwtTtlMs = claim.exp > 0 ? (claim.exp * 1000 - now) : 0;
      const maxTtl   = env.SESSION_TTL_MS || 30 * 60 * 1000;
      req.session.expiresAt = now + Math.min(jwtTtlMs > 0 ? jwtTtlMs : maxTtl, maxTtl);

      await deps.auditLogService.append({
        actorId: claim.sub,
        action:  'auth:oidc_callback_session',
        resource: claim.realm,
        meta: {
          correlationId: req.correlationId,
          sub:   claim.sub,
          email: claim.email,
          realm: claim.realm,
          roles: claim.realmRoles,
        },
      }).catch(() => undefined);

      logAuthEvent('info', 'oidc_callback_session_created', {
        sub:   claim.sub,
        realm: claim.realm,
        ip:    req.ip,
        ua:    req.headers['user-agent'],
        cid:   req.correlationId,
      });

      // ── Respond: redirect for browsers, JSON for API clients ──────────
      const wantsHtml = (req.headers.accept ?? '').includes('text/html');
      if (wantsHtml) {
        res.redirect(302, redirectTo);
      } else {
        res.json({
          ok: true,
          user: {
            sub:               claim.sub,
            email:             claim.email,
            preferredUsername: claim.preferredUsername,
            realm:             claim.realm,
            roles:             claim.realmRoles,
            clientRoles:       claim.clientRoles,
          },
          csrfToken:  req.session.csrfToken,
          redirectTo,
        });
      }
    })
  );

  return router;
};
