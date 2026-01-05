"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIdentityAccessRouter = void 0;
const express_1 = require("express");
const crypto_1 = require("crypto");
const rbac_1 = require("../../lib/rbac");
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const attachSession = async (req, user, deps) => {
    if (!user)
        return { permissions: [] };
    const permissions = await deps.rbacService.getUserPermissions(user);
    req.session.userId = user.id;
    req.session.roles = user.roles;
    req.session.permissions = permissions;
    return { permissions };
};
const buildIdentityAccessRouter = (deps) => {
    const router = (0, express_1.Router)();
    router.get('/auth/nonce', asyncHandler(async (req, res) => {
        const nonce = (0, crypto_1.randomBytes)(16).toString('hex');
        req.session.nonce = nonce;
        req.session.nonceCreatedAt = Date.now();
        res.json({ nonce });
    }));
    router.post('/auth/login/wallet', asyncHandler(async (req, res) => {
        const { message, signature } = req.body;
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
    }));
    router.post('/auth/login/sso', asyncHandler(async (req, res) => {
        const { token } = req.body;
        if (!token) {
            res.status(400).json({ error: 'token required' });
            return;
        }
        const session = await deps.authService.loginWithSso(token);
        const user = await deps.userService.get(session.userId);
        const { permissions } = await attachSession(req, user, deps);
        res.json({ session, user, permissions });
    }));
    router.post('/auth/logout', asyncHandler(async (req, res) => {
        req.session.destroy(() => undefined);
        res.json({ ok: true });
    }));
    router.get('/auth/session', asyncHandler(async (req, res) => {
        if (!req.session.userId) {
            res.status(401).json({ error: 'unauthenticated' });
            return;
        }
        const user = await deps.userService.get(req.session.userId);
        const permissions = req.session.permissions || [];
        res.json({ user, roles: req.session.roles || [], permissions });
    }));
    router.get('/users', (0, rbac_1.requirePermission)('iam:read'), asyncHandler(async (_req, res) => {
        const users = await deps.userService.list();
        res.json(users);
    }));
    router.post('/users', (0, rbac_1.requirePermission)('iam:write'), asyncHandler(async (req, res) => {
        const created = await deps.userService.create(req.body);
        res.status(201).json(created);
    }));
    router.patch('/users/:id', (0, rbac_1.requirePermission)('iam:write'), asyncHandler(async (req, res) => {
        const updated = await deps.userService.update(req.params.id, req.body);
        res.json(updated);
    }));
    router.get('/roles', (0, rbac_1.requirePermission)('iam:read'), asyncHandler(async (_req, res) => {
        const roles = await deps.rbacService.listRoles();
        res.json(roles);
    }));
    router.post('/roles', (0, rbac_1.requirePermission)('iam:write'), asyncHandler(async (req, res) => {
        const role = await deps.rbacService.createRole(req.body);
        res.status(201).json(role);
    }));
    router.patch('/roles/:id', (0, rbac_1.requirePermission)('iam:write'), asyncHandler(async (req, res) => {
        const role = await deps.rbacService.updateRole(req.params.id, req.body);
        res.json(role);
    }));
    router.delete('/roles/:id', (0, rbac_1.requirePermission)('iam:write'), asyncHandler(async (req, res) => {
        await deps.rbacService.deleteRole(req.params.id);
        res.status(204).end();
    }));
    router.get('/api-keys', (0, rbac_1.requirePermission)('iam:read'), asyncHandler(async (req, res) => {
        const list = await deps.apiKeyService.list(req.query.userId);
        res.json(list);
    }));
    router.post('/api-keys', (0, rbac_1.requirePermission)('iam:write'), asyncHandler(async (req, res) => {
        const { userId, name, scopes } = req.body;
        const key = await deps.apiKeyService.create(userId, name, scopes || []);
        res.status(201).json(key);
    }));
    router.delete('/api-keys/:id', (0, rbac_1.requirePermission)('iam:write'), asyncHandler(async (req, res) => {
        await deps.apiKeyService.revoke(req.params.id);
        res.status(204).end();
    }));
    router.get('/audit', (0, rbac_1.requirePermission)('iam:read'), asyncHandler(async (_req, res) => {
        const logs = await deps.auditLogService.list(50);
        res.json(logs);
    }));
    return router;
};
exports.buildIdentityAccessRouter = buildIdentityAccessRouter;
