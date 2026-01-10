import { promises as fs } from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { SiweMessage } from 'siwe';
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
      'ai:read'
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
      'ai:write'
    ]
  }
];

const defaultUsers: User[] = [
  { id: 'user-1', email: 'admin@ghostl.dev', wallets: [], roles: ['admin'] }
];

interface StoreShape {
  users: User[];
  roles: Role[];
  apiKeys: (ApiKey & { userId: string; secret: string })[];
  sessions: Session[];
  audit: AuditLogEntry[];
}

const loadStore = async (): Promise<StoreShape> => {
  const filePath = process.env.AUTH_STORE_PATH || path.join(process.cwd(), 'data', 'iam.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as StoreShape;
  } catch (err) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const initial: StoreShape = { users: defaultUsers, roles: defaultRoles, apiKeys: [], sessions: [], audit: [] };
    await fs.writeFile(filePath, JSON.stringify(initial, null, 2));
    return initial;
  }
};

const saveStore = async (store: StoreShape) => {
  const filePath = process.env.AUTH_STORE_PATH || path.join(process.cwd(), 'data', 'iam.json');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2));
};

export const createPersistentIdentityServices = async () => {
  const store = await loadStore();

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
    async loginWithWallet(message: string, signature: string, nonce: string) {
      const address = await verifySiwe(message, signature, nonce);
      if (!address) throw new Error('invalid wallet login');
      const existing = store.users.find((u) => u.wallets.includes(address));
      const user =
        existing ||
        (await userService.create({
          email: `${address.toLowerCase()}@wallet`,
          wallets: [address],
          roles: ['viewer']
        }));
      const session = issueSession(user.id);
      await persist();
      await auditLogService.append({
        actorId: user.id,
        action: 'login:wallet',
        resource: user.id,
        meta: { wallets: user.wallets }
      });
      return session;
    },
    async loginWithSso(token: string) {
      const secret = process.env.SSO_JWT_SECRET;
      if (!secret) throw new Error('SSO_JWT_SECRET not configured');
      const payload = jwt.verify(token, secret) as { sub?: string; email?: string; roles?: string[]; wallets?: string[] };
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

const verifySiwe = async (message: string, signature: string, nonce: string): Promise<string | null> => {
  try {
    const siwe = new SiweMessage(message);
    const fields = await siwe.verify({ signature, nonce });
    return fields.data.address;
  } catch {
    return null;
  }
};

const hashSecret = async (secret: string) => {
  return createHash('sha256').update(secret).digest('hex');
};
