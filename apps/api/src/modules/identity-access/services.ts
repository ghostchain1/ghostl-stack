import type { ApiKey, Role, Session, User } from '../../../../../packages/types';

export interface AuthService {
  loginWithPassword(email: string, password: string): Promise<Session>;
  registerWithPassword(email: string, password: string, roles?: string[]): Promise<Session>;
  loginWithSso(token: string): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  revokeSession(sessionId: string): Promise<void>;
}

export interface RBACService {
  listRoles(): Promise<Role[]>;
  createRole(input: Omit<Role, 'id'>): Promise<Role>;
  updateRole(id: string, input: Partial<Role>): Promise<Role>;
  deleteRole(id: string): Promise<void>;
  getUserPermissions(user: User): Promise<string[]>;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: string;
  resource: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface AuditLogService {
  append(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<AuditLogEntry>;
  list(limit?: number): Promise<AuditLogEntry[]>;
}

export interface MultisigApproval {
  proposalId: string;
  signer: string;
  at: string;
  threshold: number;
  totalSigners: number;
  requiredSigners: string[];
}

export interface ApiKeyService {
  list(userId?: string): Promise<ApiKey[]>;
  create(userId: string, name: string, scopes: string[]): Promise<ApiKey>;
  revoke(id: string): Promise<void>;
}

export interface UserService {
  list(): Promise<User[]>;
  get(id: string): Promise<User | null>;
  create(input: Omit<User, 'id'>): Promise<User>;
  update(id: string, input: Partial<User>): Promise<User>;
}
