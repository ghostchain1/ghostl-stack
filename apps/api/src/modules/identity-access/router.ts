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
import type { User } from '../../../../../packages/types';
import type { WalletService } from '../../services/wallet-store';
import type { GhostWalletService } from '../../services/ghostwallet';
import { env } from '../../config/env';
import { emitEvent } from '../../lib/events';

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

  return router;
};
