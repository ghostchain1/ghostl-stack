/**
 * @file test/gsa.test.js
 * @description Unit tests for ghostbrain-gsa modules.
 *
 * Run: node --test services/ghostbrain-gsa/test/gsa.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SRC       = join(__dirname, '..', 'src');

// ─── Global test environment setup ──────────────────────────────────────────
let tmpRepo;
before(() => {
  tmpRepo = mkdtempSync(join(tmpdir(), 'gsa-test-'));
  mkdirSync(join(tmpRepo, 'contracts', 'src'), { recursive: true });
  mkdirSync(join(tmpRepo, '.gsa-bundles'),      { recursive: true });
  writeFileSync(join(tmpRepo, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
  process.env.REPO_ROOT                 = tmpRepo;
  process.env.GSA_BUNDLE_DIR            = join(tmpRepo, '.gsa-bundles');
  process.env.CONTROL_PLANE_HMAC_SECRET = 'test-secret-32chars-long-enough!!';
  process.env.NODE_ENV                  = 'test';
});
after(() => { rmSync(tmpRepo, { recursive: true, force: true }); });

// ─── Sync test helpers (no await/require inside) ─────────────────────────────
function sha256hex(str) {
  return createHash('sha256').update(str).digest('hex');
}

/** Local Merkle implementation that mirrors ogb-verifier's algorithm. */
function localMerkleRoot(hashes) {
  if (hashes.length === 0) return sha256hex('');
  let layer = [...hashes];
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left  = layer[i];
      const right = layer[i + 1] ?? layer[i];
      const [a, b] = left <= right ? [left, right] : [right, left];
      next.push(sha256hex(a + b));
    }
    layer = next;
  }
  return layer[0];
}

/** Builds a valid bundle fixture using only sync operations. */
function makeBundle(overrides = {}) {
  const artifacts = [
    { type: 'proposal', payload: { id: 1 } },
    { type: 'vote',     payload: { yea: 5 } },
  ];
  const hashes = artifacts.map(a => sha256hex(JSON.stringify(a)));
  return {
    uid:        `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    artifacts,
    merkleRoot: localMerkleRoot(hashes),
    expiresAt:  new Date(Date.now() + 3_600_000).toISOString(),
    signatures: [{ signer: '0xabc', sig: 'test' }],
    threshold:  1,
    ...overrides,
  };
}

// ─── 1. Routing-law constraints ───────────────────────────────────────────────
describe('constraints — routing law', async () => {
  const { assertRoutingLaw, assertExternalEgressFromL1 } =
    await import(`${SRC}/policy/constraints.js`);

  it('allows L3→L2',  () => assert.equal(assertRoutingLaw(903, 901).ok,        true));
  it('allows L2→L1',  () => assert.equal(assertRoutingLaw(901, 14000101).ok,   true));
  it('rejects L3→L1 direct', () => {
    const r = assertRoutingLaw(903, 14000101);
    assert.equal(r.ok, false);
    assert.match(r.reason, /ROUTING_LAW_VIOLATION/);
  });
  it('rejects L1→L3 reverse',   () => assert.equal(assertRoutingLaw(14000101, 903).ok, false));
  it('allows external egress from L1', () => assert.equal(assertExternalEgressFromL1(14000101).ok, true));
  it('rejects external egress from L2', () => assert.equal(assertExternalEgressFromL1(901).ok, false));
});

// ─── 2. Branding-law constraints ─────────────────────────────────────────────
describe('constraints — branding law', async () => {
  const { assertBrandingLaw, assertNoBrandLeak } =
    await import(`${SRC}/policy/constraints.js`);

  it('accepts Ghost/GST/18', () => {
    assert.equal(assertBrandingLaw({ name: 'Ghost', symbol: 'GST', decimals: 18 }).ok, true);
  });
  it('rejects ETH symbol', () => {
    const r = assertBrandingLaw({ symbol: 'ETH' });
    assert.equal(r.ok, false);
    assert.ok(r.violations.some(v => /symbol/.test(v)));
  });
  it('rejects wrong decimals', () => {
    assert.equal(assertBrandingLaw({ decimals: 6 }).ok, false);
  });
  it('accumulates 3 violations for fully wrong metadata', () => {
    const r = assertBrandingLaw({ name: 'Ethereum', symbol: 'ETH', decimals: 6 });
    assert.equal(r.violations.length, 3);
  });
  it('detects ETH brand leak in non-exempt file', () => {
    assert.equal(assertNoBrandLeak('symbol = "ETH"', { filePath: 'Token.sol' }).ok, false);
  });
  it('exempts bridge paths from leak check', () => {
    assert.equal(assertNoBrandLeak('symbol = "ETH"', { filePath: 'contracts/src/bridge/Adapter.sol' }).ok, true);
  });
});

// ─── 3. Policy engine ────────────────────────────────────────────────────────
describe('policy-engine', async () => {
  const { evaluate, enforce } = await import(`${SRC}/policy/policy-engine.js`);

  it('allows READ scan unconditionally', () => {
    assert.equal(evaluate({ mode: 'READ', action: 'scan' }).decision, 'ALLOW');
  });
  it('denies WRITE/apply (GSA_APPLY_ENABLED defaults false)', () => {
    const r = evaluate({ mode: 'WRITE', action: 'apply' });
    assert.equal(r.decision, 'DENY');
    assert.ok(r.reasons.some(s => /apply is disabled/.test(s)));
  });
  it('denies write to non-allowlisted path', () => {
    assert.equal(evaluate({ mode: 'WRITE', action: 'apply', filePath: '/etc/passwd' }).decision, 'DENY');
  });
  it('denies constitutional routing violation', () => {
    const r = evaluate({ mode: 'READ', action: 'plan', patch: { routeCheck: { src: 903, dst: 14000101 } } });
    assert.equal(r.decision, 'DENY');
    assert.ok(r.reasons.some(v => /ROUTING_LAW_VIOLATION/.test(v)));
  });
  it('throws PolicyDeniedError from enforce()', () => {
    assert.throws(
      () => enforce({ mode: 'WRITE', action: 'apply' }),
      err => err.code === 'POLICY_DENIED',
    );
  });
});

// ─── 4. OGB bundle verifier ─────────────────────────────────────────────────
describe('ogb-verifier', async () => {
  const { verifyBundle, verifyBundleJson, isBundleVerified } =
    await import(`${SRC}/bundles/ogb-verifier.js`);

  it('verifies a valid bundle', () => {
    const r = verifyBundle(makeBundle());
    assert.equal(r.ok, true, `expected ok — got: ${r.reason}`);
    assert.equal(r.hash.length, 64);
  });
  it('rejects expired bundle', () => {
    const r = verifyBundle(makeBundle({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    assert.equal(r.ok, false);
    assert.match(r.reason, /EXPIRED/);
  });
  it('detects Merkle root tampering', () => {
    const r = verifyBundle(makeBundle({ merkleRoot: 'dead' + '0'.repeat(60) }));
    assert.equal(r.ok, false);
    assert.match(r.reason, /MERKLE_MISMATCH/);
  });
  it('rejects replay of same uid', () => {
    const uid     = `replay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const bundle1 = makeBundle({ uid });
    verifyBundle(bundle1); // consume it
    const bundle2 = makeBundle({ uid }); // same uid → replay
    const r = verifyBundle(bundle2);
    assert.equal(r.ok, false);
    assert.match(r.reason, /REPLAY/);
  });
  it('rejects insufficient signatures', () => {
    const r = verifyBundle(makeBundle({ signatures: [], threshold: 2 }));
    assert.equal(r.ok, false);
    assert.match(r.reason, /THRESHOLD/);
  });
  it('rejects missing required fields', () => {
    const r = verifyBundle({ uid: 'x-only' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /missing field/);
  });
  it('isBundleVerified returns true after successful verify', () => {
    const r = verifyBundle(makeBundle());
    if (r.ok) assert.equal(isBundleVerified(r.hash), true);
  });
  it('verifyBundleJson accepts valid JSON string', () => {
    const r = verifyBundleJson(JSON.stringify(makeBundle()));
    assert.equal(r.ok, true);
  });
  it('verifyBundleJson rejects invalid JSON', () => {
    const r = verifyBundleJson('not-json{{{');
    assert.equal(r.ok, false);
    assert.match(r.reason, /PARSE_ERROR/);
  });
});

// ─── 5. Diagnostician ────────────────────────────────────────────────────────
describe('diagnostician', async () => {
  const { diagnose, classifyFinding } =
    await import(`${SRC}/agent/roles/diagnostician.js`);

  it('classifies npm-audit finding as security', () => {
    const i = classifyFinding({ severity: 'high', name: 'lodash', description: 'CVE-2021 prototype pollution', tool: 'npm-audit' });
    assert.equal(i.category, 'security');
  });
  it('classifies ETH mention as branding', () => {
    const i = classifyFinding({ severity: 'medium', name: 'ETH leak', description: 'symbol uses ETH instead of GST' });
    assert.equal(i.category, 'branding');
  });
  it('diagnose sorts incidents — critical first', () => {
    const result = diagnose({
      npmFindings:     [{ severity: 'critical', name: 'pkg',  description: 'CVE'       }],
      lintFindings:    [{ severity: 'low',      name: 'lint', description: 'unused-var' }],
      semgrepFindings: [],
      brandFindings:   [],
    });
    assert.equal(result.incidents[0].severity, 'critical');
    assert.equal(result.summary.hasCritical, true);
  });
  it('diagnose empty inputs → no incidents', () => {
    const r = diagnose({ npmFindings: [], lintFindings: [], semgrepFindings: [], brandFindings: [] });
    assert.equal(r.incidents.length, 0);
    assert.equal(r.summary.hasCritical, false);
  });
});

// ─── 6. Content-addressable storage ─────────────────────────────────────────
describe('CAS', async () => {
  const { put, get, has, hashOf } = await import(`${SRC}/storage/cas.js`);

  it('stores and retrieves an object', () => {
    const obj  = { foo: 'bar', ts: Date.now() };
    const hash = put(obj);
    assert.equal(hash.length, 64);
    assert.deepEqual(get(hash), obj);
  });
  it('has() returns false for unknown hash', () => assert.equal(has('0'.repeat(64)), false));
  it('hashOf is deterministic',  () => assert.equal(hashOf({ a: 1 }), hashOf({ a: 1 })));
  it('put is idempotent', () => {
    const obj = { idempotent: true };
    assert.equal(put(obj, 'idem'), put(obj, 'idem'));
  });
});

// ─── 7. Auth ─────────────────────────────────────────────────────────────────
describe('auth', async () => {
  const { sign, verifyHmac, outboundHeaders } =
    await import(`${SRC}/security/auth.js`);

  it('sign produces non-empty hex string', () => assert.ok(sign('hello').length > 0));
  it('verifyHmac accepts valid signature', () => {
    const ts   = Date.now();
    const body = '{"test":1}';
    const sig  = sign(body, ts);
    assert.equal(verifyHmac(body, sig, String(ts)).ok, true);
  });
  it('verifyHmac rejects wrong signature', () => {
    assert.equal(verifyHmac('body', 'deadbeef' + '0'.repeat(56), String(Date.now())).ok, false);
  });
  it('verifyHmac rejects stale timestamp (>5 min)', () => {
    const ts   = Date.now() - 6 * 60 * 1000;
    const body = '{}';
    const sig  = sign(body, ts);
    const r    = verifyHmac(body, sig, String(ts));
    assert.equal(r.ok, false);
    assert.match(r.reason, /timestamp_skew/);
  });
  it('outboundHeaders has all required fields', () => {
    const h = outboundHeaders('{}');
    assert.ok(h['X-HMAC-Signature']);
    assert.ok(h['X-HMAC-Timestamp']);
    assert.ok(h['X-Agent-ID']);
  });
});
