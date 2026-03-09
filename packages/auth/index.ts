/**
 * @ghostl/auth — shared authentication & authorisation primitives.
 *
 * Framework-agnostic: no React, Node.js, or browser globals required.
 * Used by apps/web and apps/api to share canonical role/realm logic.
 */

// ─── App role ─────────────────────────────────────────────────────────────────

/** Normalised application role (independent of Keycloak role strings). */
export type AppRole = 'READONLY' | 'OPERATOR' | 'ADMIN' | 'OWNER';

/** Numeric order — higher = more privileged. Used for role-gate comparisons. */
export const roleOrder: Record<AppRole, number> = {
  READONLY: 0,
  OPERATOR: 1,
  ADMIN: 2,
  OWNER: 3,
};

/**
 * Normalise a raw role string (or array of strings) from session / JWT into
 * a canonical AppRole.  Unknown or missing values default to 'READONLY'.
 */
export const normalizeRole = (roleInput?: string | string[] | null): AppRole => {
  if (!roleInput) return 'READONLY';
  const roles = Array.isArray(roleInput) ? roleInput : [roleInput];
  const lowered = roles.map((r) => r.toLowerCase());
  if (lowered.some((r) => r === 'owner' || r === 'root' || r === 'superadmin')) return 'OWNER';
  if (
    lowered.some(
      (r) =>
        r === 'admin' ||
        r === 'protocol admin' ||
        r === 'security admin' ||
        r === 'treasury admin',
    )
  )
    return 'ADMIN';
  if (lowered.some((r) => r === 'operator' || r === 'developer')) return 'OPERATOR';
  if (lowered.some((r) => r === 'readonly' || r === 'viewer')) return 'READONLY';
  return 'READONLY';
};

// ─── Realm ────────────────────────────────────────────────────────────────────

/** The three authentication realms that map to Keycloak realm instances. */
export const REALMS = ['users', 'employees', 'admins'] as const;
export type Realm = (typeof REALMS)[number];

const realmSet = new Set<string>(REALMS);

/** Type guard: is a raw string a valid Realm? */
export const isRealm = (value: string): value is Realm => realmSet.has(value);

/** Maps each canonical AppRole to the Realm that owns it. */
export const roleToRealm: Record<AppRole, Realm> = {
  READONLY: 'users',
  OPERATOR: 'employees',
  ADMIN: 'admins',
  OWNER: 'admins',
};

/**
 * Derive the Realm for a raw role input.
 * Equivalent to roleToRealm[normalizeRole(input)].
 */
export const realmForRole = (roleInput?: string | string[] | null): Realm =>
  roleToRealm[normalizeRole(roleInput)];

/**
 * Extract the active Realm from a `cookie` HTTP header string.
 * Falls back to 'users' if the `ghost_realm` cookie is absent or invalid.
 *
 * Safe to call in both Node.js (apps/api) and SSR (apps/web server components).
 */
export const realmFromCookieHeader = (cookieHeader: string | null | undefined): Realm => {
  if (!cookieHeader) return 'users';
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('ghost_realm='));
  if (!cookie) return 'users';
  const value = decodeURIComponent(cookie.split('=', 2)[1] ?? 'users');
  return isRealm(value) ? value : 'users';
};
