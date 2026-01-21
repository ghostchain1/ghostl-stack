import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from '../src/engine/evaluator';
import type { PolicyBundle, DecisionInput } from '../src/engine/types';

const bundle: PolicyBundle = {
  apiVersion: 'ghostchain.io/v1',
  kind: 'PolicyBundle',
  metadata: { bundleId: 'test', version: '1' },
  policies: [
    {
      id: 'deny-high',
      priority: 100,
      appliesTo: { actions: ['TRANSFER'] },
      when: { 'resource.amountUSD': { gt: 1000 } },
      effect: { deny: { reason: 'amount_high' } }
    },
    {
      id: 'require-kyc',
      priority: 50,
      appliesTo: { actions: ['TRANSFER'] },
      when: { 'subject.kycLevel': { lt: 2 } },
      effect: { require: { controls: ['kyc_full'], disclosures: ['kyc_notice'] }, reason: 'kyc_low' }
    },
    {
      id: 'allow-default',
      priority: 1,
      appliesTo: { actions: ['TRANSFER'] },
      when: { 'subject.kycLevel': { gte: 2 } },
      effect: { allow: true, reason: 'kyc_ok' }
    }
  ]
};

const baseInput: DecisionInput = {
  requestId: 'req-1',
  subject: {
    type: 'wallet',
    walletAddress: '0x1',
    chainId: '901',
    kycLevel: '2'
  },
  action: 'TRANSFER',
  resource: { amountUSD: 100 },
  context: {}
};

describe('policy evaluator', () => {
  it('allows when no restrictive policy matches', () => {
    const result = evaluatePolicy(bundle, baseInput);
    expect(result.decision).toBe('allow');
  });

  it('denies when deny rule matches', () => {
    const result = evaluatePolicy(bundle, { ...baseInput, resource: { amountUSD: 2000 } });
    expect(result.decision).toBe('deny');
    expect(result.reasons).toContain('amount_high');
  });

  it('requires controls when require rule matches', () => {
    const result = evaluatePolicy(bundle, {
      ...baseInput,
      subject: { ...baseInput.subject, kycLevel: '1' }
    });
    expect(result.decision).toBe('allow_with_controls');
    expect(result.requiredControls).toContain('kyc_full');
  });

  it('prioritizes most restrictive effect', () => {
    const result = evaluatePolicy(bundle, {
      ...baseInput,
      resource: { amountUSD: 2500 },
      subject: { ...baseInput.subject, kycLevel: '1' }
    });
    expect(result.decision).toBe('deny');
  });
});
