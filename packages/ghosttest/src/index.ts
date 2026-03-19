// GhostTest — GhostChain Smart Contract Testing Framework
// Provides describe/it/expect DSL + on-chain call assertions for GhostChain contracts.
// Works with forge test (Solidity) and this TypeScript layer (integration tests).

export type GhostTestLayer = 'l1' | 'l2' | 'l3';

export interface GhostTestSuiteOptions {
  layer?: GhostTestLayer;
  rpc?: string;
  timeout?: number;
}

export interface GhostTestContext {
  rpc: string;
  layer: GhostTestLayer;
  chainId: number;
}

export interface GhostTestResult {
  suite: string;
  test: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface GhostRunReport {
  passed: number;
  failed: number;
  total: number;
  results: GhostTestResult[];
  durationMs: number;
}

const GHOST_RPC: Record<GhostTestLayer, string> = {
  l1: 'http://localhost:18545',
  l2: 'http://localhost:7260',
  l3: 'http://localhost:7270',
};

const GHOST_CHAIN_IDS: Record<GhostTestLayer, number> = {
  l1: 14000101,
  l2: 901,
  l3: 903,
};

// ─── Global test registry ─────────────────────────────────────────────────────

interface SuiteEntry {
  suiteName: string;
  testName: string;
  fn: (ctx: GhostTestContext) => Promise<void>;
  opts: GhostTestSuiteOptions;
}

const _registry: SuiteEntry[] = [];
let _activeSuite = 'default';
let _activeSuiteOpts: GhostTestSuiteOptions = {};

/**
 * Define a test suite.
 * @example
 * ```ts
 * ghostDescribe('GhostToken transfers', { layer: 'l2' }, () => {
 *   ghostIt('should transfer GST', async (ctx) => {
 *     const balance = await ghostCall(ctx.rpc, tokenAddr, 'balanceOf', [alice]);
 *     ghostExpect(balance).toBeGreaterThan(0n);
 *   });
 * });
 * ```
 */
export function ghostDescribe(
  suiteName: string,
  optsOrFn: GhostTestSuiteOptions | (() => void),
  fn?: () => void,
): void {
  const prevSuite = _activeSuite;
  const prevOpts  = _activeSuiteOpts;
  _activeSuite     = suiteName;
  _activeSuiteOpts = typeof optsOrFn === 'function' ? {} : optsOrFn;
  const body       = typeof optsOrFn === 'function' ? optsOrFn : fn!;
  body();
  _activeSuite     = prevSuite;
  _activeSuiteOpts = prevOpts;
}

/** Define a test within a suite */
export function ghostIt(
  testName: string,
  fn: (ctx: GhostTestContext) => Promise<void>,
): void {
  _registry.push({
    suiteName: _activeSuite,
    testName,
    fn,
    opts: { ..._activeSuiteOpts },
  });
}

/** Run all registered tests */
export async function ghostRun(filter?: { suite?: string; test?: string }): Promise<GhostRunReport> {
  const start = Date.now();
  const results: GhostTestResult[] = [];

  const entries = _registry.filter(e => {
    if (filter?.suite && !e.suiteName.includes(filter.suite)) return false;
    if (filter?.test  && !e.testName.includes(filter.test))  return false;
    return true;
  });

  for (const entry of entries) {
    const layer   = entry.opts.layer ?? 'l2';
    const rpc     = entry.opts.rpc ?? GHOST_RPC[layer];
    const chainId = GHOST_CHAIN_IDS[layer];
    const ctx: GhostTestContext = { rpc, layer, chainId };
    const t = Date.now();

    try {
      await Promise.race([
        entry.fn(ctx),
        timeout(entry.opts.timeout ?? 30_000),
      ]);
      results.push({ suite: entry.suiteName, test: entry.testName, passed: true, durationMs: Date.now() - t });
    } catch (err) {
      results.push({
        suite: entry.suiteName,
        test:  entry.testName,
        passed: false,
        error:  String(err),
        durationMs: Date.now() - t,
      });
    }
  }

  const passed = results.filter(r => r.passed).length;
  const report: GhostRunReport = {
    passed,
    failed: results.length - passed,
    total:  results.length,
    results,
    durationMs: Date.now() - start,
  };

  printReport(report);
  return report;
}

// ─── On-chain helpers ─────────────────────────────────────────────────────────

/** Call a contract view function via ghost_call */
export async function ghostCall<T = string>(
  rpc: string,
  to: string,
  selector: string,  // 4-byte hex OR full ABI signature (simplified)
  args: unknown[] = [],
): Promise<T> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'ghost_call',
      params: [{ to, data: selector + encodeCallArgs(args) }, 'latest'],
    }),
  });
  if (!res.ok) throw new Error(`ghostCall: ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`ghostCall: ${json.error.message}`);
  return json.result as T;
}

/** Get GST balance at address */
export async function ghostBalance(rpc: string, address: string): Promise<bigint> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ghost_getBalance', params: [address, 'latest'] }),
  });
  const json = (await res.json()) as { result: string };
  return BigInt(json.result);
}

// ─── Assertions ───────────────────────────────────────────────────────────────

export interface GhostMatcher<T> {
  toBe(expected: T): void;
  toEqual(expected: T): void;
  toBeGreaterThan(expected: T extends bigint ? bigint : number): void;
  toBeLessThan(expected: T extends bigint ? bigint : number): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toContain(sub: string): void;
  toMatch(pattern: RegExp): void;
  not: GhostMatcher<T>;
}

/** Assertion helper */
export function ghostExpect<T>(actual: T): GhostMatcher<T> {
  return buildMatcher(actual, false);
}

function buildMatcher<T>(actual: T, negate: boolean): GhostMatcher<T> {
  function assert(condition: boolean, msg: string) {
    const pass = negate ? !condition : condition;
    if (!pass) throw new Error(`GhostExpect${negate ? '.not' : ''}: ${msg}`);
  }

  return {
    toBe: (expected) => assert(actual === expected, `expected ${String(actual)} to be ${String(expected)}`),
    toEqual: (expected) => assert(JSON.stringify(actual) === JSON.stringify(expected), `not equal`),
    toBeGreaterThan: (expected) => assert((actual as bigint) > (expected as bigint), `${String(actual)} not > ${String(expected)}`),
    toBeLessThan: (expected) => assert((actual as bigint) < (expected as bigint), `${String(actual)} not < ${String(expected)}`),
    toBeNull: () => assert(actual === null, `expected null, got ${String(actual)}`),
    toBeUndefined: () => assert(actual === undefined, `expected undefined, got ${String(actual)}`),
    toContain: (sub) => assert(String(actual).includes(sub), `'${String(actual)}' does not contain '${sub}'`),
    toMatch: (pattern) => assert(pattern.test(String(actual)), `'${String(actual)}' does not match ${String(pattern)}`),
    not: buildMatcher(actual, !negate),
  };
}

// ─── Internals ────────────────────────────────────────────────────────────────

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`GhostTest: timeout after ${ms}ms`)), ms));
}

function encodeCallArgs(_args: unknown[]): string {
  return '';  // Simplified — real encoding uses ghost-sdk-core ABI encoder
}

function printReport(report: GhostRunReport): void {
  console.log(`\n[GhostTest] Results: ${report.passed}/${report.total} passed (${report.durationMs}ms)`);
  for (const r of report.results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(`  ${icon} ${r.suite} > ${r.test}${r.error ? `\n    ${r.error}` : ''}`);
  }
}

export { ghostDescribe as describe, ghostIt as it, ghostExpect as expect, ghostRun as run };
export default { describe: ghostDescribe, it: ghostIt, expect: ghostExpect, run: ghostRun };
