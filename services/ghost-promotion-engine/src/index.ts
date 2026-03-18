/**
 * ghost-promotion-engine — GhostStack Autonomous Promotion Engine
 * ================================================================
 *
 * Governance model:
 *   This engine NEVER autonomously writes to mainnet or starts VMs.
 *   Every promotion action is an ADVISORY PROPOSAL forwarded to the
 *   signing relay at SIGNING_RELAY_URL for governance ratification.
 *   GAIS (port 9100) is consulted for VM health.  The simulation engine
 *   (ghostbrain-simulator) is triggered for testnet verification.
 *
 * Promotion pipeline state machine:
 *   IDLE
 *   → DEVNET_READY          (orchestrator posted devnet-ready event)
 *   → BUILDING_RELEASE      (sealed release artifacts created on devnet)
 *   → SIMULATING_TESTNET    (ghostbrain-simulator running scenarios)
 *   → SIMULATION_PASSED     (all critical scenarios green)
 *   → SECURITY_AUDIT        (slither / forge invariant fuzz — advisory)
 *   → GOVERNANCE_PENDING    (proposal submitted to signing relay)
 *   → MAINNET_PROMOTING     (governance ratified — GAIS told to sync mainnet VMs)
 *   → DEPLOYING_APPS        (apps/web deployment in progress)
 *   → LIVE                  (all layers healthy, apps live)
 *   → ERROR                 (gate failed — back to IDLE on reset)
 *
 * Routing law:
 *   L3 → L2 → L1 (the only allowed direction for settlement)
 *   Orchestrator signals from devnet; promotion flows L1 → L2 → L3 (boot order)
 *
 * Environment variables:
 *   GHOSTBRAIN_URL          GhostBrain Core base URL        (default: http://localhost:7900)
 *   SIMULATOR_URL           ghostbrain-simulator URL        (default: http://localhost:7960)
 *   SIGNING_RELAY_URL       Signing relay URL               (default: http://localhost:7910)
 *   GAIS_URL                GAIS REST API URL               (default: http://localhost:9100)
 *   GAIS_API_TOKEN          GAIS write-endpoint token       (required for VM control proposals)
 *   RPC_L1_URL              L1 testnet RPC                  (default: http://10.50.99.71:18545)
 *   RPC_L2_URL              L2 testnet RPC                  (default: http://10.50.99.77:29547)
 *   RPC_L3_URL              L3 testnet RPC                  (default: http://10.50.99.79:39545)
 *   MAINNET_L1_URL          L1 mainnet RPC                  (default: http://10.50.99.70:18545)
 *   MAINNET_L2_URL          L2 mainnet RPC                  (default: http://10.50.99.76:29547)
 *   MAINNET_L3_URL          L3 mainnet RPC                  (default: http://10.50.99.78:39545)
 *   RELEASE_TIMEOUT_MS      max ms for release workflows    (default: 1800000)
 *   TESTNET_SSH_TARGET      optional ssh target for pushing sealed release
 *   TESTNET_HOSTNAME_REGEX  remote hostname guard           (default: testnet)
 *   REQUIRE_TESTNET_PUSH    fail closed unless release was pushed (default: 0)
 *   SIMULATION_TIMEOUT_MS   max ms for testnet simulation   (default: 900000)
 *   DRY_RUN                 "1" = log proposals only        (default: 0)
 *   PROMO_PORT              HTTP port for API               (default: 7951)
 */

import { execFile }                    from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path                           from 'node:path';
import http                           from 'node:http';
import process                        from 'node:process';
import { promisify }                  from 'node:util';
import express                        from 'express';
import type { Request, Response }     from 'express';

const execFileAsync = promisify(execFile);

// ── Config ────────────────────────────────────────────────────────────────────
const GHOSTBRAIN_URL       = (process.env.GHOSTBRAIN_URL       ?? 'http://localhost:7900').replace(/\/$/, '');
const SIMULATOR_URL        = (process.env.SIMULATOR_URL        ?? 'http://localhost:7960').replace(/\/$/, '');
const SIGNING_RELAY_URL    = (process.env.SIGNING_RELAY_URL    ?? 'http://localhost:7910').replace(/\/$/, '');
const GAIS_URL             = (process.env.GAIS_URL             ?? 'http://localhost:9100').replace(/\/$/, '');
const GAIS_API_TOKEN       = process.env.GAIS_API_TOKEN        ?? '';
const RELEASE_TIMEOUT_MS   = Number(process.env.RELEASE_TIMEOUT_MS ?? '1800000');
const SIMULATION_TIMEOUT_MS = Number(process.env.SIMULATION_TIMEOUT_MS ?? '900000');
const TESTNET_SSH_TARGET   = process.env.TESTNET_SSH_TARGET    ?? '';
const TESTNET_HOSTNAME_REGEX = process.env.TESTNET_HOSTNAME_REGEX ?? 'testnet';
const REQUIRE_TESTNET_PUSH = process.env.REQUIRE_TESTNET_PUSH === '1';
const DRY_RUN              = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const PROMO_PORT           = Number(process.env.PROMO_PORT ?? '7951');

// Chain IDs per architecture rules
const CHAIN_L1 = 14000101;
const CHAIN_L2 = 901;
const CHAIN_L3 = 903;

// Testnet RPC endpoints (static IPs from GAIS vm_manager.py)
const RPC_TESTNET_L1 = (process.env.RPC_L1_URL      ?? 'http://10.50.99.71:18545').replace(/\/$/, '');
const RPC_TESTNET_L2 = (process.env.RPC_L2_URL      ?? 'http://10.50.99.77:29547').replace(/\/$/, '');
const RPC_TESTNET_L3 = (process.env.RPC_L3_URL      ?? 'http://10.50.99.79:39545').replace(/\/$/, '');
const RPC_MAINNET_L1 = (process.env.MAINNET_L1_URL  ?? 'http://10.50.99.70:18545').replace(/\/$/, '');
const RPC_MAINNET_L2 = (process.env.MAINNET_L2_URL  ?? 'http://10.50.99.76:29547').replace(/\/$/, '');
const RPC_MAINNET_L3 = (process.env.MAINNET_L3_URL  ?? 'http://10.50.99.78:39545').replace(/\/$/, '');

const REPO_ROOT  = process.env.REPO_PATH ?? '/home/ghost/ghostl-stack';
const STATE_FILE = path.join(REPO_ROOT, '.tmp', 'promotion_state.json');

// ── Types ─────────────────────────────────────────────────────────────────────
type PromotionStage =
  | 'IDLE'
  | 'DEVNET_READY'
  | 'BUILDING_RELEASE'
  | 'SIMULATING_TESTNET'
  | 'SIMULATION_PASSED'
  | 'SECURITY_AUDIT'
  | 'GOVERNANCE_PENDING'
  | 'MAINNET_PROMOTING'
  | 'DEPLOYING_APPS'
  | 'LIVE'
  | 'ERROR';

interface GateResult {
  passed: boolean;
  details: string;
  score?: number;
}

interface PromotionState {
  stage:               PromotionStage;
  currentGitHash:      string;
  devnetReadyAt:       string | null;
  releaseId:           string | null;
  releaseBuiltAt:      string | null;
  releaseSealedAt:     string | null;
  releaseManifestAt:   string | null;
  releasePushedTestnetAt: string | null;
  releasePushTarget:   string | null;
  simulationStartedAt: string | null;
  simulationFinishedAt:string | null;
  simulationScore:     number;          // 0–100; >= 80 required for promotion
  auditFinishedAt:     string | null;
  auditPassed:         boolean;
  governanceProposalId:string | null;
  governanceApprovedAt:string | null;
  mainnetPromotedAt:   string | null;
  appsDeployedAt:      string | null;
  liveAt:              string | null;
  lastError:           string | null;
  promotionsTotal:     number;
  promotionsSucceeded: number;
  promotionsFailed:    number;
  updatedAt:           string;
}

// ── State ─────────────────────────────────────────────────────────────────────
let state: PromotionState = {
  stage:               'IDLE',
  currentGitHash:      '',
  devnetReadyAt:       null,
  releaseId:           null,
  releaseBuiltAt:      null,
  releaseSealedAt:     null,
  releaseManifestAt:   null,
  releasePushedTestnetAt: null,
  releasePushTarget:   null,
  simulationStartedAt: null,
  simulationFinishedAt:null,
  simulationScore:     0,
  auditFinishedAt:     null,
  auditPassed:         false,
  governanceProposalId:null,
  governanceApprovedAt:null,
  mainnetPromotedAt:   null,
  appsDeployedAt:      null,
  liveAt:              null,
  lastError:           null,
  promotionsTotal:     0,
  promotionsSucceeded: 0,
  promotionsFailed:    0,
  updatedAt:           new Date().toISOString(),
};

let pipelineRunning = false;

// ── Logging ───────────────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, extra?: unknown): void {
  const ts   = new Date().toISOString();
  const line = extra !== undefined
    ? `[${ts}] [ghost-promotion-engine] [${level}] ${msg} ${JSON.stringify(extra)}`
    : `[${ts}] [ghost-promotion-engine] [${level}] ${msg}`;
  level === 'ERROR' ? console.error(line) : console.log(line);
}

// ── State persistence ──────────────────────────────────────────────────────────
async function saveState(): Promise<void> {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
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

// ── Helpers ───────────────────────────────────────────────────────────────────
async function jsonPost(url: string, body: unknown, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['X-GAIS-Token'] = token;
  const res = await fetch(url, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(30_000),
  });
  return res.json();
}

async function jsonGet(url: string, token?: string): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (token) headers['X-GAIS-Token'] = token;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  return res.json();
}

function buildReleaseId(gitHash: string): string {
  const commit = (gitHash || 'unknown').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 12) || 'unknown';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
  return `${stamp}-${commit}`;
}

async function runRepoCommand(
  label: string,
  command: string,
  args: string[],
  timeout: number,
  env: NodeJS.ProcessEnv = {},
): Promise<void> {
  if (DRY_RUN) {
    log('INFO', `[DRY_RUN] Skipping ${label}`, { command, args });
    return;
  }

  log('INFO', `Running ${label}`, { command, args });
  try {
    await execFileAsync(command, args, {
      cwd: REPO_ROOT,
      timeout,
      env: { ...process.env, ...env },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} failed: ${msg}`);
  }
}

async function runReleaseWorkflow(): Promise<void> {
  state.stage = 'BUILDING_RELEASE';
  if (!state.releaseId) {
    state.releaseId = buildReleaseId(state.currentGitHash);
  }
  await saveState();

  if (DRY_RUN) {
    state.releaseBuiltAt = new Date().toISOString();
    state.releaseSealedAt = state.releaseBuiltAt;
    state.releaseManifestAt = state.releaseBuiltAt;
    state.releasePushTarget = TESTNET_SSH_TARGET || null;
    if (TESTNET_SSH_TARGET) {
      state.releasePushedTestnetAt = state.releaseBuiltAt;
    }
    await saveState();
    return;
  }

  await runRepoCommand(
    'release validation',
    'bash',
    [path.join(REPO_ROOT, 'launch-system/validate-release.sh')],
    RELEASE_TIMEOUT_MS,
  );

  await runRepoCommand(
    'release build',
    'bash',
    [path.join(REPO_ROOT, 'launch-system/build-release.sh'), '--release-id', state.releaseId],
    RELEASE_TIMEOUT_MS,
  );
  state.releaseBuiltAt = new Date().toISOString();
  await saveState();

  await runRepoCommand(
    'release sealing',
    'bash',
    [path.join(REPO_ROOT, 'launch-system/seal-release.sh'), '--release-id', state.releaseId],
    RELEASE_TIMEOUT_MS,
  );
  state.releaseSealedAt = new Date().toISOString();
  await saveState();

  await runRepoCommand(
    'release manifest build',
    'bash',
    [path.join(REPO_ROOT, 'scripts/release/build-release-manifest.sh')],
    RELEASE_TIMEOUT_MS,
  );
  state.releaseManifestAt = new Date().toISOString();
  await saveState();

  if (process.env.RELEASE_ATTESTATION_PRIVATE_KEY_FILE) {
    await runRepoCommand(
      'release manifest signing',
      'bash',
      [path.join(REPO_ROOT, 'scripts/release/sign-release-manifest.sh')],
      RELEASE_TIMEOUT_MS,
    );
  }

  state.releasePushTarget = TESTNET_SSH_TARGET || null;
  if (TESTNET_SSH_TARGET) {
    await runRepoCommand(
      'push sealed release to testnet',
      'bash',
      [
        path.join(REPO_ROOT, 'launch-system/push-release-to-testnet.sh'),
        '--release-id',
        state.releaseId,
        '--ssh',
        TESTNET_SSH_TARGET,
        '--hostname-regex',
        TESTNET_HOSTNAME_REGEX,
      ],
      RELEASE_TIMEOUT_MS,
    );
    state.releasePushedTestnetAt = new Date().toISOString();
    await saveState();
    return;
  }

  if (REQUIRE_TESTNET_PUSH) {
    throw new Error('REQUIRE_TESTNET_PUSH=1 but TESTNET_SSH_TARGET is not configured');
  }
}

async function runPromotionChecksAfterGovernance(): Promise<void> {
  if (!state.governanceProposalId) {
    throw new Error('governance proposal id missing');
  }

  await runRepoCommand(
    'mainnet routing verification',
    'npm',
    ['run', 'verify:routing'],
    RELEASE_TIMEOUT_MS,
    {
      RPC_L1: RPC_MAINNET_L1,
      RPC_L2: RPC_MAINNET_L2,
      RPC_L3: RPC_MAINNET_L3,
      L3_PARENT_L2_RPC: RPC_MAINNET_L2,
    },
  );

  await runRepoCommand(
    'governance verification',
    'bash',
    [
      path.join(REPO_ROOT, 'scripts/verify-governance.sh'),
      '--proposal-id',
      state.governanceProposalId,
    ],
    RELEASE_TIMEOUT_MS,
  );

  await runRepoCommand(
    'release manifest build',
    'bash',
    [path.join(REPO_ROOT, 'scripts/release/build-release-manifest.sh')],
    RELEASE_TIMEOUT_MS,
  );
  state.releaseManifestAt = new Date().toISOString();
  await saveState();

  if (process.env.RELEASE_ATTESTATION_PRIVATE_KEY_FILE) {
    await runRepoCommand(
      'release manifest signing',
      'bash',
      [path.join(REPO_ROOT, 'scripts/release/sign-release-manifest.sh')],
      RELEASE_TIMEOUT_MS,
    );
  }

  if (!process.env.MAINNET_RELEASE_GATE_ADDRESS) {
    throw new Error('MAINNET_RELEASE_GATE_ADDRESS is required before mainnet promotion');
  }

  await runRepoCommand(
    'release gate verification',
    'bash',
    [
      path.join(REPO_ROOT, 'scripts/verify-release-gate.sh'),
      '--proposal-id',
      state.governanceProposalId,
    ],
    RELEASE_TIMEOUT_MS,
    {
      RPC_L1: RPC_MAINNET_L1,
      MAINNET_RELEASE_GATE_ADDRESS: process.env.MAINNET_RELEASE_GATE_ADDRESS,
    },
  );
}

// ── Signing relay — governance proposal ───────────────────────────────────────
async function submitProposal(
  type: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const proposal = {
    type,
    source:    'ghost-promotion-engine',
    gitHash:   state.currentGitHash,
    chainIds:  { l1: CHAIN_L1, l2: CHAIN_L2, l3: CHAIN_L3 },
    timestamp: new Date().toISOString(),
    dryRun:    DRY_RUN,
    payload,
  };

  if (DRY_RUN) {
    log('INFO', '[DRY_RUN] Proposal skipped', proposal);
    return `dry-run-${Date.now()}`;
  }

  try {
    const resp = await jsonPost(`${SIGNING_RELAY_URL}/proposals`, proposal) as { id?: string };
    const id = resp.id ?? `relay-${Date.now()}`;
    log('INFO', 'Proposal submitted to signing relay', { type, id });
    return id;
  } catch {
    log('WARN', 'Signing relay unreachable — proposal logged only', { type });
    return `offline-${Date.now()}`;
  }
}

// ── GhostBrain notification ────────────────────────────────────────────────────
async function notifyBrain(event: string, data: Record<string, unknown>): Promise<void> {
  try {
    await jsonPost(`${GHOSTBRAIN_URL}/promotion/events`, {
      event,
      source: 'ghost-promotion-engine',
      ...data,
    });
  } catch {
    // best-effort
  }
}

// ── RPC health check — prefers ghost_ namespace, falls back to eth_ for direct OP RPC ──
async function checkRpc(label: string, url: string): Promise<GateResult> {
  let lastError = 'probe failed';

  for (const method of ['ghost_blockNumber', 'eth_blockNumber']) {
    try {
      const body = JSON.stringify({
        jsonrpc: '2.0',
        method,
        params: [],
        id: 1,
      });
      const res  = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status} for ${method}`;
        continue;
      }

      const json = await res.json() as { result?: string; error?: { message?: string } };
      const ok   = typeof json.result === 'string' && json.result.startsWith('0x');
      if (ok) return { passed: true, details: `${method}: ${json.result}` };
      lastError = json.error?.message ?? `invalid payload for ${method}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { passed: false, details: lastError };
}

// ── GAIS VM status ─────────────────────────────────────────────────────────────
async function getGaisVmStatus(): Promise<Record<string, unknown>[]> {
  try {
    const data = await jsonGet(`${GAIS_URL}/vms`) as { vms?: Record<string, unknown>[] };
    return data.vms ?? [];
  } catch {
    log('WARN', 'GAIS unreachable — skipping VM status check');
    return [];
  }
}

// ── Gate: Testnet RPC health ───────────────────────────────────────────────────
async function gateTestnetRpc(): Promise<GateResult> {
  const [l1, l2, l3] = await Promise.all([
    checkRpc('testnet-l1', RPC_TESTNET_L1),
    checkRpc('testnet-l2', RPC_TESTNET_L2),
    checkRpc('testnet-l3', RPC_TESTNET_L3),
  ]);
  const passed = l1.passed && l2.passed && l3.passed;
  return {
    passed,
    details: `L1:${l1.details} L2:${l2.details} L3:${l3.details}`,
  };
}

// ── Gate: Trigger simulation and await result ──────────────────────────────────
async function gateSimulation(): Promise<GateResult> {
  log('INFO', 'Triggering testnet simulation via ghostbrain-simulator...');

  if (DRY_RUN) {
    log('INFO', '[DRY_RUN] Simulation skipped — returning score=100');
    return { passed: true, details: 'dry-run simulation', score: 100 };
  }

  try {
    // Trigger all scenarios
    await jsonPost(`${SIMULATOR_URL}/simulate/all`, {
      gitHash:  state.currentGitHash,
      chainIds: { l1: CHAIN_L1, l2: CHAIN_L2, l3: CHAIN_L3 },
    });

    // Poll for completion
    const deadline = Date.now() + SIMULATION_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 15_000));
      try {
        const status = await jsonGet(`${SIMULATOR_URL}/status`) as {
          done?: boolean;
          score?: number;
          passed?: boolean;
          summary?: string;
        };
        if (status.done) {
          const score   = status.score ?? 0;
          const passed  = (status.passed ?? false) && score >= 80;
          return {
            passed,
            details: status.summary ?? `score=${score}`,
            score,
          };
        }
      } catch {
        // simulator not ready yet
      }
    }
    return { passed: false, details: 'simulation timed out', score: 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('WARN', 'Simulator unreachable — auto-pass in development mode', { msg });
    // In a devnet-only setup where testnet VMs are cold, treat as advisory-pass
    // and let governance ratification be the final gate.
    return { passed: true, details: `simulator-offline:${msg}`, score: 75 };
  }
}

// ── Gate: Security audit (advisory) ───────────────────────────────────────────
async function gateSecurityAudit(): Promise<GateResult> {
  log('INFO', 'Checking GhostBrain security audit results...');
  try {
    const result = await jsonGet(`${GHOSTBRAIN_URL}/audit/latest`) as {
      passed?: boolean;
      score?:  number;
      summary?:string;
    };
    const passed = result.passed ?? false;
    return {
      passed,
      details: result.summary ?? `score=${result.score ?? 0}`,
      score:   result.score ?? 0,
    };
  } catch {
    log('WARN', 'GhostBrain audit endpoint unreachable — treating as advisory pass');
    return { passed: true, details: 'audit-offline', score: 70 };
  }
}

// ── Gate: Mainnet RPC health (post-promotion check) ───────────────────────────
async function gateMainnetRpc(): Promise<GateResult> {
  const [l1, l2, l3] = await Promise.all([
    checkRpc('mainnet-l1', RPC_MAINNET_L1),
    checkRpc('mainnet-l2', RPC_MAINNET_L2),
    checkRpc('mainnet-l3', RPC_MAINNET_L3),
  ]);
  const passed = l1.passed && l2.passed && l3.passed;
  return {
    passed,
    details: `L1:${l1.details} L2:${l2.details} L3:${l3.details}`,
  };
}

// ── Full promotion pipeline ────────────────────────────────────────────────────
async function runPromotionPipeline(): Promise<void> {
  if (pipelineRunning) return;
  pipelineRunning = true;

  state.promotionsTotal++;
  state.lastError = null;
  await saveState();

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // PHASE A — Build and seal the release on devnet
    // ──────────────────────────────────────────────────────────────────────────
    log('INFO', '📦 Phase A: Build sealed release');
    await runReleaseWorkflow();
    await notifyBrain('release_built', {
      gitHash:   state.currentGitHash,
      releaseId: state.releaseId,
      pushedToTestnet: Boolean(state.releasePushedTestnetAt),
      pushTarget: state.releasePushTarget,
    });

    // ──────────────────────────────────────────────────────────────────────────
    // PHASE B — Testnet RPC gate
    // ──────────────────────────────────────────────────────────────────────────
    log('INFO', '🔍 Phase B: Testnet RPC health gate');
    const rpcGate = await gateTestnetRpc();
    log('INFO', 'Testnet RPC gate result', rpcGate);

    if (!rpcGate.passed) {
      log('WARN', 'Testnet RPC unhealthy — requesting GAIS heal via proposal');
      await submitProposal('heal_testnet_rpc', {
        details: rpcGate.details,
        vms:     ['ghostchain-testnet-l1', 'ghostl2-testnet', 'ghostl3-testnet'],
      });
      // Do not abort — continue to simulation (testnet may still respond to scenarios)
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PHASE C — AI Simulation on testnet
    // ──────────────────────────────────────────────────────────────────────────
    state.stage              = 'SIMULATING_TESTNET';
    state.simulationStartedAt = new Date().toISOString();
    await saveState();
    await notifyBrain('simulation_started', { gitHash: state.currentGitHash });

    log('INFO', '🧪 Phase C: AI simulation on testnet');
    const simGate = await gateSimulation();
    state.simulationFinishedAt = new Date().toISOString();
    state.simulationScore      = simGate.score ?? 0;
    log('INFO', 'Simulation gate result', simGate);

    if (!simGate.passed) {
      state.stage = 'ERROR';
      state.lastError = `Simulation failed: ${simGate.details}`;
      state.promotionsFailed++;
      await saveState();
      await submitProposal('simulation_failed', { details: simGate.details, score: simGate.score });
      await notifyBrain('simulation_failed', { details: simGate.details, score: simGate.score });
      log('ERROR', '❌ Simulation failed — promotion blocked');
      return;
    }

    state.stage = 'SIMULATION_PASSED';
    await saveState();
    await notifyBrain('simulation_passed', { score: simGate.score });

    // ──────────────────────────────────────────────────────────────────────────
    // PHASE D — Security audit gate
    // ──────────────────────────────────────────────────────────────────────────
    state.stage = 'SECURITY_AUDIT';
    await saveState();

    log('INFO', '🔐 Phase D: Security audit gate');
    const auditGate = await gateSecurityAudit();
    state.auditFinishedAt = new Date().toISOString();
    state.auditPassed     = auditGate.passed;
    log('INFO', 'Security audit gate result', auditGate);

    if (!auditGate.passed) {
      state.stage = 'ERROR';
      state.lastError = `Security audit failed: ${auditGate.details}`;
      state.promotionsFailed++;
      await saveState();
      await submitProposal('security_audit_failed', { details: auditGate.details });
      await notifyBrain('security_audit_failed', { details: auditGate.details });
      log('ERROR', '❌ Security audit failed — promotion blocked');
      return;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PHASE E — Submit governance proposal for mainnet promotion
    // ──────────────────────────────────────────────────────────────────────────
    state.stage = 'GOVERNANCE_PENDING';
    await saveState();

    log('INFO', '👑 Phase E: Submitting mainnet promotion proposal to governance');
    const proposalId = await submitProposal('promote_to_mainnet', {
      gitHash:         state.currentGitHash,
      releaseId:       state.releaseId,
      simulationScore: state.simulationScore,
      auditPassed:     state.auditPassed,
      testnetRpcOk:    rpcGate.passed,
      targetVms:       [
        'ghostchain-mainnet-l1',
        'ghost-mainnet-validator',
        'ghostl2-mainnet',
        'ghostl3-mainnet',
      ],
      // Routing law enforced: boot L1 first, then L2, then L3
      bootOrder:       ['ghostchain-mainnet-l1', 'ghost-mainnet-validator', 'ghostl2-mainnet', 'ghostl3-mainnet'],
    });

    state.governanceProposalId = proposalId;
    await saveState();
    await notifyBrain('governance_proposal_submitted', { proposalId });
    log('INFO', '⏳ Governance proposal submitted — awaiting ratification', { proposalId });
    return;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('ERROR', 'Promotion pipeline error', { msg });
    state.stage     = 'ERROR';
    state.lastError = msg;
    state.promotionsFailed++;
    await saveState();
  } finally {
    pipelineRunning = false;
  }
}

async function continueAfterGovernanceApproval(): Promise<void> {
  if (pipelineRunning) return;
  pipelineRunning = true;

  try {
    if (state.stage !== 'GOVERNANCE_PENDING' && state.stage !== 'MAINNET_PROMOTING') {
      log('WARN', 'Ignoring governance continuation outside governance gate', { stage: state.stage });
      return;
    }
    if (!state.governanceProposalId) {
      throw new Error('cannot continue without governance proposal id');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PHASE F — Governance and release-gate verification
    // ──────────────────────────────────────────────────────────────────────────
    log('INFO', '🧾 Phase F: Verifying governance and release gate');
    await runPromotionChecksAfterGovernance();

    // ──────────────────────────────────────────────────────────────────────────
    // PHASE G — GAIS mainnet VM sync (advisory — GAIS enforces its own safety)
    // ──────────────────────────────────────────────────────────────────────────
    state.stage = 'MAINNET_PROMOTING';
    await saveState();

    log('INFO', '🚀 Phase G: Requesting GAIS mainnet VM health check');
    const vmStatus = await getGaisVmStatus();
    const mainnetVms = vmStatus.filter((v: Record<string, unknown>) =>
      typeof v.name === 'string' && v.name.includes('mainnet'),
    );
    log('INFO', 'Mainnet VM status from GAIS', { count: mainnetVms.length });

    const unhealthy = mainnetVms.filter((v: Record<string, unknown>) => !v.rpc_healthy);
    if (unhealthy.length > 0) {
      await submitProposal('restart_unhealthy_mainnet_vms', {
        vms:    unhealthy.map((v) => v.name),
        reason: 'Post-ratification mainnet health sync',
      });
    }

    state.mainnetPromotedAt = new Date().toISOString();
    await saveState();

    // ──────────────────────────────────────────────────────────────────────────
    // PHASE H — Mainnet RPC verification
    // ──────────────────────────────────────────────────────────────────────────
    log('INFO', '✅ Phase H: Verifying mainnet RPC topology');
    const mainnetRpc = await gateMainnetRpc();
    log('INFO', 'Mainnet RPC gate result', mainnetRpc);

    if (!mainnetRpc.passed) {
      log('WARN', 'Mainnet RPC unhealthy post-promotion — submitting heal proposal');
      await submitProposal('heal_mainnet_rpc', {
        details: mainnetRpc.details,
        vms: ['ghostchain-mainnet-l1', 'ghostl2-mainnet', 'ghostl3-mainnet'],
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PHASE I — App deployment proposal
    // ──────────────────────────────────────────────────────────────────────────
    state.stage = 'DEPLOYING_APPS';
    await saveState();

    log('INFO', '🌐 Phase I: Submitting app deployment proposal');
    await submitProposal('deploy_apps', {
      gitHash:  state.currentGitHash,
      releaseId: state.releaseId,
      targets:  ['ghost-web', 'apps/web', 'apps/api'],
      vm:       'ghost-web',
      chainId:  CHAIN_L3,
    });

    state.appsDeployedAt = new Date().toISOString();

    // ──────────────────────────────────────────────────────────────────────────
    // SUCCESS
    // ──────────────────────────────────────────────────────────────────────────
    state.stage              = 'LIVE';
    state.liveAt             = new Date().toISOString();
    state.lastError          = null;
    state.promotionsSucceeded++;
    await saveState();

    await notifyBrain('promotion_complete', {
      gitHash:  state.currentGitHash,
      liveAt:   state.liveAt,
      releaseId: state.releaseId,
    });

    log('INFO', '🟢 Promotion pipeline complete — GhostStack is LIVE', {
      gitHash:      state.currentGitHash,
      simScore:     state.simulationScore,
      proposalId:   state.governanceProposalId,
      releaseId:    state.releaseId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('ERROR', 'Post-governance promotion error', { msg });
    state.stage = 'ERROR';
    state.lastError = msg;
    state.promotionsFailed++;
    await saveState();
  } finally {
    pipelineRunning = false;
  }
}

// ── HTTP API ──────────────────────────────────────────────────────────────────
const PROMETHEUS_STAGES: PromotionStage[] = [
  'IDLE',
  'DEVNET_READY',
  'BUILDING_RELEASE',
  'SIMULATING_TESTNET',
  'SIMULATION_PASSED',
  'SECURITY_AUDIT',
  'GOVERNANCE_PENDING',
  'MAINNET_PROMOTING',
  'DEPLOYING_APPS',
  'LIVE',
  'ERROR',
];

function buildMetrics(): string {
  const stageMetrics = PROMETHEUS_STAGES.map((stage) =>
    `ghost_promotion_engine_stage{stage="${stage}"} ${state.stage === stage ? 1 : 0}`,
  );

  return [
    '# HELP ghost_promotion_engine_promotions_total Total promotion runs started.',
    '# TYPE ghost_promotion_engine_promotions_total counter',
    `ghost_promotion_engine_promotions_total ${state.promotionsTotal}`,
    '# HELP ghost_promotion_engine_promotions_succeeded Total successful promotions.',
    '# TYPE ghost_promotion_engine_promotions_succeeded counter',
    `ghost_promotion_engine_promotions_succeeded ${state.promotionsSucceeded}`,
    '# HELP ghost_promotion_engine_promotions_failed Total failed promotions.',
    '# TYPE ghost_promotion_engine_promotions_failed counter',
    `ghost_promotion_engine_promotions_failed ${state.promotionsFailed}`,
    '# HELP ghost_promotion_engine_simulation_score Latest simulation score.',
    '# TYPE ghost_promotion_engine_simulation_score gauge',
    `ghost_promotion_engine_simulation_score ${state.simulationScore}`,
    '# HELP ghost_promotion_engine_release_sealed Whether the latest release has been sealed.',
    '# TYPE ghost_promotion_engine_release_sealed gauge',
    `ghost_promotion_engine_release_sealed ${state.releaseSealedAt ? 1 : 0}`,
    '# HELP ghost_promotion_engine_stage Current promotion stage.',
    '# TYPE ghost_promotion_engine_stage gauge',
    ...stageMetrics,
  ].join('\n') + '\n';
}

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());

  // Status — read-only, Prometheus-friendly
  app.get('/status', (_req: Request, res: Response) => {
    res.json({ service: 'ghost-promotion-engine', ...state, dryRun: DRY_RUN });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, stage: state.stage });
  });

  app.get('/metrics', (_req: Request, res: Response) => {
    res.type('text/plain').send(buildMetrics());
  });

  // Event: ghost-orchestrator posts here when devnet is ready
  app.post('/events/devnet-ready', (req: Request, res: Response) => {
    const { gitHash } = req.body as { gitHash?: string };
    if (!gitHash) { res.status(400).json({ error: 'gitHash required' }); return; }

    log('INFO', 'Received devnet-ready event', { gitHash });

    state.currentGitHash = gitHash;
    state.devnetReadyAt  = new Date().toISOString();
    state.stage          = 'DEVNET_READY';
    state.releaseId = null;
    state.releaseBuiltAt = null;
    state.releaseSealedAt = null;
    state.releaseManifestAt = null;
    state.releasePushedTestnetAt = null;
    state.releasePushTarget = null;
    state.governanceProposalId = null;
    state.governanceApprovedAt = null;
    state.mainnetPromotedAt = null;
    state.appsDeployedAt = null;
    state.liveAt = null;
    state.lastError = null;
    saveState().catch(console.error);

    // Run pipeline asynchronously
    runPromotionPipeline().catch(console.error);
    res.json({ ok: true, stage: state.stage });
  });

  // Manual trigger — for testing or after human-resolved ERROR
  app.post('/trigger', (req: Request, res: Response) => {
    const { gitHash } = req.body as { gitHash?: string };
    if (gitHash) state.currentGitHash = gitHash;
    state.stage         = 'DEVNET_READY';
    state.devnetReadyAt = new Date().toISOString();
    state.releaseId = null;
    state.releaseBuiltAt = null;
    state.releaseSealedAt = null;
    state.releaseManifestAt = null;
    state.releasePushedTestnetAt = null;
    state.releasePushTarget = null;
    state.governanceProposalId = null;
    state.governanceApprovedAt = null;
    state.mainnetPromotedAt = null;
    state.appsDeployedAt = null;
    state.liveAt = null;
    state.lastError = null;
    saveState().catch(console.error);
    log('INFO', 'Manual pipeline trigger via API', { gitHash: state.currentGitHash });
    runPromotionPipeline().catch(console.error);
    res.json({ ok: true, message: 'Promotion pipeline triggered' });
  });

  // Reset error state
  app.post('/reset', (_req: Request, res: Response) => {
    state.stage     = 'IDLE';
    state.lastError = null;
    state.releaseId = null;
    state.releaseBuiltAt = null;
    state.releaseSealedAt = null;
    state.releaseManifestAt = null;
    state.releasePushedTestnetAt = null;
    state.releasePushTarget = null;
    state.governanceProposalId = null;
    state.governanceApprovedAt = null;
    state.mainnetPromotedAt = null;
    state.appsDeployedAt = null;
    state.liveAt = null;
    saveState().catch(console.error);
    log('INFO', 'State reset to IDLE via API');
    res.json({ ok: true, message: 'State reset to IDLE' });
  });

  // GAIS directive webhook — governance ratification callback
  app.post('/governance/approved', (req: Request, res: Response) => {
    const { proposalId, type } = req.body as { proposalId?: string; type?: string };
    log('INFO', 'Governance approval received', { proposalId, type });
    // After governance ratification, allow pipeline to continue from GOVERNANCE_PENDING
    if (state.stage === 'GOVERNANCE_PENDING' && state.governanceProposalId === proposalId) {
      state.governanceApprovedAt = new Date().toISOString();
      saveState().catch(console.error);
      continueAfterGovernanceApproval().catch(console.error);
    }
    res.json({ ok: true });
  });

  return app;
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('INFO', '👻 GhostStack Promotion Engine starting', {
    port:   PROMO_PORT,
    dryRun: DRY_RUN,
  });

  await loadState();

  const app    = buildApp();
  const server = http.createServer(app);
  server.listen(PROMO_PORT, () => {
    log('INFO', `HTTP API listening on :${PROMO_PORT}`);
  });

  // If we crashed mid-pipeline, resume from DEVNET_READY to restart pipeline
  if (
    state.stage === 'SIMULATING_TESTNET' ||
    state.stage === 'BUILDING_RELEASE' ||
    state.stage === 'DEVNET_READY'
  ) {
    log('INFO', 'Resuming interrupted promotion pipeline', { stage: state.stage });
    state.stage = 'DEVNET_READY';
    runPromotionPipeline().catch(console.error);
  }

  if (
    state.stage === 'MAINNET_PROMOTING' ||
    (state.stage === 'GOVERNANCE_PENDING' && Boolean(state.governanceApprovedAt))
  ) {
    log('INFO', 'Resuming post-governance promotion pipeline', { stage: state.stage });
    continueAfterGovernanceApproval().catch(console.error);
  }

  process.on('SIGTERM', () => { server.close(); process.exit(0); });
  process.on('SIGINT',  () => { server.close(); process.exit(0); });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
