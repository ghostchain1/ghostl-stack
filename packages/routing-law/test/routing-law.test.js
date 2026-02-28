import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRoutingLaw } from '../index.js';

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
