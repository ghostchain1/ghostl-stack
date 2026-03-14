import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertEndpointAllowlisted,
  assertExternalEgress,
  assertRoutingTransition,
  assertMainchainId,
  layerFromNumeric
} from '../index.js';

test('allows required hierarchical transitions', () => {
  assert.equal(assertRoutingTransition('L3', 'L2').transition, 'L3->L2');
  assert.equal(assertRoutingTransition('L2', 'L1').transition, 'L2->L1');
  assert.equal(assertRoutingTransition(layerFromNumeric(1), layerFromNumeric(2)).transition, 'L1->L2');
  assert.equal(assertRoutingTransition(layerFromNumeric('2'), layerFromNumeric('3')).transition, 'L2->L3');
});

test('blocks direct L3 to L1 transition', () => {
  assert.throws(
    () => assertRoutingTransition('L3', 'L1', { intent: 'test' }),
    /routing_guard_blocked:L3->L1/
  );
});

test('blocks non-L1 external egress', () => {
  assert.equal(assertExternalEgress('L1').transition, 'L1->external');
  assert.throws(() => assertExternalEgress('L2'), /routing_guard_blocked_external:L2->external/);
  assert.throws(() => assertExternalEgress('L3'), /routing_guard_blocked_external:L3->external/);
});

test('endpoint allowlist enforces policy when configured', () => {
  assert.equal(assertEndpointAllowlisted('https://l2.rpc', ['https://l2.rpc']).mode, 'allowlist');
  assert.throws(
    () => assertEndpointAllowlisted('https://evil.rpc', ['https://l2.rpc']),
    /endpoint_not_allowlisted/
  );
});

// ── Mainchain chain ID enforcement ────────────────────────────────────────────

test('assertMainchainId accepts GhostChain L1 (14000101)', () => {
  const r = assertMainchainId(14000101);
  assert.equal(r.ok, true);
  assert.equal(r.chainId, 14000101);
  assert.equal(r.name, 'GhostChain');
});

test('assertMainchainId accepts GhostL2 (901)', () => {
  const r = assertMainchainId(901);
  assert.equal(r.name, 'GhostL2');
});

test('assertMainchainId accepts GhostL3 (903)', () => {
  const r = assertMainchainId(903);
  assert.equal(r.name, 'GhostL3');
});

test('assertMainchainId accepts chain ID as string', () => {
  assert.equal(assertMainchainId('903').chainId, 903);
});

test('assertMainchainId rejects non-Ghost chain IDs', () => {
  assert.throws(() => assertMainchainId(1),     /routing_guard_unknown_chain:1/);
  assert.throws(() => assertMainchainId(137),   /routing_guard_unknown_chain:137/);
  assert.throws(() => assertMainchainId(42161), /routing_guard_unknown_chain:42161/);
});


test('allows required hierarchical transitions', () => {
  assert.equal(assertRoutingTransition('L3', 'L2').transition, 'L3->L2');
  assert.equal(assertRoutingTransition('L2', 'L1').transition, 'L2->L1');
  assert.equal(assertRoutingTransition(layerFromNumeric(1), layerFromNumeric(2)).transition, 'L1->L2');
  assert.equal(assertRoutingTransition(layerFromNumeric('2'), layerFromNumeric('3')).transition, 'L2->L3');
});

test('blocks direct L3 to L1 transition', () => {
  assert.throws(
    () => assertRoutingTransition('L3', 'L1', { intent: 'test' }),
    /routing_guard_blocked:L3->L1/
  );
});

test('blocks non-L1 external egress', () => {
  assert.equal(assertExternalEgress('L1').transition, 'L1->external');
  assert.throws(() => assertExternalEgress('L2'), /routing_guard_blocked_external:L2->external/);
  assert.throws(() => assertExternalEgress('L3'), /routing_guard_blocked_external:L3->external/);
});

test('endpoint allowlist enforces policy when configured', () => {
  assert.equal(assertEndpointAllowlisted('https://l2.rpc', ['https://l2.rpc']).mode, 'allowlist');
  assert.throws(
    () => assertEndpointAllowlisted('https://evil.rpc', ['https://l2.rpc']),
    /endpoint_not_allowlisted/
  );
});
