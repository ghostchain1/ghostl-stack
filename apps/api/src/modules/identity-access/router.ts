import { NextFunction, Request, Response, Router } from 'express';
import { randomBytes } from 'crypto';
import type {
  ApiKeyService,
  AuthService,
  AuditLogService,
  RBACService,
  UserService
} from './services';
import { requirePermission } from '../../lib/rbac';
import type { User } from '../../../../../packages/types';

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
}

const attachSession = async (req: Request, user: User | null, deps: IdentityAccessDeps) => {
  if (!user) return { permissions: [] as string[] };
  const permissions = await deps.rbacService.getUserPermissions(user);
  req.session.userId = user.id;
  req.session.roles = user.roles;
  req.session.permissions = permissions;
  const ttlMs = 30 * 60 * 1000;
  const now = Date.now();
  req.session.expiresAt = now + ttlMs;
  req.session.lastSeenAt = now;
  return { permissions };
};

export const buildIdentityAccessRouter = (deps: IdentityAccessDeps) => {
  const router = Router();

  router.get(
    '/auth/nonce',
    asyncHandler(async (req, res) => {
      const nonce = randomBytes(16).toString('hex');
      req.session.nonce = nonce;
      req.session.nonceCreatedAt = Date.now();
      res.json({ nonce });
    })
  );

  router.post(
    '/auth/login/wallet',
    asyncHandler(async (req, res) => {
      const { message, signature, hardwareProof } = req.body as { message?: string; signature?: string; hardwareProof?: string };
      if (!message || !signature) {
        res.status(400).json({ error: 'message and signature required' });
        return;
      }
      if (!req.session.nonce || !req.session.nonceCreatedAt || Date.now() - req.session.nonceCreatedAt > 5 * 60 * 1000) {
        res.status(400).json({ error: 'nonce_required_or_expired' });
        return;
      }
      if (process.env.HARDWARE_WALLET_REQUIRED === 'true' && !hardwareProof) {
        res.status(403).json({ error: 'hardware_wallet_required' });
        return;
      }
      const session = await deps.authService.loginWithWallet(message, signature, req.session.nonce);
      req.session.nonce = undefined;
      req.session.nonceCreatedAt = undefined;
      const user = await deps.userService.get(session.userId);
      const { permissions } = await attachSession(req, user, deps);
      await deps.auditLogService.append({
        actorId: user?.id || 'unknown',
        action: 'login:wallet',
        resource: user?.id || 'unknown',
        meta: { correlationId: req.correlationId, hardwareWallet: process.env.HARDWARE_WALLET_REQUIRED === 'true' }
      });
      res.json({ session, user, permissions, hardwareRequired: process.env.HARDWARE_WALLET_REQUIRED === 'true' });
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
      const session = await deps.authService.loginWithSso(token);
      const user = await deps.userService.get(session.userId);
      const { permissions } = await attachSession(req, user, deps);
      await deps.auditLogService.append({
        actorId: user?.id || 'unknown',
        action: 'login:sso',
        resource: user?.id || 'unknown',
        meta: { correlationId: req.correlationId }
      });
      res.json({ session, user, permissions });
    })
  );

  router.post(
    '/auth/logout',
    asyncHandler(async (req, res) => {
      const actorId = req.session.userId || 'unknown';
      req.session.destroy(() => undefined);
      await deps.auditLogService.append({
        actorId,
        action: 'logout',
        resource: actorId,
        meta: { correlationId: req.correlationId }
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
      res.json({ user, roles: req.session.roles || [], permissions });
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
      const updated = await deps.userService.update(req.params.id, req.body);
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
      const role = await deps.rbacService.updateRole(req.params.id, req.body);
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
      await deps.rbacService.deleteRole(req.params.id);
      await deps.auditLogService.append({
        actorId: req.session.userId || 'unknown',
        action: 'role:delete',
        resource: req.params.id,
        meta: { correlationId: req.correlationId }
      });
      res.status(204).end();
    })
  );

  router.get(
    '/api-keys',
    requirePermission('iam:read'),
    asyncHandler(async (req, res) => {
      const list = await deps.apiKeyService.list(req.query.userId as string | undefined);
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
      await deps.apiKeyService.revoke(req.params.id);
      await deps.auditLogService.append({
        actorId: req.session.userId || 'unknown',
        action: 'api_key:revoke',
        resource: req.params.id,
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
