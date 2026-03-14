import { RequestHandler } from 'express';
import type { RealmClaim } from '../../../../packages/types';

// ─── Realm role → GhostChain permission mapping ───────────────────────────────
//
// Keycloak realm_access.roles (and resource_access roles) are mapped to the
// GhostChain RBAC permission strings used by requirePermission().  This lets
// OIDC-authenticated sessions share the same permission gate as password/session
// authenticated sessions without requiring a SQLite RBAC lookup.
//
// Convention (mirrors auth-store.ts role definitions):
//   ghost-owner    → ['*']                        (all permissions)
//   ghost-admin    → admin permission set
//   ghost-operator → operator permission set
//   ghost-readonly / ghost-viewer / (any other)   → read-only set
//
// The mapping is case-insensitive on the role name.  Add custom mappings by
// extending ROLE_PERMISSION_MAP below.

const READONLY_PERMISSIONS: readonly string[] = [
  'iam:read', 'chain:read', 'nodes:read', 'observability:read',
  'bridge:read', 'treasury:read', 'contracts:read', 'devops:read',
  'governance:read', 'validator:read', 'ai:read', 'wallets:read',
  'kyc:read', 'integrations:read', 'explorer:read',
];

const OPERATOR_PERMISSIONS: readonly string[] = [
  ...READONLY_PERMISSIONS,
  'wallets:write', 'kyc:write', 'integrations:write', 'nodes:write', 'chain:write',
];

const ADMIN_PERMISSIONS: readonly string[] = [
  ...OPERATOR_PERMISSIONS,
  'iam:write', 'feature-flags:write', 'guard:write', 'observability:write',
  'bridge:write', 'treasury:write', 'contracts:write', 'devops:write',
  'governance:write', 'validator:write', 'ai:write',
];

/**
 * Maps a Keycloak role name (lower-cased) to the list of GhostChain permission
 * strings it grants.  Roles not in this map default to READONLY.
 */
const ROLE_PERMISSION_MAP: Record<string, readonly string[]> = {
  'ghost-owner':    ['*'],
  'owner':          ['*'],
  'ghost-admin':    ADMIN_PERMISSIONS,
  'admin':          ADMIN_PERMISSIONS,
  'ghost-operator': OPERATOR_PERMISSIONS,
  'operator':       OPERATOR_PERMISSIONS,
  'ghost-readonly': READONLY_PERMISSIONS,
  'ghost-viewer':   READONLY_PERMISSIONS,
  'readonly':       READONLY_PERMISSIONS,
  'viewer':         READONLY_PERMISSIONS,
  // employees realm roles
  'ghost-employee': READONLY_PERMISSIONS,
  'employee':       READONLY_PERMISSIONS,
};

/**
 * Translates a validated RealmClaim (from OIDC JWT) into a deduplicated
 * array of GhostChain RBAC permission strings.
 *
 * Algorithm:
 *  1. Union all realmRoles + clientRoles from the claim.
 *  2. For each role, look up its permission set in ROLE_PERMISSION_MAP.
 *  3. If any role maps to ['*'], return ['*'] immediately (owner shortcut).
 *  4. Otherwise return the deduplicated union of all matched permission sets.
 *  5. Roles with no mapping contribute READONLY_PERMISSIONS (safe default).
 *
 * Note: the 'admins' Keycloak realm always grants admin-level access regardless
 * of individual role names, since only privileged users are provisioned there.
 */
export function mapRealmClaimToPermissions(claim: RealmClaim): string[] {
  // admins realm: always grant full admin permissions
  if (claim.realm === 'admins') {
    return [...ADMIN_PERMISSIONS];
  }

  const allRoles = [...claim.realmRoles, ...claim.clientRoles];

  // Fast path: any owner role → '*'
  if (allRoles.some((r) => ROLE_PERMISSION_MAP[r.toLowerCase()]?.[0] === '*')) {
    return ['*'];
  }

  const permSet = new Set<string>();
  for (const role of allRoles) {
    const perms = ROLE_PERMISSION_MAP[role.toLowerCase()];
    if (perms) {
      for (const p of perms) permSet.add(p);
    } else {
      // Unknown roles default to read-only access
      for (const p of READONLY_PERMISSIONS) permSet.add(p);
    }
  }

  // If no roles at all, default to read-only (employees realm — basic access)
  if (allRoles.length === 0) {
    return [...READONLY_PERMISSIONS];
  }

  return [...permSet];
}

export const attachPermissions = (permissions: string[]): RequestHandler => {
  return (_req, res, next) => {
    if (!res.locals) res.locals = {} as typeof res.locals;
    res.locals.permissions = permissions;
    next();
  };
};

export const requirePermission = (permission: string): RequestHandler => {
  return (req, res, next) => {
    if (process.env.PUBLIC_STACK === 'true') {
      next();
      return;
    }
    const permissions = (req.session?.permissions || []) as string[];
    if (permissions.includes('*')) {
      next();
      return;
    }
    if (permissions.includes(permission)) {
      next();
      return;
    }
    res.status(403).json({ error: 'forbidden', permission });
  };
};
