import { randomUUID } from 'crypto';
import argon2 from 'argon2';
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
import { openSqlite, type SqliteHandle } from './db';

const AUTH_DB_PATH = process.env.AUTH_DB_PATH || process.env.SQLITE_DB_PATH || 'data/auth.db';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 60 * 1000);

const roles: Role[] = [
  {
    id: 'readonly',
    name: 'READONLY',
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
      'kyc:read',
      'integrations:read'
    ]
  },
  {
    id: 'operator',
    name: 'OPERATOR',
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
      'wallets:write',
      'kyc:read',
      'kyc:write',
      'integrations:read',
      'integrations:write',
      'nodes:write',
      'chain:write'
    ]
  },
  {
    id: 'admin',
    name: 'ADMIN',
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
      'wallets:write',
      'kyc:read',
      'kyc:write',
      'integrations:read',
      'integrations:write'
    ]
  },
  {
    id: 'owner',
    name: 'OWNER',
    permissions: ['*']
  }
];

const roleOrder: Record<string, number> = { READONLY: 0, OPERATOR: 1, ADMIN: 2, OWNER: 3 };

const normalizeRole = (role?: string) => {
  if (!role) return 'READONLY';
  const raw = role.toUpperCase();
  if (raw === 'OWNER') return 'OWNER';
  if (raw === 'ADMIN') return 'ADMIN';
  if (raw === 'OPERATOR') return 'OPERATOR';
  if (raw === 'READONLY' || raw === 'VIEWER') return 'READONLY';
  return 'READONLY';
};

const normalizeEmail = (email?: string | null) => (email ? email.trim().toLowerCase() : '');

const isOwnerEmail = (email?: string | null) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const ownerEntries = [process.env.OWNER_EMAILS, process.env.BOOTSTRAP_OWNER_EMAILS].filter(
    (value): value is string => Boolean(value)
  );
  const owners = ownerEntries
    .flatMap((value) => value.split(','))
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
  return owners.includes(normalized);
};

const resolveRoleForEmail = (email: string | undefined, role: string) => {
  if (role === 'OWNER') return 'OWNER';
  return isOwnerEmail(email) ? 'OWNER' : role;
};

const resolveRoleFromRoles = (rolesInput?: string[]) => {
  if (!rolesInput || !rolesInput.length) return 'READONLY';
  const normalized = rolesInput.map((role) => normalizeRole(role));
  return normalized.sort((a, b) => roleOrder[b] - roleOrder[a])[0] || 'READONLY';
};

const userFromRow = (row: any, wallets: string[] = []): User => ({
  id: row.id,
  email: row.email,
  username: row.username || undefined,
  wallets,
  roles: [resolveRoleForEmail(row.email, normalizeRole(row.role)).toLowerCase()]
});

const openAuthDb = (): SqliteHandle => {
  const db = openSqlite(AUTH_DB_PATH);
  if (!db) throw new Error('auth_db_unavailable');
  db.exec(`
    create table if not exists users (
      id text primary key,
      email text not null unique,
      password_hash text not null,
      role text not null,
      username text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists sessions (
      id text primary key,
      user_id text not null,
      created_at text not null,
      expires_at text not null,
      rotated_from text,
      revoked_at text,
      ip text,
      user_agent text,
      csrf_token text,
      data text
    );
    create table if not exists audit_logs (
      id text primary key,
      user_id text,
      action text not null,
      ip text,
      user_agent text,
      created_at text not null,
      metadata text
    );
    create table if not exists api_keys (
      id text primary key,
      user_id text not null,
      name text not null,
      scopes text not null,
      secret_hash text not null,
      last_used_at text
    );
    create table if not exists login_attempts (
      id text primary key,
      email text,
      ip text,
      attempts integer not null,
      last_attempt text not null,
      locked_until text
    );
  `);
  const columns = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
  const existing = new Set(columns.map((c) => c.name));
  if (!existing.has('username')) {
    db.exec(`ALTER TABLE users ADD COLUMN username text`);
  }
  db.exec(`
    create table if not exists user_wallets (
      id text primary key,
      user_id text not null,
      address text not null,
      chain_id text,
      label text,
      created_at text not null
    );
    create unique index if not exists user_wallets_unique on user_wallets(user_id, address);
    create index if not exists user_wallets_address on user_wallets(address);
  `);
  return db;
};

const db = openAuthDb();

const nowIso = () => new Date().toISOString();

const normalizeAddress = (address: string) => address.trim().toLowerCase();

const loadWalletsForUser = (userId: string) => {
  const rows = db.prepare('select address from user_wallets where user_id = ?').all(userId) as { address: string }[];
  return rows.map((row) => row.address);
};

const replaceWalletsForUser = (userId: string, wallets: string[]) => {
  db.prepare('delete from user_wallets where user_id = ?').run(userId);
  const insert = db.prepare('insert into user_wallets (id, user_id, address, created_at) values (?, ?, ?, ?)');
  const createdAt = nowIso();
  const unique = Array.from(new Set(wallets.map((w) => normalizeAddress(w)).filter(Boolean)));
  for (const address of unique) {
    insert.run(randomUUID(), userId, address, createdAt);
  }
};

const isUsernameTaken = (username: string, exceptUserId?: string) => {
  if (!username) return false;
  const row = db.prepare('select id from users where username = ?').get(username) as { id?: string } | undefined;
  if (!row) return false;
  if (exceptUserId && row.id === exceptUserId) return false;
  return true;
};

const hashPassword = async (password: string) => {
  return argon2.hash(password, { type: argon2.argon2id });
};

const verifyPassword = async (password: string, hash: string) => {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
};

const auditLogService: AuditLogService = {
  async append(entry) {
    const id = randomUUID();
    const createdAt = nowIso();
    db.prepare(
      'insert into audit_logs (id, user_id, action, ip, user_agent, created_at, metadata) values (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, entry.actorId || null, entry.action, entry.meta?.ip || null, entry.meta?.userAgent || null, createdAt, JSON.stringify(entry.meta || {}));
    return { id, createdAt, ...entry };
  },
  async list(limit = 200) {
    const rows = db
      .prepare('select * from audit_logs order by created_at desc limit ?')
      .all(limit);
    return rows.map((row: any) => ({
      id: row.id,
      actorId: row.user_id || 'unknown',
      action: row.action,
      resource: row.user_id || 'unknown',
      createdAt: row.created_at,
      meta: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }
};

const rbacService: RBACService = {
  async listRoles() {
    return roles;
  },
  async createRole() {
    throw new Error('roles_locked');
  },
  async updateRole() {
    throw new Error('roles_locked');
  },
  async deleteRole() {
    throw new Error('roles_locked');
  },
  async getUserPermissions(user: User) {
    const role = resolveRoleFromRoles(user.roles);
    const entry = roles.find((r) => r.name === role);
    return entry ? entry.permissions : [];
  }
};

const userService: UserService = {
  async list() {
    const rows = db.prepare('select * from users order by created_at asc').all() as any[];
    const walletRows = db.prepare('select user_id, address from user_wallets').all() as { user_id: string; address: string }[];
    const walletMap = new Map<string, string[]>();
    walletRows.forEach((row) => {
      const existing = walletMap.get(row.user_id) || [];
      existing.push(row.address);
      walletMap.set(row.user_id, existing);
    });
    return rows.map((row) => userFromRow(row, walletMap.get(row.id) || []));
  },
  async get(id: string) {
    const row = db.prepare('select * from users where id = ?').get(id) as any;
    return row ? userFromRow(row, loadWalletsForUser(id)) : null;
  },
  async create(input) {
    const username = input.username?.trim();
    if (username && isUsernameTaken(username)) {
      throw new Error('username_exists');
    }
    const id = randomUUID();
    const createdAt = nowIso();
    const role = resolveRoleForEmail(input.email, resolveRoleFromRoles(input.roles));
    db.prepare(
      'insert into users (id, email, password_hash, role, username, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, input.email, await hashPassword(randomUUID()), role, username || null, createdAt, createdAt);
    if (input.wallets?.length) {
      replaceWalletsForUser(id, input.wallets);
    }
    return { id, email: input.email, username: username || undefined, wallets: input.wallets || [], roles: [role.toLowerCase()] };
  },
  async update(id, input) {
    const existing = db.prepare('select * from users where id = ?').get(id) as any;
    if (!existing) throw new Error('user not found');
    const nextUsername = input.username?.trim() ?? existing.username ?? null;
    if (nextUsername && isUsernameTaken(nextUsername, id)) {
      throw new Error('username_exists');
    }
    const role = resolveRoleForEmail(
      input.email || existing.email,
      input.roles ? resolveRoleFromRoles(input.roles) : normalizeRole(existing.role)
    );
    const updatedAt = nowIso();
    db.prepare('update users set email = ?, role = ?, username = ?, updated_at = ? where id = ?').run(
      input.email || existing.email,
      role,
      nextUsername,
      updatedAt,
      id
    );
    if (input.wallets) {
      replaceWalletsForUser(id, input.wallets);
    }
    const row = db.prepare('select * from users where id = ?').get(id) as any;
    return userFromRow(row, loadWalletsForUser(id));
  }
};

const apiKeyService: ApiKeyService = {
  async list(userId?: string) {
    const rows = (userId
      ? db.prepare('select * from api_keys where user_id = ?').all(userId)
      : db.prepare('select * from api_keys').all()) as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      scopes: JSON.parse(row.scopes || '[]'),
      lastUsedAt: row.last_used_at || undefined
    }));
  },
  async create(userId, name, scopes) {
    const id = randomUUID();
    const secret = randomUUID();
    const secretHash = await hashPassword(secret);
    db.prepare('insert into api_keys (id, user_id, name, scopes, secret_hash, last_used_at) values (?, ?, ?, ?, ?, ?)').run(
      id,
      userId,
      name,
      JSON.stringify(scopes || []),
      secretHash,
      null
    );
    await auditLogService.append({ actorId: userId, action: 'api_key:create', resource: id, meta: { name, scopes } });
    return { id, name, scopes, lastUsedAt: undefined, secret } as ApiKey;
  },
  async revoke(id) {
    db.prepare('delete from api_keys where id = ?').run(id);
    await auditLogService.append({ actorId: 'system', action: 'api_key:revoke', resource: id });
  }
};

const recordLoginAttempt = (email: string, ip: string | undefined, ok: boolean) => {
  const row = db
    .prepare('select * from login_attempts where email = ? and ip = ?')
    .get(email, ip || '') as any;
  const now = nowIso();
  if (ok) {
    if (row) {
      db.prepare('delete from login_attempts where id = ?').run(row.id);
    }
    return;
  }
  const attempts = row ? row.attempts + 1 : 1;
  const lockedUntil = attempts >= 5 ? new Date(Date.now() + attempts * 60_000).toISOString() : null;
  if (row) {
    db.prepare('update login_attempts set attempts = ?, last_attempt = ?, locked_until = ? where id = ?').run(
      attempts,
      now,
      lockedUntil,
      row.id
    );
  } else {
    db.prepare('insert into login_attempts (id, email, ip, attempts, last_attempt, locked_until) values (?, ?, ?, ?, ?, ?)').run(
      randomUUID(),
      email,
      ip || '',
      attempts,
      now,
      lockedUntil
    );
  }
};

const checkLockout = (email: string, ip: string | undefined) => {
  const row = db
    .prepare('select * from login_attempts where email = ? and ip = ?')
    .get(email, ip || '') as any;
  if (!row || !row.locked_until) return false;
  return new Date(row.locked_until).getTime() > Date.now();
};

const authService: AuthService = {
  async loginWithPassword(email, password, context) {
    if (checkLockout(email, context?.ip)) throw new Error('account_locked');
    const row = db.prepare('select * from users where email = ?').get(email) as any;
    if (!row) {
      recordLoginAttempt(email, context?.ip, false);
      throw new Error('invalid_credentials');
    }
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      recordLoginAttempt(email, context?.ip, false);
      throw new Error('invalid_credentials');
    }
    recordLoginAttempt(email, context?.ip, true);
    return userFromRow(row, loadWalletsForUser(row.id));
  },
  async registerWithPassword(email, password, rolesInput) {
    const existing = db.prepare('select * from users where email = ?').get(email) as any;
    if (existing) throw new Error('user_exists');
    const id = randomUUID();
    const now = nowIso();
    const role = resolveRoleForEmail(email, resolveRoleFromRoles(rolesInput));
    const passwordHash = await hashPassword(password);
    db.prepare('insert into users (id, email, password_hash, role, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run(
      id,
      email,
      passwordHash,
      role,
      now,
      now
    );
    return { id, email, username: undefined, wallets: [], roles: [role.toLowerCase()] };
  },
  async loginWithSso(token) {
    const secret = process.env.SSO_JWT_SECRET;
    if (!secret) throw new Error('SSO_JWT_SECRET not configured');
    const payload = jwt.verify(token, secret) as { sub?: string; email?: string };
    const email = payload.email || payload.sub;
    if (!email) throw new Error('invalid_credentials');
    const existing = db.prepare('select * from users where email = ?').get(email) as any;
    if (!existing) throw new Error('invalid_credentials');
    return userFromRow(existing, loadWalletsForUser(existing.id));
  },
  async createSession(userId, sessionId, context) {
    const now = nowIso();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    db.prepare(
      'insert into sessions (id, user_id, created_at, expires_at, rotated_from, revoked_at, ip, user_agent, csrf_token, data) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)' +
        ' on conflict(id) do update set user_id = excluded.user_id, expires_at = excluded.expires_at, rotated_from = excluded.rotated_from, revoked_at = excluded.revoked_at, ip = excluded.ip, user_agent = excluded.user_agent, csrf_token = excluded.csrf_token, data = excluded.data'
    ).run(
      sessionId,
      userId,
      now,
      expiresAt,
      context?.rotatedFrom || null,
      null,
      context?.ip || null,
      context?.userAgent || null,
      null,
      null
    );
    return { id: sessionId, userId, createdAt: now, ip: context?.ip, userAgent: context?.userAgent };
  },
  async getSession(sessionId) {
    const row = db.prepare('select * from sessions where id = ?').get(sessionId) as any;
    if (!row) return null;
    if (row.revoked_at) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
    return { id: row.id, userId: row.user_id, createdAt: row.created_at, ip: row.ip, userAgent: row.user_agent };
  },
  async revokeSession(sessionId) {
    db.prepare('update sessions set revoked_at = ? where id = ?').run(nowIso(), sessionId);
    await auditLogService.append({ actorId: 'system', action: 'session:revoke', resource: sessionId });
  },
  async bootstrapAdmin(email, password) {
    const existing = db.prepare('select count(1) as count from users').get() as { count: number };
    if (existing.count > 0) throw new Error('bootstrap_disabled');
    const id = randomUUID();
    const now = nowIso();
    const passwordHash = await hashPassword(password);
    const role = resolveRoleForEmail(email, 'ADMIN');
    db.prepare('insert into users (id, email, password_hash, role, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run(
      id,
      email,
      passwordHash,
      role,
      now,
      now
    );
    return { id, email, username: undefined, wallets: [], roles: [role.toLowerCase()] };
  }
};

export const createPersistentIdentityServices = async () => {
  return {
    authService,
    rbacService,
    auditLogService,
    apiKeyService,
    userService
  };
};
