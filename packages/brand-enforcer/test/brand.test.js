/**
 * @file test/brand.test.js
 * @description Tests for @ghostchain/brand-enforcer
 *
 * Run: node --test packages/brand-enforcer/test/brand.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  validateNoEthLeaks,
  validateTokenMetadata,
  validateUIStrings,
  loadBrandSpec,
  scanRepo,
  BRAND,
} from '../index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------
// 1. BRAND constant sanity
// ---------------------------------------------------------------------------
describe('BRAND constants', () => {
  it('has canonical name Ghost', () => assert.equal(BRAND.name, 'Ghost'));
  it('has canonical symbol GST', () => assert.equal(BRAND.symbol, 'GST'));
  it('has canonical decimals 18', () => assert.equal(BRAND.decimals, 18));
  it('has canonical chain GhostChain', () => assert.equal(BRAND.chain, 'GhostChain'));
});

// ---------------------------------------------------------------------------
// 2. validateTokenMetadata
// ---------------------------------------------------------------------------
describe('validateTokenMetadata', () => {
  it('passes for canonical metadata', () => {
    const v = validateTokenMetadata({ name: 'Ghost', symbol: 'GST', decimals: 18 });
    assert.equal(v.length, 0);
  });

  it('fails CRITICAL for wrong name', () => {
    const v = validateTokenMetadata({ name: 'Ethereum', symbol: 'GST', decimals: 18 });
    assert.equal(v.length, 1);
    assert.equal(v[0].ruleId, 'BRAND-META-001');
    assert.equal(v[0].severity, 'CRITICAL');
  });

  it('fails CRITICAL for wrong symbol', () => {
    const v = validateTokenMetadata({ name: 'Ghost', symbol: 'ETH', decimals: 18 });
    assert.equal(v.length, 1);
    assert.equal(v[0].ruleId, 'BRAND-META-002');
  });

  it('fails CRITICAL for wrong decimals', () => {
    const v = validateTokenMetadata({ name: 'Ghost', symbol: 'GST', decimals: 6 });
    assert.equal(v.length, 1);
    assert.equal(v[0].ruleId, 'BRAND-META-003');
  });

  it('accumulates multiple violations', () => {
    const v = validateTokenMetadata({ name: 'Ether', symbol: 'ETH', decimals: 6 });
    assert.equal(v.length, 3);
  });

  it('ignores missing fields (partial metadata objects)', () => {
    const v = validateTokenMetadata({ decimals: 18 }); // no name or symbol — valid partial
    assert.equal(v.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. validateNoEthLeaks
// ---------------------------------------------------------------------------
describe('validateNoEthLeaks — detection', () => {
  it('detects ETH symbol assignment in Solidity', () => {
    const content = `string public symbol = "ETH";`;
    const v = validateNoEthLeaks(content, 'Token.sol');
    assert.ok(v.length > 0, 'expected at least one violation');
    assert.equal(v[0].ruleId, 'BRAND-001');
  });

  it('detects Ethereum token name in Solidity', () => {
    const content = `string public tokenName = "Ethereum";`;
    const v = validateNoEthLeaks(content, 'Token.sol');
    assert.ok(v.some(x => x.ruleId === 'BRAND-002'));
  });

  it('passes for canonical GST/Ghost file', () => {
    const content = `
      string public constant GHOST_SYMBOL = "GST";
      string public constant GHOST_NAME   = "Ghost";
      uint8  public constant GHOST_DECIMALS = 18;
    `;
    const v = validateNoEthLeaks(content, 'GhostToken.sol');
    assert.equal(v.length, 0);
  });

  it('brand-enforcer-ignore suppresses line violations', () => {
    const content = `string public symbol = "ETH"; // brand-enforcer-ignore`;
    const v = validateNoEthLeaks(content, 'BridgeAdapter.sol');
    assert.equal(v.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. Bridge allowlist exemptions
// ---------------------------------------------------------------------------
describe('validateNoEthLeaks — bridge allowlist', () => {
  it('exempts files in bridge/ directories', () => {
    const content = `// L1 ETH bridge deposit: symbol = "ETH"`;
    const v = validateNoEthLeaks(content, 'contracts/src/bridge/L1BridgeAdapter.sol');
    assert.equal(v.length, 0, 'bridge path should be exempt');
  });

  it('exempts files matching extraAllowlistPaths', () => {
    const content = `symbol: "ETH"`;
    const v = validateNoEthLeaks(content, 'scripts/migrators/old-eth-migrator.ts', ['migrators']);
    assert.equal(v.length, 0);
  });

  it('does NOT exempt ordinary contract files', () => {
    const content = `string public symbol = "ETH";`;
    const v = validateNoEthLeaks(content, 'contracts/src/token/GhostToken.sol');
    assert.ok(v.length > 0);
  });

  it('exempts node_modules', () => {
    const content = `symbol: "ETH"`;
    const v = validateNoEthLeaks(content, 'node_modules/ethers/src/token.js');
    assert.equal(v.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 5. validateUIStrings
// ---------------------------------------------------------------------------
describe('validateUIStrings', () => {
  it('flags ETH in title attribute (non-bridge context)', () => {
    const content = `<div title="ETH Balance">`;
    const v = validateUIStrings(content, 'apps/web/src/Dashboard.tsx');
    assert.ok(v.length > 0);
    assert.equal(v[0].ruleId, 'BRAND-UI-001');
  });

  it('passes when title uses GST', () => {
    const content = `<div title="GST Balance">`;
    const v = validateUIStrings(content, 'apps/web/src/Dashboard.tsx');
    assert.equal(v.length, 0);
  });

  it('exempts bridge-context UI strings (bridge keyword)', () => {
    const content = `<input placeholder="ETH bridge deposit amount">`;
    const v = validateUIStrings(content, 'apps/web/src/Bridge.tsx');
    assert.equal(v.length, 0); // file path has no "bridge" match but string has
  });

  it('exempts bridge file paths', () => {
    const content = `<div title="Ethereum L1 bridge">`;
    const v = validateUIStrings(content, 'contracts/src/bridge/UI.tsx');
    assert.equal(v.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 6. loadBrandSpec
// ---------------------------------------------------------------------------
describe('loadBrandSpec', () => {
  let tmpDir;
  before(() => { tmpDir = mkdtempSync(join(tmpdir(), 'brand-spec-')); });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('loads canonical spec.json successfully', () => {
    const spec = {
      name: 'Ghost', symbol: 'GST', decimals: 18, chain: 'GhostChain',
    };
    const p = join(tmpDir, 'spec.json');
    writeFileSync(p, JSON.stringify(spec));
    const loaded = loadBrandSpec(p);
    assert.equal(loaded.name, 'Ghost');
    assert.equal(loaded.symbol, 'GST');
  });

  it('throws when spec.name is wrong', () => {
    const bad = { name: 'Ethereum', symbol: 'GST', decimals: 18, chain: 'GhostChain' };
    const p = join(tmpDir, 'bad-name.json');
    writeFileSync(p, JSON.stringify(bad));
    assert.throws(() => loadBrandSpec(p), /spec\.name must be/);
  });

  it('throws when spec.symbol is wrong', () => {
    const bad = { name: 'Ghost', symbol: 'ETH', decimals: 18, chain: 'GhostChain' };
    const p = join(tmpDir, 'bad-sym.json');
    writeFileSync(p, JSON.stringify(bad));
    assert.throws(() => loadBrandSpec(p), /spec\.symbol must be/);
  });

  it('throws when file is missing', () => {
    assert.throws(() => loadBrandSpec('/nonexistent/spec.json'), /cannot load spec/);
  });
});

// ---------------------------------------------------------------------------
// 7. scanRepo integration (temp directory)
// ---------------------------------------------------------------------------
describe('scanRepo integration', () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ghostbrand-scan-'));
    // Create a canonical brand spec
    mkdirSync(join(tmpDir, 'docs/brand'), { recursive: true });
    writeFileSync(join(tmpDir, 'docs/brand/spec.json'), JSON.stringify({
      name: 'Ghost', symbol: 'GST', decimals: 18, chain: 'GhostChain',
    }));
  });

  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns zero violations for a clean repo', () => {
    writeFileSync(join(tmpDir, 'GhostToken.sol'), `
      string public constant GHOST_SYMBOL = "GST";
      uint8  public constant GHOST_DECIMALS = 18;
    `);
    const result = scanRepo(tmpDir, { validateSpec: true });
    assert.equal(result.summary.passed, true, `Unexpected violations: ${JSON.stringify(result.violations)}`);
  });

  it('detects ETH symbol in a new file', () => {
    writeFileSync(join(tmpDir, 'BadToken.sol'), `string public symbol = "ETH";`);
    const result = scanRepo(tmpDir, { validateSpec: false });
    assert.ok(result.violations.some(v => v.ruleId === 'BRAND-001'),
      'expected BRAND-001 for ETH symbol');
  });

  it('exempts bridge directory from ETH violations', () => {
    mkdirSync(join(tmpDir, 'bridge'), { recursive: true });
    writeFileSync(join(tmpDir, 'bridge/L1Adapter.sol'), `// deposit ETH symbol = "ETH"`);
    const result = scanRepo(tmpDir, { validateSpec: false });
    const bridgeViolations = result.violations.filter(v => v.file.includes('bridge/'));
    assert.equal(bridgeViolations.length, 0, 'bridge directory should be exempt');
  });

  it('reports scanned and exempt counts', () => {
    const result = scanRepo(tmpDir, { validateSpec: false });
    assert.ok(result.scanned >= 0);
    assert.ok(result.exempt >= 0);
  });

  it('spec validation fails with wrong spec.json', () => {
    const badSpecDir = mkdtempSync(join(tmpdir(), 'badspec-'));
    mkdirSync(join(badSpecDir, 'docs/brand'), { recursive: true });
    writeFileSync(join(badSpecDir, 'docs/brand/spec.json'), JSON.stringify({
      name: 'Ethereum', symbol: 'ETH', decimals: 18, chain: 'EthChain',
    }));
    const result = scanRepo(badSpecDir, { validateSpec: true });
    assert.ok(result.violations.some(v => v.ruleId === 'BRAND-SPEC-001' || v.severity === 'CRITICAL'));
    rmSync(badSpecDir, { recursive: true, force: true });
  });
});
