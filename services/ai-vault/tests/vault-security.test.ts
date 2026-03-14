/**
 * GhostStack AI Vault — Vault Security Tests
 * Integration tests for AuditLedger, EncryptedStore, and SecretManager.
 *
 * Uses temporary SQLite databases cleaned up after each suite.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditLedger } from '../storage/audit-ledger.js';
import { EncryptedStore } from '../storage/encrypted-store.js';
import { PolicyEngine } from '../core/policy-engine.js';
import { SecretManager } from '../core/secret-manager.js';
import { SecureKey, deriveKeyScrypt, generateSalt } from '../core/crypto-engine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ghost-vault-test-'));
}

// ── AuditLedger ───────────────────────────────────────────────────────────────

describe('AuditLedger', () => {
  let audit: AuditLedger;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = makeTmpDir();
    audit  = new AuditLedger(join(tmpDir, 'audit.db'));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends an entry and returns it', () => {
    const entry = audit.append({
      actor:     'test-actor',
      actorType: 'service',
      resource:  'vault://test/secret',
      action:    'secret.write',
      result:    'success',
      riskScore: 0.1,
      message:   'Test write',
    });

    expect(entry.id).toBeTruthy();
    expect(entry.actor).toBe('test-actor');
    expect(entry.action).toBe('secret.write');
    expect(entry.chainHash).toBeTruthy();
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  it('returns recent entries', () => {
    audit.append({
      actor: 'actor-a', actorType: 'service', resource: 'vault://a', action: 'secret.read',
      result: 'success', riskScore: 0.0,
    });
    audit.append({
      actor: 'actor-b', actorType: 'service', resource: 'vault://b', action: 'key.sign',
      result: 'success', riskScore: 0.2,
    });

    const recent = audit.recent(10);
    expect(recent.length).toBeGreaterThanOrEqual(2);
  });

  it('queries entries with limit', () => {
    const results = audit.query({ since: 0, limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns stats', () => {
    const stats = audit.stats();
    expect(typeof stats.total).toBe('number');
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.byAction).toBeDefined();
    expect(stats.avgRiskScore).toBeGreaterThanOrEqual(0);
  });

  it('verifies chain integrity', () => {
    const result = audit.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it('prunes old entries (no entries to prune yet)', () => {
    // With 90-day retention, no entries should be pruned
    const pruned = audit.prune(90);
    expect(typeof pruned).toBe('number');
    expect(pruned).toBeGreaterThanOrEqual(0);
  });
});

// ── EncryptedStore ────────────────────────────────────────────────────────────

describe('EncryptedStore', () => {
  let store:     EncryptedStore;
  let masterKey: SecureKey;
  let tmpDir:    string;

  beforeAll(() => {
    tmpDir    = makeTmpDir();
    masterKey = deriveKeyScrypt('vault-test-master-key', generateSalt(32));
    store     = new EncryptedStore(join(tmpDir, 'vault.db'), masterKey);
  });

  afterAll(() => {
    masterKey.wipe();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and retrieves a string value', () => {
    store.set('vault://test/api-key', Buffer.from('ghost-api-key-secret'), {});

    const val = store.getString('vault://test/api-key');
    expect(val).toBe('ghost-api-key-secret');
  });

  it('returns null for a non-existent key', () => {
    const val = store.getString('vault://does/not/exist');
    expect(val).toBeNull();
  });

  it('overwrites an existing secret', () => {
    store.set('vault://test/overwrite', Buffer.from('original'), {});
    store.set('vault://test/overwrite', Buffer.from('updated'), {});
    expect(store.getString('vault://test/overwrite')).toBe('updated');
  });

  it('deletes a secret', () => {
    store.set('vault://test/to-delete', Buffer.from('bye'), {});
    const deleted = store.delete('vault://test/to-delete');
    expect(deleted).toBe(true);
    expect(store.getString('vault://test/to-delete')).toBeNull();
  });

  it('lists stored secrets', () => {
    store.set('vault://list/a', Buffer.from('val-a'), { namespace: 'list' });
    store.set('vault://list/b', Buffer.from('val-b'), { namespace: 'list' });

    const all = store.list();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('returns metadata for an existing key', () => {
    store.set('vault://test/meta-check', Buffer.from('meta-val'), { namespace: 'ns' });
    const meta = store.getMeta('vault://test/meta-check');
    expect(meta).not.toBeNull();
    expect(meta?.path).toBe('vault://test/meta-check');
  });
});

// ── SecretManager ─────────────────────────────────────────────────────────────

describe('SecretManager', () => {
  let secretMgr:  SecretManager;
  let masterKey:  SecureKey;
  let tmpDir:     string;
  let audit:      AuditLedger;
  let store:      EncryptedStore;
  let policy:     PolicyEngine;

  beforeAll(() => {
    tmpDir    = makeTmpDir();
    masterKey = deriveKeyScrypt('secret-mgr-test-key', generateSalt(32));
    audit     = new AuditLedger(join(tmpDir, 'audit.db'));
    store     = new EncryptedStore(join(tmpDir, 'secrets.db'), masterKey);
    // PolicyEngine with a non-existent path — logs a warning and uses defaults
    policy    = new PolicyEngine(join(tmpDir, 'nonexistent-policy.yaml'));
    secretMgr = new SecretManager(store, audit, policy);
  });

  afterAll(() => {
    masterKey.wipe();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores a secret and retrieves it', async () => {
    await secretMgr.store(
      'vault://ghostchain/treasury/api-key',
      'gst-treasury-secret-12345',
      { actor: 'test-actor', actorType: 'service' },
    );

    const retrieved = await secretMgr.get(
      'vault://ghostchain/treasury/api-key',
      'test-actor',
      'service',
    );

    expect(retrieved).not.toBeNull();
    expect(retrieved!.value).toBe('gst-treasury-secret-12345');
  });

  it('returns null for a non-existent secret', async () => {
    const result = await secretMgr.get('vault://ghostchain/missing', 'test-actor');
    expect(result).toBeNull();
  });

  it('lists secrets with a prefix', async () => {
    await secretMgr.store('vault://ghostchain/l1/key1', 'val1', { actor: 'sys' });
    await secretMgr.store('vault://ghostchain/l1/key2', 'val2', { actor: 'sys' });

    const list = secretMgr.list('vault://ghostchain/l1');
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.every(m => m.path.startsWith('vault://ghostchain/l1'))).toBe(true);
  });

  it('deletes a secret', async () => {
    await secretMgr.store('vault://ghostchain/temp/del', 'to-delete', { actor: 'sys' });
    const deleted = await secretMgr.delete('vault://ghostchain/temp/del', 'sys');
    expect(deleted).toBe(true);

    const after = await secretMgr.get('vault://ghostchain/temp/del', 'sys');
    expect(after).toBeNull();
  });

  it('rotates a secret generating a new random value', async () => {
    await secretMgr.store('vault://ghostchain/rotatable', 'original-value', { actor: 'sys' });

    const result = await secretMgr.rotate(
      'vault://ghostchain/rotatable',
      { actor: 'sys', reason: 'scheduled' },
    );

    expect(result.path).toBe('vault://ghostchain/rotatable');

    const after = await secretMgr.get('vault://ghostchain/rotatable', 'sys');
    expect(after).not.toBeNull();
    // The new value is randomly generated and should differ from original
    expect(after!.value).not.toBe('original-value');
  });

  it('creates audit log entries for operations', async () => {
    const before = audit.stats().total;
    await secretMgr.store('vault://ghostchain/audit-check', 'audit-val', { actor: 'auditor' });
    const after = audit.stats().total;
    expect(after).toBeGreaterThan(before);
  });
});
