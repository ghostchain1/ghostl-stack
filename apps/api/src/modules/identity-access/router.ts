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
      const { message, signature } = req.body as { message?: string; signature?: string };
      if (!message || !signature) {
        res.status(400).json({ error: 'message and signature required' });
        return;
      }
      if (!req.session.nonce || !req.session.nonceCreatedAt || Date.now() - req.session.nonceCreatedAt > 5 * 60 * 1000) {
        res.status(400).json({ error: 'nonce_required_or_expired' });
        return;
      }
      const session = await deps.authService.loginWithWallet(message, signature, req.session.nonce);
      req.session.nonce = undefined;
      req.session.nonceCreatedAt = undefined;
      const user = await deps.userService.get(session.userId);
      const { permissions } = await attachSession(req, user, deps);
      res.json({ session, user, permissions });
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
      res.json({ session, user, permissions });
    })
  );

  router.post(
    '/auth/logout',
    asyncHandler(async (req, res) => {
      req.session.destroy(() => undefined);
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
      res.status(201).json(created);
    })
  );

  router.patch(
    '/users/:id',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      const updated = await deps.userService.update(req.params.id, req.body);
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
      res.status(201).json(role);
    })
  );

  router.patch(
    '/roles/:id',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      const role = await deps.rbacService.updateRole(req.params.id, req.body);
      res.json(role);
    })
  );

  router.delete(
    '/roles/:id',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      await deps.rbacService.deleteRole(req.params.id);
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
      res.status(201).json(key);
    })
  );

  router.delete(
    '/api-keys/:id',
    requirePermission('iam:write'),
    asyncHandler(async (req, res) => {
      await deps.apiKeyService.revoke(req.params.id);
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
