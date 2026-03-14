/**
 * Unit tests for mapRealmClaimToPermissions (apps/api/src/lib/rbac.ts)
 *
 * Run: node --import tsx/esm --test apps/api/src/lib/rbac.test.ts
 *   or: npx ts-node -e "require('./apps/api/src/lib/rbac.test.ts')"
 * Invoked via: pnpm --filter api test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapRealmClaimToPermissions } from './rbac';
import type { RealmClaim } from '../../../../packages/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function claim(
  realm: RealmClaim['realm'],
  realmRoles: string[],
  clientRoles: string[] = [],
): RealmClaim {
  return { realm, sub: 'test-sub', realmRoles, clientRoles, exp: 9999999999, iss: 'test' };
}

// ─── admins realm ────────────────────────────────────────────────────────────

test('admins realm always returns full admin permissions', () => {
  const perms = mapRealmClaimToPermissions(claim('admins', []));
  assert.ok(perms.includes('iam:write'), 'must include iam:write');
  assert.ok(perms.includes('governance:write'), 'must include governance:write');
  assert.ok(perms.includes('iam:read'), 'must include iam:read');
  assert.ok(!perms.includes('*'), 'admins realm does not grant wildcard — returns named perms');
});

test('admins realm grants admin regardless of realmRoles', () => {
  const withRoles = mapRealmClaimToPermissions(claim('admins', ['ghost-readonly']));
  const withoutRoles = mapRealmClaimToPermissions(claim('admins', []));
  assert.deepEqual(withRoles, withoutRoles);
});

// ─── owner roles ─────────────────────────────────────────────────────────────

test('ghost-owner role returns wildcard', () => {
  const perms = mapRealmClaimToPermissions(claim('users', ['ghost-owner']));
  assert.deepEqual(perms, ['*']);
});

test('"owner" alias also returns wildcard', () => {
  const perms = mapRealmClaimToPermissions(claim('employees', ['owner']));
  assert.deepEqual(perms, ['*']);
});

test('owner role in clientRoles also returns wildcard', () => {
  const perms = mapRealmClaimToPermissions(claim('users', [], ['ghost-owner']));
  assert.deepEqual(perms, ['*']);
});

// ─── admin roles ─────────────────────────────────────────────────────────────

test('ghost-admin role returns admin permission set', () => {
  const perms = mapRealmClaimToPermissions(claim('users', ['ghost-admin']));
  assert.ok(perms.includes('iam:write'), 'ghost-admin must include iam:write');
  assert.ok(perms.includes('iam:read'), 'ghost-admin must include iam:read');
  assert.ok(perms.includes('governance:write'));
  assert.ok(!perms.includes('*'), 'ghost-admin must not grant wildcard');
});

test('"admin" alias grants same admin permissions as ghost-admin', () => {
  const ghost = mapRealmClaimToPermissions(claim('users', ['ghost-admin']));
  const alias = mapRealmClaimToPermissions(claim('users', ['admin']));
  assert.deepEqual(new Set(ghost), new Set(alias));
});

// ─── operator roles ──────────────────────────────────────────────────────────

test('ghost-operator role returns operator permission set', () => {
  const perms = mapRealmClaimToPermissions(claim('users', ['ghost-operator']));
  assert.ok(perms.includes('wallets:write'), 'operator must include wallets:write');
  assert.ok(perms.includes('iam:read'), 'operator must include iam:read');
  assert.ok(!perms.includes('iam:write'), 'operator must NOT include iam:write');
  assert.ok(!perms.includes('governance:write'), 'operator must NOT include governance:write');
});

test('"operator" alias grants same as ghost-operator', () => {
  const ghost = mapRealmClaimToPermissions(claim('users', ['ghost-operator']));
  const alias = mapRealmClaimToPermissions(claim('users', ['operator']));
  assert.deepEqual(new Set(ghost), new Set(alias));
});

// ─── readonly roles ──────────────────────────────────────────────────────────

test('ghost-readonly role returns readonly permission set', () => {
  const perms = mapRealmClaimToPermissions(claim('users', ['ghost-readonly']));
  assert.ok(perms.includes('iam:read'));
  assert.ok(!perms.includes('iam:write'));
  assert.ok(!perms.includes('wallets:write'));
});

test('ghost-viewer alias grants same as ghost-readonly', () => {
  const readonly = mapRealmClaimToPermissions(claim('users', ['ghost-readonly']));
  const viewer   = mapRealmClaimToPermissions(claim('users', ['ghost-viewer']));
  assert.deepEqual(new Set(readonly), new Set(viewer));
});

test('ghost-employee alias grants readonly access', () => {
  const perms = mapRealmClaimToPermissions(claim('employees', ['ghost-employee']));
  assert.ok(perms.includes('iam:read'));
  assert.ok(!perms.includes('iam:write'));
});

// ─── unknown roles ────────────────────────────────────────────────────────────

test('unknown role defaults to readonly permissions', () => {
  const perms = mapRealmClaimToPermissions(claim('users', ['some-unknown-role']));
  assert.ok(perms.includes('iam:read'));
  assert.ok(!perms.includes('iam:write'));
});

test('empty roles array defaults to readonly', () => {
  const perms = mapRealmClaimToPermissions(claim('users', []));
  assert.ok(perms.includes('iam:read'));
  assert.ok(!perms.includes('iam:write'));
});

// ─── case-insensitivity ──────────────────────────────────────────────────────

test('role matching is case-insensitive (GHOST-ADMIN → admin perms)', () => {
  const perms = mapRealmClaimToPermissions(claim('users', ['GHOST-ADMIN']));
  assert.ok(perms.includes('iam:write'), 'GHOST-ADMIN must get admin perms');
});

test('role matching is case-insensitive (GHOST-OWNER → wildcard)', () => {
  const perms = mapRealmClaimToPermissions(claim('users', ['GHOST-OWNER']));
  assert.deepEqual(perms, ['*']);
});

// ─── permission union ────────────────────────────────────────────────────────

test('multiple roles return deduplicated union (admin + readonly → admin set)', () => {
  const perms = mapRealmClaimToPermissions(claim('users', ['ghost-admin', 'ghost-readonly']));
  assert.ok(perms.includes('iam:write'), 'union must include admin perms');
  // No duplicates: Set size equals array length
  assert.equal(perms.length, new Set(perms).size, 'no duplicate permissions');
});

test('realmRoles and clientRoles are unioned', () => {
  // operator in realm + readonly in client → should have at least operator perms
  const perms = mapRealmClaimToPermissions(claim('users', ['ghost-operator'], ['ghost-readonly']));
  assert.ok(perms.includes('wallets:write'), 'operator perm from realmRoles');
  assert.ok(perms.includes('iam:read'), 'readonly perm from clientRoles');
});

// ─── employees realm ─────────────────────────────────────────────────────────

test('employees realm with no special roles gets readonly', () => {
  const perms = mapRealmClaimToPermissions(claim('employees', ['employee']));
  assert.ok(perms.includes('iam:read'));
  assert.ok(!perms.includes('iam:write'));
});
