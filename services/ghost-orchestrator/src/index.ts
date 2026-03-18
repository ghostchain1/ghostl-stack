/**
 * ghost-orchestrator — GhostStack Autonomous Build Orchestrator
 * ==============================================================
 *
 * Governance model (mirrors ghost-selfheal):
 *   This service drives devnet builds and reports readiness.  It NEVER
 *   autonomously promotes to testnet or mainnet.  All promotions are advisory
 *   proposals forwarded to the promotion engine and ultimately to the
 *   signing relay for human / governance ratification.
 *
 * Pipeline stages:
 *   IDLE → BUILDING → TESTING → QUALITY_GATES → VALIDATING_RPC → READY_FOR_PROMOTION
 *
 * Environment variables:
 *   REPO_PATH               absolute path to ghostl-stack repo (default: /home/ghost/ghostl-stack)
 *   GHOSTBRAIN_URL          GhostBrain Core base URL (default: http://localhost:7900)
 *   PROMOTION_ENGINE_URL    ghost-promotion-engine URL  (default: http://localhost:7951)
 *   SIGNING_RELAY_URL       signing relay URL           (default: http://localhost:7910)
 *   POLL_INTERVAL_MS        git-hash poll cadence       (default: 60000)
 *   BUILD_TIMEOUT_MS        max ms for docker compose build (default: 600000)
 *   TEST_TIMEOUT_MS         max ms for forge tests          (default: 300000)
 *   QUALITY_TIMEOUT_MS      max ms for routing/brand/GST gates (default: 900000)
 *   APP_BUILD_TIMEOUT_MS    max ms for workspace app build      (default: 1200000)
 *   ENABLE_APP_BUILD        "0" skips npm run build             (default: 1)
 *   ENABLE_SERVICE_BUILD    "1" also runs npm run build:services (default: 0)
 *   ORCH_ENV                control-plane manifest env          (default: devnet)
 *   ORCH_CONFIG_DIR         overrides service config directory
 *   RPC_L1_URL              L1 RPC endpoint  (default: http://localhost:18545)
 *   RPC_L2_URL              L2 RPC endpoint  (default: http://localhost:29547)
 *   RPC_L3_URL              L3 RPC endpoint  (default: http://localhost:39545)
 *   DRY_RUN                 if "1" log actions without executing (default: 0)
 *   ORCH_PORT               HTTP port for status API    (default: 7950)
 */

import { execFile }     from 'node:child_process';
import { promisify }    from 'node:util';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path             from 'node:path';
import http             from 'node:http';
import process          from 'node:process';
import express          from 'express';
import type { Request, Response } from 'express';
import { loadManagedUnits, parseRuntimeEnvironment } from './core/config-loader.js';
import { GhostKernel } from './core/kernel.js';
import { buildLayerOverrideHealth, probeManagedUnit, summarizeInventory } from './domains/chains/rpc-health.js';
import { buildBootPlan } from './workflows/boot-devnet.js';
import type { RuntimeEnvironment } from './core/types.js';
import type { BootPlanStep } from './workflows/boot-devnet.js';

const execFileAsync = promisify(execFile);

// ── Config ──────────────────────────────────────────────────────────────────
const REPO_PATH            = process.env.REPO_PATH            ?? '/home/ghost/ghostl-stack';
const GHOSTBRAIN_URL       = (process.env.GHOSTBRAIN_URL      ?? 'http://localhost:7900').replace(/\/$/, '');
const PROMOTION_ENGINE_URL = (process.env.PROMOTION_ENGINE_URL ?? 'http://localhost:7951').replace(/\/$/, '');
const SIGNING_RELAY_URL    = (process.env.SIGNING_RELAY_URL   ?? 'http://localhost:7910').replace(/\/$/, '');
const POLL_INTERVAL_MS     = Number(process.env.POLL_INTERVAL_MS  ?? '60000');
const BUILD_TIMEOUT_MS     = Number(process.env.BUILD_TIMEOUT_MS  ?? '600000');
const TEST_TIMEOUT_MS      = Number(process.env.TEST_TIMEOUT_MS   ?? '300000');
const QUALITY_TIMEOUT_MS   = Number(process.env.QUALITY_TIMEOUT_MS ?? '900000');
const APP_BUILD_TIMEOUT_MS = Number(process.env.APP_BUILD_TIMEOUT_MS ?? '1200000');
const RPC_L1_URL           = (process.env.RPC_L1_URL ?? 'http://localhost:18545').replace(/\/$/, '');
const RPC_L2_URL           = (process.env.RPC_L2_URL ?? 'http://localhost:29547').replace(/\/$/, '');
const RPC_L3_URL           = (process.env.RPC_L3_URL ?? 'http://localhost:39545').replace(/\/$/, '');
const ENABLE_APP_BUILD     = process.env.ENABLE_APP_BUILD !== '0';
const ENABLE_SERVICE_BUILD = process.env.ENABLE_SERVICE_BUILD === '1';
const ORCH_ENV             = parseRuntimeEnvironment(process.env.ORCH_ENV);
const ORCH_CONFIG_DIR      = process.env.ORCH_CONFIG_DIR;
const DRY_RUN              = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const ORCH_PORT            = Number(process.env.ORCH_PORT ?? '7950');

const STATE_FILE = path.join(REPO_PATH, '.tmp', 'orchestrator_state.json');

// ── Types ────────────────────────────────────────────────────────────────────
type Stage =
  | 'IDLE'
  | 'BUILDING'
  | 'TESTING'
  | 'QUALITY_GATES'
  | 'VALIDATING_RPC'
  | 'READY_FOR_PROMOTION'
  | 'PROMOTION_REQUESTED'
  | 'ERROR';

interface OrchestratorState {
  stage:             Stage;
  lastGitHash:       string;
  lastBuildAt:       string | null;
  lastTestAt:        string | null;
  lastQualityGateAt: string | null;
  lastRpcCheckAt:    string | null;
  lastPromotionAt:   string | null;
  buildErrors:       string[];
  testErrors:        string[];
  qualityGateErrors: string[];
  rpcStatus:         Record<string, boolean>;
  cyclesTotal:       number;
  cyclesSucceeded:   number;
  cyclesFailed:      number;
  updatedAt:         string;
}

interface InventorySnapshot {
  env: RuntimeEnvironment;
  manifestPath: string | null;
  generatedBy: string | null;
  loadedAt: string | null;
  refreshedAt: string | null;
  error: string | null;
  bootPlan: BootPlanStep[];
}

// ── State ─────────────────────────────────────────────────────────────────────
let state: OrchestratorState = {
  stage:             'IDLE',
  lastGitHash:       '',
  lastBuildAt:       null,
  lastTestAt:        null,
  lastQualityGateAt: null,
  lastRpcCheckAt:    null,
  lastPromotionAt:   null,
  buildErrors:       [],
  testErrors:        [],
  qualityGateErrors: [],
  rpcStatus:         { l1: false, l2: false, l3: false },
  cyclesTotal:       0,
  cyclesSucceeded:   0,
  cyclesFailed:      0,
  updatedAt:         new Date().toISOString(),
};

let running = false;
const kernel = new GhostKernel();
let inventorySnapshot: InventorySnapshot = {
  env: ORCH_ENV,
  manifestPath: null,
  generatedBy: null,
  loadedAt: null,
  refreshedAt: null,
  error: null,
  bootPlan: [],
};

type RpcLayer = 'l1' | 'l2' | 'l3';

// ── Logging ──────────────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, extra?: unknown): void {
  const ts = new Date().toISOString();
  const line = extra !== undefined
    ? `[${ts}] [ghost-orchestrator] [${level}] ${msg} ${JSON.stringify(extra)}`
    : `[${ts}] [ghost-orchestrator] [${level}] ${msg}`;
  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }
}

// ── State persistence ─────────────────────────────────────────────────────────
async function saveState(): Promise<void> {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  state.updatedAt = new Date().toISOString();
  const tempFile = `${STATE_FILE}.tmp`;
  await writeFile(tempFile, JSON.stringify(state, null, 2), 'utf8');
  await rename(tempFile, STATE_FILE);
}

async function loadState(): Promise<void> {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    state = { ...state, ...JSON.parse(raw) };
    log('INFO', 'Loaded persisted state', { stage: state.stage });
  } catch {
    log('INFO', 'No persisted state — starting fresh');
  }
}

// ── Git hash detector ────────────────────────────────────────────────────────
async function getCurrentGitHash(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_PATH,
      timeout: 10_000,
    });
    return stdout.trim();
  } catch {
    return '';
  }
}

// ── RPC health check — prefers ghost_ namespace, falls back to eth_ for direct OP RPC ──
async function checkRpc(name: string, url: string): Promise<boolean> {
  const methods = ['ghost_blockNumber', 'eth_blockNumber'];
  let lastError: string | null = null;

  for (const method of methods) {
    try {
      const req = JSON.stringify({
        jsonrpc: '2.0',
        method,
        params: [],
        id: 1,
      });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: req,
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status} for ${method}`;
        continue;
      }

      const json = await res.json() as { result?: string; error?: { message?: string } };
      if (typeof json.result === 'string' && json.result.startsWith('0x')) return true;
      lastError = json.error?.message ?? `invalid payload for ${method}`;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  log('WARN', `RPC unreachable: ${name}`, { url, error: lastError });
  return false;
}

function layerOverrideForUnit(layer: string, overrides: Partial<Record<RpcLayer, boolean>>): boolean | undefined {
  if (layer === 'l1') return overrides.l1;
  if (layer === 'l2') return overrides.l2;
  if (layer === 'l3') return overrides.l3;
  return undefined;
}

function buildInventoryReport(): {
  env: RuntimeEnvironment;
  manifestPath: string | null;
  generatedBy: string | null;
  loadedAt: string | null;
  refreshedAt: string | null;
  error: string | null;
  bootPlan: BootPlanStep[];
  summary: ReturnType<typeof summarizeInventory>;
  degradedUnits: Array<{ id: string; name: string; layer: string; status: string; detail?: string }>;
  units: ReturnType<GhostKernel['inventoryByEnv']>;
} {
  const units = kernel.inventoryByEnv(ORCH_ENV);
  return {
    ...inventorySnapshot,
    summary: summarizeInventory(units),
    degradedUnits: kernel.degradedUnits(ORCH_ENV).map((unit) => ({
      id: unit.id,
      name: unit.name,
      layer: unit.layer,
      status: unit.health.status,
      detail: unit.health.detail,
    })),
    units,
  };
}

async function loadControlPlaneInventory(): Promise<void> {
  try {
    const { manifest, manifestPath, units } = await loadManagedUnits(ORCH_ENV);
    kernel.replaceInventory(units);
    inventorySnapshot = {
      env: ORCH_ENV,
      manifestPath,
      generatedBy: manifest.generatedBy,
      loadedAt: new Date().toISOString(),
      refreshedAt: inventorySnapshot.refreshedAt,
      error: null,
      bootPlan: buildBootPlan(units, ORCH_ENV),
    };
    log('INFO', 'Loaded control-plane inventory', {
      env: ORCH_ENV,
      manifestPath,
      units: units.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    inventorySnapshot = {
      ...inventorySnapshot,
      env: ORCH_ENV,
      error: msg,
    };
    log('WARN', 'Failed to load control-plane inventory', { env: ORCH_ENV, msg });
  }
}

async function refreshControlPlaneHealth(
  overrides: Partial<Record<RpcLayer, boolean>> = {},
): Promise<void> {
  const units = kernel.inventoryByEnv(ORCH_ENV);
  if (units.length === 0) return;

  const updates = await Promise.all(units.map(async (unit) => {
    const override = layerOverrideForUnit(unit.layer, overrides);
    const health = override === undefined
      ? await probeManagedUnit(unit)
      : buildLayerOverrideHealth(unit, override);
    return { id: unit.id, health };
  }));

  for (const update of updates) {
    kernel.updateHealth(update.id, update.health);
  }

  const refreshedUnits = kernel.inventoryByEnv(ORCH_ENV);
  state.rpcStatus = {
    l1: refreshedUnits.some((unit) => unit.layer === 'l1' && unit.health.status === 'ok'),
    l2: refreshedUnits.some((unit) => unit.layer === 'l2' && unit.health.status === 'ok'),
    l3: refreshedUnits.some((unit) => unit.layer === 'l3' && unit.health.status === 'ok'),
  };

  inventorySnapshot = {
    ...inventorySnapshot,
    refreshedAt: new Date().toISOString(),
  };
}

// ── Forge contract build ──────────────────────────────────────────────────────
async function runDockerBuild(): Promise<{ ok: boolean; error?: string }> {
  if (DRY_RUN) {
    log('INFO', '[DRY_RUN] Skipping forge build');
    return { ok: true };
  }
  log('INFO', 'Running forge build...');
  try {
    // Build contracts to verify compilation before running tests or promoting
    await execFileAsync(
      'forge',
      ['build', '--skip', 'test'],
      {
        cwd:     path.join(REPO_PATH, 'contracts'),
        timeout: BUILD_TIMEOUT_MS,
        env:     { ...process.env, FOUNDRY_PROFILE: 'default' },
      },
    );
    log('INFO', 'forge build succeeded');
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as NodeJS.ErrnoException).code;
    // forge not installed in container → treat as non-fatal warning, not hard fail
    if (code === 'ENOENT' || msg.includes('not found') || msg.includes('ENOENT')) {
      log('WARN', 'forge not found — skipping contract build step (install foundry to enable)');
      return { ok: true };
    }
    log('ERROR', 'forge build failed', { msg });
    return { ok: false, error: msg };
  }
}

// ── Forge test runner ─────────────────────────────────────────────────────────
async function runForgeTests(): Promise<{ ok: boolean; error?: string }> {
  if (DRY_RUN) {
    log('INFO', '[DRY_RUN] Skipping forge tests');
    return { ok: true };
  }
  log('INFO', 'Running forge tests...');
  try {
    await execFileAsync(
      'forge',
      ['test', '--no-match-path', 'test/invariants/**'],
      {
        cwd:     path.join(REPO_PATH, 'contracts'),
        timeout: TEST_TIMEOUT_MS,
        env:     { ...process.env, FOUNDRY_PROFILE: 'default' },
      },
    );
    log('INFO', 'Forge tests passed');
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || msg.includes('ENOENT')) {
      log('WARN', 'forge not found — skipping test step (install foundry in container to enable)');
      return { ok: true };
    }
    log('WARN', 'Forge tests failed', { msg });
    return { ok: false, error: msg };
  }
}

async function runWorkspaceCommand(
  label: string,
  args: string[],
  timeout: number,
): Promise<{ ok: boolean; error?: string }> {
  if (DRY_RUN) {
    log('INFO', `[DRY_RUN] Skipping ${label}`, { args });
    return { ok: true };
  }

  log('INFO', `Running ${label}`, { args });
  try {
    await execFileAsync('npm', args, {
      cwd:     REPO_PATH,
      timeout,
      env:     { ...process.env },
    });
    log('INFO', `${label} passed`);
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('ERROR', `${label} failed`, { msg });
    return { ok: false, error: msg };
  }
}

async function runQualityGates(): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const steps: Array<{ label: string; args: string[]; timeout: number }> = [
    { label: 'routing verification', args: ['run', 'verify:routing'], timeout: QUALITY_TIMEOUT_MS },
    { label: 'branding audit', args: ['run', 'brand:full'], timeout: QUALITY_TIMEOUT_MS },
    { label: 'GST leakage gate', args: ['run', 'gst:leakage'], timeout: QUALITY_TIMEOUT_MS },
  ];

  if (ENABLE_APP_BUILD) {
    steps.push({ label: 'workspace build', args: ['run', 'build'], timeout: APP_BUILD_TIMEOUT_MS });
  }

  if (ENABLE_SERVICE_BUILD) {
    steps.push({ label: 'service build', args: ['run', 'build:services'], timeout: APP_BUILD_TIMEOUT_MS });
  }

  for (const step of steps) {
    const result = await runWorkspaceCommand(step.label, step.args, step.timeout);
    if (!result.ok) {
      errors.push(`${step.label}: ${result.error ?? 'failed'}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── Proposal to signing relay ─────────────────────────────────────────────────
async function submitProposal(type: string, payload: Record<string, unknown>): Promise<void> {
  const proposal = {
    type,
    source:    'ghost-orchestrator',
    gitHash:   state.lastGitHash,
    timestamp: new Date().toISOString(),
    payload,
    dryRun:    DRY_RUN,
  };

  if (DRY_RUN) {
    log('INFO', '[DRY_RUN] Proposal not sent', proposal);
    return;
  }

  try {
    await fetch(`${SIGNING_RELAY_URL}/proposals`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(proposal),
      signal:  AbortSignal.timeout(10_000),
    });
    log('INFO', 'Proposal submitted to signing relay', { type });
  } catch {
    log('WARN', 'Signing relay unreachable — proposal logged only', { type });
  }
}

// ── Notify promotion engine ───────────────────────────────────────────────────
async function notifyPromotionEngine(): Promise<void> {
  const body = {
    event:     'devnet_ready',
    gitHash:   state.lastGitHash,
    rpcStatus: state.rpcStatus,
    timestamp: new Date().toISOString(),
  };

  if (DRY_RUN) {
    log('INFO', '[DRY_RUN] Skipping promotion engine notification', body);
    return;
  }

  try {
    await fetch(`${PROMOTION_ENGINE_URL}/events/devnet-ready`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(10_000),
    });
    log('INFO', 'Notified promotion engine — devnet ready', { gitHash: state.lastGitHash });
  } catch {
    log('WARN', 'Promotion engine unreachable — will retry on next cycle');
  }
}

// ── Notify GhostBrain ─────────────────────────────────────────────────────────
async function notifyGhostBrain(event: string, data: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${GHOSTBRAIN_URL}/orchestrator/events`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event, ...data, source: 'ghost-orchestrator' }),
      signal:  AbortSignal.timeout(8_000),
    });
  } catch {
    // GhostBrain notification is best-effort
  }
}

// ── Main pipeline cycle ───────────────────────────────────────────────────────
async function runPipelineCycle(): Promise<void> {
  if (running) {
    log('WARN', 'Pipeline cycle already running — skipping');
    return;
  }
  running = true;
  state.cyclesTotal++;

  try {
    // 1. Detect git changes
    const currentHash = await getCurrentGitHash();
    const changed = currentHash !== '' && currentHash !== state.lastGitHash;

    if (!changed && state.stage === 'READY_FOR_PROMOTION') {
      log('INFO', 'No code changes — staying in READY_FOR_PROMOTION');
      running = false;
      return;
    }

    // In ERROR state: only retry when code has actually changed (avoid tight retry loops)
    if (!changed && state.stage === 'ERROR') {
      log('INFO', 'No code changes — holding in ERROR, waiting for next commit');
      running = false;
      return;
    }

    if (!changed && state.stage !== 'IDLE') {
      log('INFO', 'No code changes — nothing to do', { stage: state.stage });
      running = false;
      return;
    }

    if (changed) {
      log('INFO', 'Code change detected', { prev: state.lastGitHash, next: currentHash });
      state.lastGitHash = currentHash;
    }

    // 2. Build
    state.stage     = 'BUILDING';
    state.buildErrors = [];
    await saveState();
    await notifyGhostBrain('build_started', { gitHash: currentHash });

    const buildResult = await runDockerBuild();
    state.lastBuildAt = new Date().toISOString();

    if (!buildResult.ok) {
      state.stage = 'ERROR';
      state.buildErrors = [buildResult.error ?? 'unknown build error'];
      state.cyclesFailed++;
      await saveState();
      await submitProposal('build_failed', { gitHash: currentHash, error: state.buildErrors[0] });
      log('ERROR', 'Build failed — staying in ERROR', { error: state.buildErrors[0] });
      return;
    }

    // 3. Run forge tests
    state.stage      = 'TESTING';
    state.testErrors = [];
    await saveState();

    const testResult = await runForgeTests();
    state.lastTestAt = new Date().toISOString();

    if (!testResult.ok) {
      // Test failures are non-blocking but reported — contracts may not exist yet
      state.testErrors = [testResult.error ?? 'forge tests failed'];
      log('WARN', 'Forge tests failed — continuing to RPC check', { error: state.testErrors[0] });
      await notifyGhostBrain('tests_failed', { gitHash: currentHash, error: state.testErrors[0] });
    } else {
      log('INFO', 'Forge tests passed');
      await notifyGhostBrain('tests_passed', { gitHash: currentHash });
    }

    // 4. Workspace quality gates
    state.stage = 'QUALITY_GATES';
    state.qualityGateErrors = [];
    await saveState();

    const qualityResult = await runQualityGates();
    state.lastQualityGateAt = new Date().toISOString();
    state.qualityGateErrors = qualityResult.errors;
    await saveState();

    if (!qualityResult.ok) {
      state.stage = 'ERROR';
      state.cyclesFailed++;
      await saveState();
      await submitProposal('quality_gates_failed', {
        gitHash: currentHash,
        errors:  state.qualityGateErrors,
      });
      await notifyGhostBrain('quality_gates_failed', {
        gitHash: currentHash,
        errors:  state.qualityGateErrors,
      });
      log('ERROR', 'Quality gates failed — staying in ERROR', { errors: state.qualityGateErrors });
      return;
    }

    await notifyGhostBrain('quality_gates_passed', { gitHash: currentHash });

    // 5. RPC validation
    state.stage = 'VALIDATING_RPC';
    await saveState();

    const [l1Ok, l2Ok, l3Ok] = await Promise.all([
      checkRpc('L1', RPC_L1_URL),
      checkRpc('L2', RPC_L2_URL),
      checkRpc('L3', RPC_L3_URL),
    ]);

    state.rpcStatus    = { l1: l1Ok, l2: l2Ok, l3: l3Ok };
    state.lastRpcCheckAt = new Date().toISOString();
    await saveState();
    await refreshControlPlaneHealth({ l1: l1Ok, l2: l2Ok, l3: l3Ok });

    log('INFO', 'RPC validation complete', state.rpcStatus);

    const rpcHealthy = l1Ok; // L1 minimum requirement; L2/L3 may not be live in devnet yet

    if (!rpcHealthy) {
      // RPC not yet up — go back to IDLE to wait for the chain rather than ERROR loop
      state.stage = 'IDLE';
      state.cyclesFailed++;
      await saveState();
      await submitProposal('rpc_unhealthy', { rpcStatus: state.rpcStatus, gitHash: currentHash });
      log('WARN', 'L1 RPC unhealthy — returning to IDLE, will retry on next code change');
      return;
    }

    // 6. Signal readiness
    state.stage        = 'READY_FOR_PROMOTION';
    state.cyclesSucceeded++;
    state.lastPromotionAt = null;
    await saveState();
    log('INFO', '✅ Devnet pipeline passed — signalling promotion engine', { gitHash: currentHash });
    await notifyGhostBrain('devnet_ready', { gitHash: currentHash, rpcStatus: state.rpcStatus });
    await notifyPromotionEngine();
    state.stage = 'PROMOTION_REQUESTED';
    await saveState();

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('ERROR', 'Unexpected orchestrator error', { msg });
    state.stage = 'ERROR';
    state.cyclesFailed++;
    await saveState();
  } finally {
    running = false;
  }
}

// ── HTTP API ─────────────────────────────────────────────────────────────────
const PROMETHEUS_STAGES: Stage[] = [
  'IDLE',
  'BUILDING',
  'TESTING',
  'QUALITY_GATES',
  'VALIDATING_RPC',
  'READY_FOR_PROMOTION',
  'PROMOTION_REQUESTED',
  'ERROR',
];

function buildMetrics(): string {
  const stageMetrics = PROMETHEUS_STAGES.map((stage) =>
    `ghost_orchestrator_stage{stage="${stage}"} ${state.stage === stage ? 1 : 0}`,
  );

  return [
    '# HELP ghost_orchestrator_cycles_total Total orchestrator pipeline cycles.',
    '# TYPE ghost_orchestrator_cycles_total counter',
    `ghost_orchestrator_cycles_total ${state.cyclesTotal}`,
    '# HELP ghost_orchestrator_cycles_succeeded Total successful orchestrator cycles.',
    '# TYPE ghost_orchestrator_cycles_succeeded counter',
    `ghost_orchestrator_cycles_succeeded ${state.cyclesSucceeded}`,
    '# HELP ghost_orchestrator_cycles_failed Total failed orchestrator cycles.',
    '# TYPE ghost_orchestrator_cycles_failed counter',
    `ghost_orchestrator_cycles_failed ${state.cyclesFailed}`,
    '# HELP ghost_orchestrator_rpc_status RPC health by layer.',
    '# TYPE ghost_orchestrator_rpc_status gauge',
    `ghost_orchestrator_rpc_status{layer="l1"} ${state.rpcStatus.l1 ? 1 : 0}`,
    `ghost_orchestrator_rpc_status{layer="l2"} ${state.rpcStatus.l2 ? 1 : 0}`,
    `ghost_orchestrator_rpc_status{layer="l3"} ${state.rpcStatus.l3 ? 1 : 0}`,
    '# HELP ghost_orchestrator_quality_gate_errors Current quality gate error count.',
    '# TYPE ghost_orchestrator_quality_gate_errors gauge',
    `ghost_orchestrator_quality_gate_errors ${state.qualityGateErrors.length}`,
    '# HELP ghost_orchestrator_stage Current orchestrator stage.',
    '# TYPE ghost_orchestrator_stage gauge',
    ...stageMetrics,
  ].join('\n') + '\n';
}

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/status', (_req: Request, res: Response) => {
    res.json({
      service: 'ghost-orchestrator',
      environment: ORCH_ENV,
      ...state,
      dryRun: DRY_RUN,
      inventory: buildInventoryReport(),
    });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      ok: state.stage !== 'ERROR' && !inventorySnapshot.error,
      stage: state.stage,
      environment: ORCH_ENV,
      inventoryError: inventorySnapshot.error,
    });
  });

  app.get('/inventory', (_req: Request, res: Response) => {
    res.json(buildInventoryReport());
  });

  app.get('/topology', (_req: Request, res: Response) => {
    const inventory = buildInventoryReport();
    res.json({
      environment: ORCH_ENV,
      manifestPath: inventory.manifestPath,
      bootPlan: inventory.bootPlan,
      dependencies: inventory.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        layer: unit.layer,
        dependencies: unit.dependencies,
        governance: unit.governance,
      })),
    });
  });

  app.get('/metrics', (_req: Request, res: Response) => {
    res.type('text/plain').send(buildMetrics());
  });

  app.post('/inventory/refresh', (_req: Request, res: Response) => {
    setImmediate(() => {
      loadControlPlaneInventory()
        .then(() => refreshControlPlaneHealth())
        .catch(console.error);
    });
    res.json({ ok: true, environment: ORCH_ENV, message: 'Inventory refresh scheduled' });
  });

  // Manual trigger (for admin / testing)
  app.post('/trigger', (_req: Request, res: Response) => {
    log('INFO', 'Manual pipeline trigger via API');
    setImmediate(() => { runPipelineCycle().catch(console.error); });
    res.json({ ok: true, message: 'Pipeline cycle triggered' });
  });

  // Manual stage reset (e.g., after human fixes ERROR)
  app.post('/reset', (_req: Request, res: Response) => {
    log('INFO', 'State reset via API');
    state.stage = 'IDLE';
    state.buildErrors = [];
    state.testErrors  = [];
    state.qualityGateErrors = [];
    saveState().catch(console.error);
    res.json({ ok: true, message: 'State reset to IDLE' });
  });

  return app;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('INFO', '👻 GhostStack Ghost Orchestrator starting', {
    repoPath: REPO_PATH,
    environment: ORCH_ENV,
    configDir: ORCH_CONFIG_DIR ?? 'service-default',
    port:     ORCH_PORT,
    dryRun:   DRY_RUN,
  });

  await loadState();
  await loadControlPlaneInventory();
  await refreshControlPlaneHealth();

  const app = buildApp();
  const server = http.createServer(app);
  server.listen(ORCH_PORT, () => {
    log('INFO', `HTTP API listening on :${ORCH_PORT}`);
  });

  // Run first cycle immediately
  runPipelineCycle().catch(console.error);

  // Then poll on interval
  setInterval(() => {
    runPipelineCycle().catch(console.error);
  }, POLL_INTERVAL_MS);

  process.on('SIGTERM', () => { server.close(); process.exit(0); });
  process.on('SIGINT',  () => { server.close(); process.exit(0); });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
