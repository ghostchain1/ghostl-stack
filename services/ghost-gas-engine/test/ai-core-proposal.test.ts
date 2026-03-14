import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

const CANONICAL = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

vi.mock('../src/db/index.js', () => ({
  query: vi.fn().mockResolvedValue([])
}));

const makeTempConfig = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ghost-gas-engine-'));
  const chainsPath = path.join(dir, 'chains.json');
  const policiesPath = path.join(dir, 'policies.json');
  writeFileSync(
    chainsPath,
    JSON.stringify(
      {
        chains: [
          { key: 'l2', chainId: 901, name: 'GhostL2', type: 'L2', rpcUrl: 'http://l2', gasTokenSymbol: 'GST', gasTokenAddress: CANONICAL }
        ]
      },
      null,
      2
    )
  );
  writeFileSync(
    policiesPath,
    JSON.stringify(
      {
        policies: [
          {
            chainKey: 'l2',
            chainId: 901,
            chainName: 'GhostL2',
            chainType: 'L2',
            gasTokenSymbol: 'GST',
            version: 'v1',
            baseMultiplier: 1,
            maxGasLimit: 30_000_000,
            safetyMarginPercent: 5,
            retry: { maxRetries: 3, backoffMs: 1000, multiplierStep: 1.2 },
            sequencerAware: false
          }
        ]
      },
      null,
      2
    )
  );
  return { chainsPath, policiesPath };
};

const withEnv = (overrides: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const prev = { ...process.env };
  Object.assign(process.env, overrides);
  return fn().finally(() => {
    process.env = prev;
  });
};

describe('ai-core policy proposals', () => {
  it('accepts policy proposal payloads', async () => {
    const { chainsPath, policiesPath } = makeTempConfig();
    await withEnv(
      {
        DATABASE_URL: 'postgres://ghost:ghostpass@localhost:5432/ghost',
        CHAINS_CONFIG_PATH: chainsPath,
        POLICIES_PATH: policiesPath,
        ADMIN_TOKEN: 'test-token'
      },
      async () => {
        vi.resetModules();
        const { registerAiCoreRoutes } = await import('../src/routes/ai-core.ts');
        const app = Fastify();
        await registerAiCoreRoutes(app);

        const response = await app.inject({
          method: 'POST',
          url: '/v1/ai-core/policy-proposals',
          headers: { 'x-admin-token': 'test-token' },
          payload: {
            chainKey: 'l2',
            policyKey: 'gas_limit',
            value: 30_000_000,
            explainability: {
              rationale: 'Congestion trending higher than policy ceiling.',
              assumptions: ['RPC latency within 200ms', 'Base fee remains stable'],
              expectedImpact: 'Reduce failed transactions during peak usage.',
              rollbackPlan: 'Revert to previous policy after 1 hour if congestion clears.',
              confidence: 0.71,
              modelVersion: 'risk-forecast-v1'
            }
          }
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.proposal.chainKey).toBe('l2');
        expect(body.proposal.policyValue).toBe('30000000');
        expect(body.proposal.evidenceHash).toMatch(/^0x[0-9a-f]{64}$/);

        await app.close();
      }
    );
  });

  it('requires upstream policy checkpoint when federation is enforced', async () => {
    const { chainsPath, policiesPath } = makeTempConfig();
    await withEnv(
      {
        DATABASE_URL: 'postgres://ghost:ghostpass@localhost:5432/ghost',
        CHAINS_CONFIG_PATH: chainsPath,
        POLICIES_PATH: policiesPath,
        ADMIN_TOKEN: 'test-token',
        CHAIN_POLICY_REQUIRED: '1'
      },
      async () => {
        vi.resetModules();
        const { registerAiCoreRoutes } = await import('../src/routes/ai-core.ts');
        const app = Fastify();
        await registerAiCoreRoutes(app);

        const response = await app.inject({
          method: 'POST',
          url: '/v1/ai-core/policy-proposals',
          headers: { 'x-admin-token': 'test-token' },
          payload: {
            chainKey: 'l2',
            policyKey: 'gas_limit',
            value: 30_000_000,
            explainability: {
              rationale: 'Federation requires upstream checkpoint.',
              assumptions: [],
              expectedImpact: 'Prevent unanchored proposals.',
              rollbackPlan: 'Provide checkpoint hash and retry.',
              confidence: 0.7
            }
          }
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error).toBe('missing_policy_checkpoint');

        await app.close();
      }
    );
  });
});
