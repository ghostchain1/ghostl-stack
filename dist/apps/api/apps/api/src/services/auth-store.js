"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPersistentIdentityServices = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const siwe_1 = require("siwe");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const defaultRoles = [
    { id: 'viewer', name: 'Viewer', permissions: ['iam:read'] },
    {
        id: 'admin',
        name: 'Protocol Admin',
        permissions: ['iam:read', 'iam:write', 'feature-flags:write', 'nodes:write', 'chain:write', 'guard:write']
    }
];
const defaultUsers = [
    { id: 'user-1', email: 'admin@ghostl.dev', wallets: [], roles: ['admin'] }
];
const loadStore = async () => {
    const filePath = process.env.AUTH_STORE_PATH || path_1.default.join(process.cwd(), 'data', 'iam.json');
    try {
        const raw = await fs_1.promises.readFile(filePath, 'utf-8');
        return JSON.parse(raw);
    }
    catch (err) {
        await fs_1.promises.mkdir(path_1.default.dirname(filePath), { recursive: true });
        const initial = { users: defaultUsers, roles: defaultRoles, apiKeys: [], sessions: [], audit: [] };
        await fs_1.promises.writeFile(filePath, JSON.stringify(initial, null, 2));
        return initial;
    }
};
const saveStore = async (store) => {
    const filePath = process.env.AUTH_STORE_PATH || path_1.default.join(process.cwd(), 'data', 'iam.json');
    await fs_1.promises.mkdir(path_1.default.dirname(filePath), { recursive: true });
    await fs_1.promises.writeFile(filePath, JSON.stringify(store, null, 2));
};
const createPersistentIdentityServices = async () => {
    let store = await loadStore();
    const persist = async () => saveStore(store);
    const rbacService = {
        async listRoles() {
            return store.roles;
        },
        async createRole(input) {
            const role = { id: (0, crypto_1.randomUUID)(), ...input };
            store.roles.push(role);
            await persist();
            return role;
        },
        async updateRole(id, input) {
            const role = store.roles.find((r) => r.id === id);
            if (!role)
                throw new Error('role not found');
            Object.assign(role, input);
            await persist();
            return role;
        },
        async deleteRole(id) {
            store.roles = store.roles.filter((r) => r.id !== id);
            await persist();
        },
        async getUserPermissions(user) {
            const permissions = user.roles.flatMap((roleId) => store.roles.find((r) => r.id === roleId)?.permissions || []);
            return Array.from(new Set(permissions));
        }
    };
    const userService = {
        async list() {
            return store.users;
        },
        async get(id) {
            return store.users.find((u) => u.id === id) || null;
        },
        async create(input) {
            const created = { id: (0, crypto_1.randomUUID)(), ...input };
            store.users.push(created);
            await persist();
            return created;
        },
        async update(id, input) {
            const user = store.users.find((u) => u.id === id);
            if (!user)
                throw new Error('user not found');
            Object.assign(user, input);
            await persist();
            return user;
        }
    };
    const apiKeyService = {
        async list(userId) {
            if (!userId)
                return store.apiKeys;
            return store.apiKeys.filter((k) => k.userId === userId);
        },
        async create(userId, name, scopes) {
            const key = { id: (0, crypto_1.randomUUID)(), name, scopes, userId, lastUsedAt: undefined };
            store.apiKeys.push(key);
            await persist();
            return key;
        },
        async revoke(id) {
            store.apiKeys = store.apiKeys.filter((k) => k.id !== id);
            await persist();
        }
    };
    const auditLogService = {
        async append(entry) {
            const record = { id: (0, crypto_1.randomUUID)(), createdAt: new Date().toISOString(), ...entry };
            store.audit.push(record);
            await persist();
            return record;
        },
        async list(limit = 50) {
            return store.audit.slice(-limit).reverse();
        }
    };
    const issueSession = (userId) => {
        const session = { id: (0, crypto_1.randomUUID)(), userId, createdAt: new Date().toISOString(), ip: '127.0.0.1' };
        store.sessions.push(session);
        return session;
    };
    const authService = {
        async loginWithWallet(message, signature, nonce) {
            const address = await verifySiwe(message, signature, nonce);
            if (!address)
                throw new Error('invalid wallet login');
            const existing = store.users.find((u) => u.wallets.includes(address));
            const user = existing ||
                (await userService.create({
                    email: `${address.toLowerCase()}@wallet`,
                    wallets: [address],
                    roles: ['viewer']
                }));
            const session = issueSession(user.id);
            await persist();
            return session;
        },
        async loginWithSso(token) {
            const secret = process.env.SSO_JWT_SECRET;
            if (!secret)
                throw new Error('SSO_JWT_SECRET not configured');
            const payload = jsonwebtoken_1.default.verify(token, secret);
            const email = payload.email || payload.sub || 'sso-user';
            let user = store.users.find((u) => u.email === email);
            if (!user) {
                user = await userService.create({
                    email,
                    wallets: payload.wallets || [],
                    roles: payload.roles && payload.roles.length ? payload.roles : ['viewer']
                });
            }
            const session = issueSession(user.id);
            await persist();
            return session;
        },
        async getSession(sessionId) {
            return store.sessions.find((s) => s.id === sessionId) || null;
        },
        async revokeSession(sessionId) {
            store.sessions = store.sessions.filter((s) => s.id !== sessionId);
            await persist();
        }
    };
    return { rbacService, userService, apiKeyService, auditLogService, authService };
};
exports.createPersistentIdentityServices = createPersistentIdentityServices;
const verifySiwe = async (message, signature, nonce) => {
    try {
        const siwe = new siwe_1.SiweMessage(message);
        const fields = await siwe.verify({ signature, nonce });
        return fields.data.address;
    }
    catch {
        return null;
    }
};
