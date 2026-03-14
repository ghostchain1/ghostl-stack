import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRoutingLaw, assertMainchain, MAINCHAIN_IDS, MAINCHAIN_NAMES } from '../index.js';

test('allows L3 -> L2 and L2 -> L1 transitions', () => {
  assert.equal(assertRoutingLaw({ sourceLayer: 'L3', targetLayer: 'L2' }).transition, 'L3->L2');
  assert.equal(assertRoutingLaw({ sourceLayer: 'L2', targetLayer: 'L1' }).transition, 'L2->L1');
});

test('blocks L3 -> L1 bypass', () => {
  assert.throws(
    () => assertRoutingLaw({ sourceLayer: 'L3', targetLayer: 'L1', intent: 'test_bypass' }),
    /routing_law_blocked:L3->L1/
  );
});

test('blocks non-L1 external egress', () => {
  assert.throws(
    () => assertRoutingLaw({ sourceLayer: 'L2', targetLayer: 'L1', externalEgress: true, intent: 'test_external' }),
    /routing_law_external_forbidden:L2->external/
  );
});

// ── Mainchain enforcement ─────────────────────────────────────────────────────

test('assertMainchain accepts GhostChain L1 (14000101)', () => {
  const result = assertMainchain(14000101);
  assert.equal(result.ok, true);
  assert.equal(result.chainId, 14000101);
  assert.equal(result.name, 'GhostChain');
  assert.equal(result.layer, 'L1');
});

test('assertMainchain accepts GhostL2 (901)', () => {
  const result = assertMainchain(901);
  assert.equal(result.name, 'GhostL2');
  assert.equal(result.layer, 'L2');
});

test('assertMainchain accepts GhostL3 (903)', () => {
  const result = assertMainchain(903);
  assert.equal(result.name, 'GhostL3');
  assert.equal(result.layer, 'L3');
});

test('assertMainchain rejects unknown chain ID', () => {
  assert.throws(() => assertMainchain(1),    /routing_law_unknown_chain:1/);
  assert.throws(() => assertMainchain(137),  /routing_law_unknown_chain:137/);
  assert.throws(() => assertMainchain(1337), /routing_law_unknown_chain:1337/);
});

test('assertMainchain accepts chain ID passed as string', () => {
  const result = assertMainchain('901');
  assert.equal(result.chainId, 901);
  assert.equal(result.name, 'GhostL2');
});

test('MAINCHAIN_IDS exposes correct numeric values', () => {
  assert.equal(MAINCHAIN_IDS.L1, 14000101);
  assert.equal(MAINCHAIN_IDS.L2, 901);
  assert.equal(MAINCHAIN_IDS.L3, 903);
});

test('MAINCHAIN_NAMES maps all three chain IDs', () => {
  assert.equal(MAINCHAIN_NAMES[14000101], 'GhostChain');
  assert.equal(MAINCHAIN_NAMES[901], 'GhostL2');
  assert.equal(MAINCHAIN_NAMES[903], 'GhostL3');
});

