import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertEndpointAllowlisted,
  assertExternalEgress,
  assertRoutingTransition,
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
