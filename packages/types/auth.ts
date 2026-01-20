export interface User {
  id: string;
  email: string;
  username?: string;
  wallets: string[];
  roles: string[];
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

export interface ApiKey {
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt?: string;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  ip?: string;
  userAgent?: string;
}
