import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMutationOrigin,
  assertResolutionLayer,
  decisionDigest,
  evaluatePolicyDecision
} from '../index.js';

test('allows resolution from L1 to lower layers', () => {
  const result = assertResolutionLayer('L1', 'L3');
  assert.equal(result.ok, true);
});

test('blocks resolution from L3 to L1-owned records', () => {
  assert.throws(() => assertResolutionLayer('L3', 'L1'), /ghostdns_resolution_blocked/);
});

test('only allows mutations on L1', () => {
  assert.equal(assertMutationOrigin('L1').ok, true);
  assert.throws(() => assertMutationOrigin('L2'), /ghostdns_mutation_blocked/);
});

test('produces stable digest for decision payload', () => {
  const decision = evaluatePolicyDecision({ action: 'resolve', requestLayer: 'L2', recordLayer: 'L3' });
  const digestA = decisionDigest(decision);
  const digestB = decisionDigest(decision);
  assert.equal(digestA, digestB);
  assert.equal(digestA.length, 64);
});
