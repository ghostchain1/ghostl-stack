import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

const CANONICAL = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

const makeTempConfig = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ghost-gas-engine-'));
  const chainsPath = path.join(dir, 'chains.json');
  const policiesPath = path.join(dir, 'policies.json');
  writeFileSync(
    chainsPath,
    JSON.stringify(
      {
        chains: [
          { key: 'l1', chainId: 14000101, name: 'GhostChain', type: 'L1', rpcUrl: 'http://l1', gasTokenSymbol: 'GHOST', gasTokenAddress: CANONICAL },
          { key: 'l2', chainId: 901, name: 'GhostL2', type: 'L2', rpcUrl: 'http://l2', gasTokenSymbol: 'GHOST', gasTokenAddress: CANONICAL },
          { key: 'l3', chainId: 903, name: 'GhostL3', type: 'L3', rpcUrl: 'http://l3', gasTokenSymbol: 'GHOST', gasTokenAddress: CANONICAL }
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
            chainKey: 'l1',
            chainId: 14000101,
            chainName: 'GhostChain',
            chainType: 'L1',
            gasTokenSymbol: 'GHOST',
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

describe('ghost-gas-engine config', () => {
  it('rejects non-canonical gas token address overrides', async () => {
    const { chainsPath, policiesPath } = makeTempConfig();
    await withEnv(
      {
        DATABASE_URL: 'postgres://ghost:ghostpass@localhost:5432/ghost',
        CHAINS_CONFIG_PATH: chainsPath,
        POLICIES_PATH: policiesPath,
        GAS_TOKEN_ADDRESS: '0x0000000000000000000000000000000000000000'
      },
      async () => {
        vi.resetModules();
        const mod = await import('../src/config.ts');
        expect(() => mod.loadChains()).toThrow(/GAS_TOKEN_ADDRESS must be/i);
      }
    );
  });

  it('normalizes gas token address to canonical', async () => {
    const { chainsPath, policiesPath } = makeTempConfig();
    await withEnv(
      {
        DATABASE_URL: 'postgres://ghost:ghostpass@localhost:5432/ghost',
        CHAINS_CONFIG_PATH: chainsPath,
        POLICIES_PATH: policiesPath
      },
      async () => {
        vi.resetModules();
        const mod = await import('../src/config.ts');
        const chains = mod.loadChains();
        expect(chains[0].gasTokenAddress).toBe(CANONICAL);
      }
    );
  });
});
