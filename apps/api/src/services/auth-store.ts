import { promises as fs } from 'fs';
import path from 'path';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import jwt from 'jsonwebtoken';
import type { ApiKey, Role, Session, User } from '@ghostl/types';
import type {
  ApiKeyService,
  AuditLogEntry,
  AuditLogService,
  AuthService,
  RBACService,
  UserService
} from '../modules/identity-access/services';

const defaultRoles: Role[] = [
  {
    id: 'viewer',
    name: 'Viewer',
    permissions: [
      'iam:read',
      'chain:read',
      'nodes:read',
      'observability:read',
      'bridge:read',
      'treasury:read',
      'contracts:read',
      'devops:read',
      'governance:read',
      'validator:read',
      'ai:read',
      'wallets:read',
      'wallets:write'
    ]
  },
  {
    id: 'admin',
    name: 'Protocol Admin',
    permissions: [
      'iam:read',
      'iam:write',
      'feature-flags:write',
      'nodes:write',
      'chain:write',
      'guard:write',
      'observability:write',
      'bridge:write',
      'treasury:write',
      'contracts:write',
      'devops:write',
      'governance:write',
      'validator:write',
      'ai:write',
      'wallets:read',
      'wallets:write'
    ]
  }
];

const defaultUsers: User[] = [
  { id: 'user-1', email: 'admin@ghostl.dev', wallets: [], roles: ['admin'] }
];

const scrypt = promisify(scryptCallback);

interface StoreShape {
  users: User[];
  roles: Role[];
  apiKeys: (ApiKey & { userId: string; secret: string })[];
  sessions: Session[];
  audit: AuditLogEntry[];
  credentials: Record<string, { salt: string; hash: string; updatedAt: string }>;
}

const loadStore = async (): Promise<StoreShape> => {
  const filePath = process.env.AUTH_STORE_PATH || path.join(process.cwd(), 'data', 'iam.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as StoreShape;
  } catch (_err) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const initial: StoreShape = {
      users: defaultUsers,
      roles: defaultRoles,
      apiKeys: [],
      sessions: [],
      audit: [],
      credentials: {}
    };
    await fs.writeFile(filePath, JSON.stringify(initial, null, 2));
    return initial;
  }
};

const saveStore = async (store: StoreShape) => {
  const filePath = process.env.AUTH_STORE_PATH || path.join(process.cwd(), 'data', 'iam.json');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2));
};

const hashPassword = async (password: string, salt?: string) => {
  const actualSalt = salt || randomBytes(16).toString('base64');
  const derived = (await scrypt(password, actualSalt, 32)) as Buffer;
  return { salt: actualSalt, hash: derived.toString('base64') };
};

const verifyPassword = async (password: string, credential: { salt: string; hash: string }) => {
  const derived = (await scrypt(password, credential.salt, 32)) as Buffer;
  const stored = Buffer.from(credential.hash, 'base64');
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(stored, derived);
};

export const createPersistentIdentityServices = async () => {
  const store = await loadStore();
  if (!store.credentials) {
    store.credentials = {};
  }
  const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@ghostl.dev';
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (bootstrapPassword) {
    let admin = store.users.find((u) => u.email === bootstrapEmail);
    if (!admin) {
      admin = { id: randomUUID(), email: bootstrapEmail, wallets: [], roles: ['admin'] };
      store.users.push(admin);
    } else if (!admin.roles.includes('admin')) {
      admin.roles = Array.from(new Set([...admin.roles, 'admin']));
    }
    const cred = await hashPassword(bootstrapPassword);
    store.credentials[admin.id] = { ...cred, updatedAt: new Date().toISOString() };
    await saveStore(store);
  }

  const persist = async () => saveStore(store);

  const rbacService: RBACService = {
    async listRoles() {
      return store.roles;
    },
    async createRole(input) {
      const role: Role = { id: randomUUID(), ...input };
      store.roles.push(role);
      await persist();
      return role;
    },
    async updateRole(id, input) {
      const role = store.roles.find((r) => r.id === id);
      if (!role) throw new Error('role not found');
      Object.assign(role, input);
      await persist();
      return role;
    },
    async deleteRole(id) {
      store.roles = store.roles.filter((r) => r.id !== id);
      await persist();
    },
    async getUserPermissions(user: User) {
      const permissions = user.roles.flatMap((roleId) => store.roles.find((r) => r.id === roleId)?.permissions || []);
      return Array.from(new Set(permissions));
    }
  };

  const userService: UserService = {
    async list() {
      return store.users;
    },
    async get(id: string) {
      return store.users.find((u) => u.id === id) || null;
    },
    async create(input) {
      const created: User = { id: randomUUID(), ...input };
      store.users.push(created);
      await persist();
      return created;
    },
    async update(id, input) {
      const user = store.users.find((u) => u.id === id);
      if (!user) throw new Error('user not found');
      Object.assign(user, input);
      await persist();
      return user;
    }
  };

  const apiKeyService: ApiKeyService = {
    async list(userId?: string) {
      const keys = userId ? store.apiKeys.filter((k) => k.userId === userId) : store.apiKeys;
      return keys.map(({ secret: _secret, ...rest }) => rest);
    },
    async create(userId: string, name: string, scopes: string[]) {
      const secret = randomUUID();
      const hashed = await hashSecret(secret);
      const key: ApiKey & { userId: string; secret: string } = {
        id: randomUUID(),
        name,
        scopes,
        userId,
        lastUsedAt: undefined,
        secret: hashed
      };
      store.apiKeys.push(key);
      await persist();
      await auditLogService.append({
        actorId: userId,
        action: 'api_key:create',
        resource: key.id,
        meta: { name, scopes }
      });
      const { secret: _hashedSecret, ...rest } = key;
      return { ...rest, secret };
    },
    async revoke(id: string) {
      store.apiKeys = store.apiKeys.filter((k) => k.id !== id);
      await persist();
      await auditLogService.append({
        actorId: 'system',
        action: 'api_key:revoke',
        resource: id
      });
    }
  };

  const auditLogService: AuditLogService = {
    async append(entry) {
      const record: AuditLogEntry = { id: randomUUID(), createdAt: new Date().toISOString(), ...entry };
      store.audit.push(record);
      await persist();
      return record;
    },
    async list(limit = 50) {
      return store.audit.slice(-limit).reverse();
    }
  };

  const issueSession = (userId: string): Session => {
    const session: Session = { id: randomUUID(), userId, createdAt: new Date().toISOString(), ip: '127.0.0.1' };
    store.sessions.push(session);
    return session;
  };

  const authService: AuthService = {
    async registerWithPassword(email: string, password: string, roles?: string[]) {
      const existing = store.users.find((u) => u.email === email);
      if (existing) throw new Error('user_exists');
      const user = await userService.create({
        email,
        wallets: [],
        roles: roles && roles.length ? roles : ['viewer']
      });
      const cred = await hashPassword(password);
      store.credentials[user.id] = { ...cred, updatedAt: new Date().toISOString() };
      const session = issueSession(user.id);
      await persist();
      await auditLogService.append({
        actorId: user.id,
        action: 'register:password',
        resource: user.id,
        meta: { email: user.email, roles: user.roles }
      });
      return session;
    },
    async loginWithPassword(email: string, password: string) {
      const user = store.users.find((u) => u.email === email);
      if (!user) throw new Error('invalid_credentials');
      const cred = store.credentials[user.id];
      if (!cred) throw new Error('password_not_set');
      const ok = await verifyPassword(password, cred);
      if (!ok) throw new Error('invalid_credentials');
      const session = issueSession(user.id);
      await persist();
      await auditLogService.append({
        actorId: user.id,
        action: 'login:password',
        resource: user.id,
        meta: { email: user.email }
      });
      return session;
    },
    async loginWithSso(token: string) {
      const secret = process.env.SSO_JWT_SECRET;
      if (!secret) throw new Error('SSO_JWT_SECRET not configured');
      const payload = jwt.verify(token, secret) as { sub?: string; email?: string; roles?: string[]; wallets?: string[] };
      const email = payload.email || payload.sub || 'sso-user';
      const wallets = (payload.wallets || []).map((w) => w.toLowerCase());
      let user = store.users.find((u) => u.email === email);
      if (!user) {
        user = await userService.create({
          email,
          wallets,
          roles: payload.roles && payload.roles.length ? payload.roles : ['viewer']
        });
      } else if (wallets.length) {
        const merged = Array.from(new Set([...(user.wallets || []), ...wallets]));
        if (merged.length !== (user.wallets || []).length) {
          user.wallets = merged;
        }
      }
      const session = issueSession(user.id);
      await persist();
      await auditLogService.append({
        actorId: user.id,
        action: 'login:sso',
        resource: user.id,
        meta: { email, roles: user.roles }
      });
      return session;
    },
    async getSession(sessionId: string) {
      return store.sessions.find((s) => s.id === sessionId) || null;
    },
    async revokeSession(sessionId: string) {
      store.sessions = store.sessions.filter((s) => s.id !== sessionId);
      await auditLogService.append({
        actorId: 'system',
        action: 'session:revoke',
        resource: sessionId
      });
      await persist();
    }
  };

  return { rbacService, userService, apiKeyService, auditLogService, authService };
};

const hashSecret = async (secret: string) => {
  return createHash('sha256').update(secret).digest('hex');
};
