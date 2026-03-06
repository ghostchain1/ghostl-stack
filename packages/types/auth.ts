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

// ─── OIDC / Realm types ────────────────────────────────────────────────────

/** GhostChain authentication realm (mirrors Keycloak realm names) */
export type OIDCRealm = 'users' | 'employees' | 'admins';

/** Claims extracted from a validated OIDC JWT (subset of standard + GhostChain custom claims) */
export interface RealmClaim {
  /** Which realm issued the token */
  realm: OIDCRealm;
  /** JWT subject — typically the Keycloak user UUID */
  sub: string;
  /** Keycloak-preferred_username */
  preferredUsername?: string;
  /** Keycloak email claim */
  email?: string;
  /** Keycloak realm_access.roles array */
  realmRoles: string[];
  /** Keycloak resource_access roles flattened for this API's client */
  clientRoles: string[];
  /** Token expiry (Unix epoch seconds) */
  exp: number;
  /** Token issuer URL */
  iss: string;
}

/** OIDC provider configuration for a single realm */
export interface OIDCRealmConfig {
  realm: OIDCRealm;
  /** OpenID Connect issuer base URL (e.g. https://keycloak.ghost/realms/ghost-users) */
  issuerUrl: string;
  /** JWKS endpoint URL (auto-derived if not set: issuerUrl + /protocol/openid-connect/certs) */
  jwksUrl?: string;
  /** Expected audience claim value(s) */
  audience?: string[];
}

/** Full OIDC configuration (all three realms) */
export interface OIDCConfig {
  users: OIDCRealmConfig;
  employees: OIDCRealmConfig;
  admins: OIDCRealmConfig;
  /** Clock tolerance in seconds for JWT expiry validation */
  clockToleranceSeconds: number;
}

// ──────────────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  ip?: string;
  userAgent?: string;
}
