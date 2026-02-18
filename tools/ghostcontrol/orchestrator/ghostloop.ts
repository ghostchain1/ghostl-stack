import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  insertCheckpoint,
  insertPatchRecord,
  listOpenIncidents,
  openIncidentDb,
  type CheckpointDecision,
} from "../incidents/db.ts";
import {
  collectFromLogFiles,
  collectIncidents,
  type IncidentSignal,
} from "../incidents/collector.ts";
import {
  candidateFitsRiskBudget,
  deriveCandidatesFromIncidents,
  rankPatches,
  type RiskBudget,
} from "../patches/ranker.ts";
import {
  evaluateInvariants,
  hasStopShipRisk,
  loadInvariantConfig,
  mergeRuntimeContainerStates,
  runtimeInspectionWarningsToViolations,
  type InvariantResult,
  type VmTarget,
} from "../guards/invariants.ts";
import {
  buildAttestationSummary,
  buildChainIdentityAttestation,
  packageEvidence,
  signPayloadEd25519,
  type ChainIdentitySnapshot,
} from "../evidence/packager.ts";
import { inspectRuntimeContainers } from "../guards/runtime_inspector.ts";
import { runShellCommand, withDockerAccess } from "../deploy/docker_access.ts";

type GovernanceMode = "NONE" | "DEVNET" | "TESTNET" | "MAINNET";

export interface PreflightCheck {
  name: string;
  command: string;
  required: boolean;
}

export interface GhostloopIterationInput {
  iteration: number;
  vmTarget: VmTarget;
  composeTargets: string[];
  riskBudget: RiskBudget;
  governanceNeeded: GovernanceMode;
  dbPath?: string;
  logFiles?: string[];
  alerts?: IncidentSignal[];
  invariantsPath?: string;
}

export interface GhostloopIterationResult {
  iteration: number;
  decision: CheckpointDecision;
  checkpointId: number;
  selectedPatchId: number | null;
  selectedIncidentId: number | null;
  rankedPatchIds: string[];
  invariantViolations: InvariantResult["violations"];
  preflight: Array<{ name: string; ok: boolean; output: string }>;
  evidenceManifestPath: string;
}

const DEFAULT_INVARIANTS_PATH =
  "/home/ghost/ghostl-stack/tools/ghostcontrol/guards/config/network-rules.json";
const DEFAULT_EVIDENCE_LOG_DIR =
  "/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/logs";
const DEFAULT_EVIDENCE_ATTESTATION_DIR =
  "/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/attestations";
const DEFAULT_GOVERNANCE_GATE_DIR =
  "/home/ghost/ghostl-stack/tools/ghostcontrol/governance/gates";
const DEFAULT_L1_RPC = "http://localhost:18545";
const DEFAULT_L2_RPC = "http://localhost:29547";
const DEFAULT_L3_RPC = "http://localhost:39545";
const DEFAULT_L1_CHAIN_ID = "14000101";
const DEFAULT_L2_CHAIN_ID = "901";
const DEFAULT_L3_CHAIN_ID = "903";
const DEFAULT_CHAIN_ATTESTATION_SIGNING_KEY_PATH =
  "/home/ghost/ghostl-stack/tools/ghostcontrol/secrets/signing.key";
const DEFAULT_CHAIN_ATTESTATION_KEY_ID = "dev";

function buildRpcChainIdCheckCommand(params: {
  rpcEnvVar: "L1_RPC" | "L2_RPC" | "L3_RPC";
  rpcAliasEnvVar: "RPC_L1" | "RPC_L2" | "RPC_L3";
  rpcFallback: string;
  chainIdEnvVar: "L1_CHAIN_ID" | "L2_CHAIN_ID" | "L3_CHAIN_ID";
  chainIdFallback: string;
}): string {
  return [
    `RPC_URL="\${${params.rpcEnvVar}:-\${${params.rpcAliasEnvVar}:-${params.rpcFallback}}}"`,
    `EXPECTED_CHAIN_ID_DEC="\${${params.chainIdEnvVar}:-${params.chainIdFallback}}"`,
    "if ! [[ \"$EXPECTED_CHAIN_ID_DEC\" =~ ^[0-9]+$ ]]; then",
    `  echo "invalid_expected_chain_id env=${params.chainIdEnvVar} value=$EXPECTED_CHAIN_ID_DEC"`,
    "  exit 1",
    "fi",
    "EXPECTED_CHAIN_ID_HEX=$(printf \"0x%x\" \"$EXPECTED_CHAIN_ID_DEC\")",
    "RESPONSE=$(curl -fsS \"$RPC_URL\" -H 'content-type: application/json' -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\",\"params\":[]}') || exit 1",
    "ACTUAL_CHAIN_ID_HEX=$(printf '%s' \"$RESPONSE\" | sed -n 's/.*\"result\"[[:space:]]*:[[:space:]]*\"\\(0x[0-9a-fA-F]\\+\\)\".*/\\1/p')",
    "if [ -z \"$ACTUAL_CHAIN_ID_HEX\" ]; then",
    "  echo \"rpc_chain_id_parse_failed rpc=$RPC_URL response=$RESPONSE\"",
    "  exit 1",
    "fi",
    "if [ \"${ACTUAL_CHAIN_ID_HEX,,}\" != \"${EXPECTED_CHAIN_ID_HEX,,}\" ]; then",
    "  echo \"rpc_chain_id_mismatch rpc=$RPC_URL expected=$EXPECTED_CHAIN_ID_HEX actual=$ACTUAL_CHAIN_ID_HEX\"",
    "  exit 1",
    "fi",
    "echo \"rpc_chain_id_ok rpc=$RPC_URL chain_id=$ACTUAL_CHAIN_ID_HEX\"",
  ].join("\n");
}

function buildGovernanceMainnetGateCheckCommand(): string {
  return [
    "GOV_MODE=${GHOST_GOVERNANCE_MODE:-${GOVERNANCE_MODE:-NONE}}",
    "if [ \"$GOV_MODE\" != \"MAINNET\" ]; then",
    "  echo \"governance_mainnet_gate_skipped mode=$GOV_MODE\"",
    "  exit 0",
    "fi",
    "PROPOSAL_ID=${GOVERNANCE_PROPOSAL_ID:-}",
    "if [ -z \"$PROPOSAL_ID\" ]; then",
    "  echo \"governance_proposal_id_missing\"",
    "  exit 1",
    "fi",
    `GATE_FILE=\${GOVERNANCE_GATE_FILE:-${DEFAULT_GOVERNANCE_GATE_DIR}/\${PROPOSAL_ID}.json}`,
    "if [ ! -f \"$GATE_FILE\" ]; then",
    "  echo \"governance_gate_file_missing file=$GATE_FILE proposal_id=$PROPOSAL_ID\"",
    "  exit 1",
    "fi",
    "if ! grep -Eq \"\\\"proposalId\\\"[[:space:]]*:[[:space:]]*\\\"${PROPOSAL_ID}\\\"\" \"$GATE_FILE\"; then",
    "  echo \"governance_gate_proposal_mismatch file=$GATE_FILE proposal_id=$PROPOSAL_ID\"",
    "  exit 1",
    "fi",
    "if ! grep -Eq \"\\\"allowDeploy\\\"[[:space:]]*:[[:space:]]*true\" \"$GATE_FILE\"; then",
    "  echo \"governance_gate_not_approved file=$GATE_FILE proposal_id=$PROPOSAL_ID\"",
    "  exit 1",
    "fi",
    "echo \"governance_gate_ok proposal_id=$PROPOSAL_ID gate_file=$GATE_FILE\"",
  ].join("\n");
}

function governanceModeToVmTarget(
  mode: GovernanceMode,
  configured: VmTarget,
): VmTarget {
  if (mode === "DEVNET") return "devnet";
  if (mode === "TESTNET") return "testnet";
  if (mode === "MAINNET") return "mainnet";
  return configured;
}

async function resolveRuntimeGovernanceGate(params: {
  governanceNeeded: GovernanceMode;
  configured: {
    target: VmTarget;
    proposalApproved: boolean;
    proposalId?: string;
    constitutionalGateEnabled?: boolean;
  };
}): Promise<{
  target: VmTarget;
  proposalApproved: boolean;
  proposalId?: string;
  constitutionalGateEnabled?: boolean;
}> {
  const target = governanceModeToVmTarget(
    params.governanceNeeded,
    params.configured.target,
  );
  const proposalId = process.env.GOVERNANCE_PROPOSAL_ID?.trim() || params.configured.proposalId;
  let proposalApproved =
    params.configured.proposalApproved ||
    /^true$/i.test(process.env.GOVERNANCE_PROPOSAL_APPROVED ?? "");

  if (params.governanceNeeded === "MAINNET" && proposalId) {
    const gatePath = process.env.GOVERNANCE_GATE_FILE ??
      path.join(DEFAULT_GOVERNANCE_GATE_DIR, `${proposalId}.json`);
    try {
      const raw = JSON.parse(await readFile(gatePath, "utf8")) as {
        allowDeploy?: boolean;
        proposalId?: string;
      };
      if (raw.proposalId === proposalId && raw.allowDeploy === true) {
        proposalApproved = true;
      }
    } catch {
      // preflight captures malformed/missing governance gate artifacts.
    }
  }

  return {
    target,
    proposalApproved,
    proposalId,
    constitutionalGateEnabled: params.configured.constitutionalGateEnabled,
  };
}

function resolveRpcUrl(
  shortEnv: "L1_RPC" | "L2_RPC" | "L3_RPC",
  aliasEnv: "RPC_L1" | "RPC_L2" | "RPC_L3",
  fallback: string,
): string {
  return process.env[shortEnv] ?? process.env[aliasEnv] ?? fallback;
}

function resolveChainIdDec(
  envName: "L1_CHAIN_ID" | "L2_CHAIN_ID" | "L3_CHAIN_ID",
  fallback: string,
): number {
  const raw = process.env[envName] ?? fallback;
  if (!/^\d+$/.test(raw)) return Number.NaN;
  return Number(raw);
}

function toHexChainId(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "invalid";
  return `0x${Math.trunc(value).toString(16)}`;
}

function parseObservedChainIdHex(output: string): string | null {
  const parsed = output.match(/chain_id=(0x[0-9a-fA-F]+)/);
  return parsed?.[1]?.toLowerCase() ?? null;
}

async function writeChainIdentityAttestationLog(params: {
  iteration: number;
  governanceMode: GovernanceMode;
  preflight: Array<{ name: string; ok: boolean; output: string }>;
}): Promise<string> {
  await mkdir(DEFAULT_EVIDENCE_ATTESTATION_DIR, { recursive: true });

  const commitProbe = runShellCommand("git -C /home/ghost/ghostl-stack rev-parse HEAD");
  const commit = commitProbe.ok
    ? (commitProbe.output.trim().split(/\s+/)[0] ?? "unknown")
    : "unknown";

  const chainTargets: Array<{
    layer: ChainIdentitySnapshot["layer"];
    checkName: string;
    rpcUrl: string;
    expectedChainIdDec: number;
    expectedChainIdHex: string;
  }> = [
    {
      layer: "l1",
      checkName: "rpc_l1_chain_id",
      rpcUrl: resolveRpcUrl("L1_RPC", "RPC_L1", DEFAULT_L1_RPC),
      expectedChainIdDec: resolveChainIdDec("L1_CHAIN_ID", DEFAULT_L1_CHAIN_ID),
      expectedChainIdHex: toHexChainId(resolveChainIdDec("L1_CHAIN_ID", DEFAULT_L1_CHAIN_ID)),
    },
    {
      layer: "l2",
      checkName: "rpc_l2_chain_id",
      rpcUrl: resolveRpcUrl("L2_RPC", "RPC_L2", DEFAULT_L2_RPC),
      expectedChainIdDec: resolveChainIdDec("L2_CHAIN_ID", DEFAULT_L2_CHAIN_ID),
      expectedChainIdHex: toHexChainId(resolveChainIdDec("L2_CHAIN_ID", DEFAULT_L2_CHAIN_ID)),
    },
    {
      layer: "l3",
      checkName: "rpc_l3_chain_id",
      rpcUrl: resolveRpcUrl("L3_RPC", "RPC_L3", DEFAULT_L3_RPC),
      expectedChainIdDec: resolveChainIdDec("L3_CHAIN_ID", DEFAULT_L3_CHAIN_ID),
      expectedChainIdHex: toHexChainId(resolveChainIdDec("L3_CHAIN_ID", DEFAULT_L3_CHAIN_ID)),
    },
  ];

  const identities: ChainIdentitySnapshot[] = chainTargets.map((target) => {
    const check = params.preflight.find((entry) => entry.name === target.checkName);
    const observedChainIdHex = parseObservedChainIdHex(check?.output ?? "");
    const checkOk =
      Boolean(check?.ok) &&
      observedChainIdHex !== null &&
      observedChainIdHex === target.expectedChainIdHex.toLowerCase();
    return {
      layer: target.layer,
      checkName: target.checkName,
      rpcUrl: target.rpcUrl,
      expectedChainIdDec: target.expectedChainIdDec,
      expectedChainIdHex: target.expectedChainIdHex,
      observedChainIdHex,
      checkOk,
      checkOutput: check?.output ?? "preflight_check_missing",
    };
  });

  const attestationPayload = buildChainIdentityAttestation({
    iteration: params.iteration,
    governanceMode: params.governanceMode,
    commit,
    identities,
  });
  const signingKeyPath =
    process.env.CHAIN_ATTESTATION_SIGNING_KEY_PATH ??
    process.env.SIGNING_PRIVATE_KEY_PATH ??
    DEFAULT_CHAIN_ATTESTATION_SIGNING_KEY_PATH;
  const keyId =
    process.env.CHAIN_ATTESTATION_KEY_ID ??
    process.env.SIGNING_KEY_ID ??
    DEFAULT_CHAIN_ATTESTATION_KEY_ID;
  const privateKeyPem = await readFile(signingKeyPath, "utf8");
  const signature = signPayloadEd25519({
    payload: attestationPayload,
    privateKeyPem,
    keyId,
  });

  const attestationPath = path.join(
    DEFAULT_EVIDENCE_ATTESTATION_DIR,
    `iteration-${params.iteration}-chain-identity-attestation.json`,
  );
  const signedAttestation = {
    ...attestationPayload,
    signingKeyPath,
    signature,
  };
  await writeFile(attestationPath, JSON.stringify(signedAttestation, null, 2), "utf8");
  return attestationPath;
}

export function preflightChecks(
  composeTargets: string[],
  governanceMode: GovernanceMode = "NONE",
): PreflightCheck[] {
  const composeFiles = composeTargets.length > 0
    ? composeTargets
    : ["tools/ghostcontrol/infra/compose/docker-compose.yml"];
  const composeCmd = composeFiles.map((value) => `-f ${value}`).join(" ");
  const dockerInfoCmd = withDockerAccess("docker info --format '{{.ServerVersion}}'");
  const dockerComposePsCmd = withDockerAccess(`docker compose ${composeCmd} ps`);
  const rpcL1ChainIdCmd = buildRpcChainIdCheckCommand({
    rpcEnvVar: "L1_RPC",
    rpcAliasEnvVar: "RPC_L1",
    rpcFallback: DEFAULT_L1_RPC,
    chainIdEnvVar: "L1_CHAIN_ID",
    chainIdFallback: DEFAULT_L1_CHAIN_ID,
  });
  const rpcL2ChainIdCmd = buildRpcChainIdCheckCommand({
    rpcEnvVar: "L2_RPC",
    rpcAliasEnvVar: "RPC_L2",
    rpcFallback: DEFAULT_L2_RPC,
    chainIdEnvVar: "L2_CHAIN_ID",
    chainIdFallback: DEFAULT_L2_CHAIN_ID,
  });
  const rpcL3ChainIdCmd = buildRpcChainIdCheckCommand({
    rpcEnvVar: "L3_RPC",
    rpcAliasEnvVar: "RPC_L3",
    rpcFallback: DEFAULT_L3_RPC,
    chainIdEnvVar: "L3_CHAIN_ID",
    chainIdFallback: DEFAULT_L3_CHAIN_ID,
  });
  const governanceMainnetCheckCmd = buildGovernanceMainnetGateCheckCommand();

  return [
    {
      name: "repo_status",
      command: "git -C /home/ghost/ghostl-stack status --short",
      required: true,
    },
    {
      name: "submodules",
      command: "git -C /home/ghost/ghostl-stack submodule status --recursive",
      required: false,
    },
    {
      name: "docker_daemon",
      command: dockerInfoCmd,
      required: true,
    },
    {
      name: "docker_compose_ps",
      command: dockerComposePsCmd,
      required: false,
    },
    {
      name: "vault_health",
      command:
        "if command -v vault >/dev/null 2>&1; then vault status -format=json; " +
        "elif command -v curl >/dev/null 2>&1 && curl -fsS http://127.0.0.1:8200/v1/sys/health >/dev/null 2>&1; then " +
        "curl -fsS http://127.0.0.1:8200/v1/sys/health; " +
        "else echo '{\"status\":\"skipped\",\"reason\":\"vault_cli_and_http_unavailable\"}'; fi",
      required: false,
    },
    {
      name: "rpc_l1_chain_id",
      command: rpcL1ChainIdCmd,
      required: true,
    },
    {
      name: "rpc_l2_chain_id",
      command: rpcL2ChainIdCmd,
      required: true,
    },
    {
      name: "rpc_l3_chain_id",
      command: rpcL3ChainIdCmd,
      required: true,
    },
    {
      name: "governance_mainnet_proposal_gate",
      command: governanceMainnetCheckCmd,
      required: governanceMode === "MAINNET",
    },
    {
      name: "prometheus_health",
      command: "curl -fsS http://localhost:9090/-/healthy",
      required: false,
    },
    {
      name: "grafana_health",
      command: "curl -fsS http://localhost:3000/api/health",
      required: false,
    },
    {
      name: "trivy_ready",
      command: "trivy --version",
      required: true,
    },
  ];
}

function runCommand(command: string): { ok: boolean; output: string } {
  const result = runShellCommand(command);
  return { ok: result.ok, output: result.output };
}

async function writePreflightLog(
  iteration: number,
  preflight: Array<{ name: string; ok: boolean; output: string }>,
): Promise<string> {
  await mkdir(DEFAULT_EVIDENCE_LOG_DIR, { recursive: true });
  const logPath = path.join(DEFAULT_EVIDENCE_LOG_DIR, `iteration-${iteration}-preflight.log`);
  const lines: string[] = [];
  for (const check of preflight) {
    lines.push(`## ${check.name}`);
    lines.push(`ok=${check.ok}`);
    lines.push(check.output || "(no output)");
    lines.push("");
  }
  await writeFile(logPath, lines.join("\n"), "utf8");
  return logPath;
}

async function writeRuntimeInspectionLog(
  iteration: number,
  runtimeInspection: { containers: Array<{ name: string; user?: string; privileged?: boolean; healthcheck?: boolean; readOnlyRootFs?: boolean }>; warnings: string[] },
): Promise<string> {
  await mkdir(DEFAULT_EVIDENCE_LOG_DIR, { recursive: true });
  const logPath = path.join(DEFAULT_EVIDENCE_LOG_DIR, `iteration-${iteration}-runtime-inspection.log`);
  const lines: string[] = [];
  lines.push("# runtime_containers");
  for (const container of runtimeInspection.containers) {
    lines.push(
      `${container.name}|user=${container.user ?? ""}|privileged=${String(container.privileged)}|healthcheck=${String(container.healthcheck)}|readonly=${String(container.readOnlyRootFs)}`,
    );
  }
  lines.push("");
  lines.push("# warnings");
  if (runtimeInspection.warnings.length === 0) {
    lines.push("none");
  } else {
    for (const warning of runtimeInspection.warnings) {
      lines.push(warning);
    }
  }
  lines.push("");
  await writeFile(logPath, lines.join("\n"), "utf8");
  return logPath;
}

async function writeAttestationLog(params: {
  iteration: number;
  decision: CheckpointDecision;
  patchId?: number | null;
}): Promise<string> {
  await mkdir(DEFAULT_EVIDENCE_ATTESTATION_DIR, { recursive: true });

  const commitProbe = runShellCommand("git -C /home/ghost/ghostl-stack rev-parse HEAD");
  const commit = commitProbe.ok
    ? (commitProbe.output.trim().split(/\s+/)[0] ?? "unknown")
    : "unknown";

  const attestation = buildAttestationSummary({
    iteration: params.iteration,
    commit,
    decision: params.decision,
    patchId: params.patchId ?? undefined,
  });
  const attestationPath = path.join(
    DEFAULT_EVIDENCE_ATTESTATION_DIR,
    `iteration-${params.iteration}-attestation.json`,
  );
  await writeFile(attestationPath, JSON.stringify(attestation, null, 2), "utf8");
  return attestationPath;
}

export function decideCheckpoint(params: {
  preflight: Array<{ name: string; ok: boolean; required: boolean }>;
  invariants: InvariantResult;
  openIncidentCount: number;
  selectedCandidateFound: boolean;
}): CheckpointDecision {
  if (hasStopShipRisk(params.invariants)) return "HOLD";
  const requiredFailed = params.preflight.some((check) => check.required && !check.ok);
  if (requiredFailed) return "HOLD";
  if (params.openIncidentCount === 0) return "ADVANCE";
  if (!params.selectedCandidateFound) return "HOLD";
  return "ADVANCE";
}

function patchStatusForDecision(decision: CheckpointDecision): "proposed" | "applied" | "reverted" {
  if (decision === "ADVANCE") return "applied";
  if (decision === "ROLLBACK") return "reverted";
  return "proposed";
}

function incidentStatusForDecision(decision: CheckpointDecision): "open" | "mitigated" | "closed" {
  if (decision === "ADVANCE") return "mitigated";
  if (decision === "ROLLBACK") return "open";
  return "open";
}

export async function runGhostloopIteration(
  input: GhostloopIterationInput,
): Promise<GhostloopIterationResult> {
  const checks = preflightChecks(input.composeTargets, input.governanceNeeded);
  const preflight = checks.map((check) => ({
    name: check.name,
    required: check.required,
    ...runCommand(check.command),
  }));

  if (input.logFiles && input.logFiles.length > 0) {
    await collectFromLogFiles({
      dbPath: input.dbPath,
      logFiles: input.logFiles,
    });
  }
  if (input.alerts && input.alerts.length > 0) {
    collectIncidents({
      dbPath: input.dbPath,
      signals: input.alerts,
    });
  }

  const db = openIncidentDb(input.dbPath);
  let selectedPatchId: number | null = null;
  let selectedIncidentId: number | null = null;
  let decision: CheckpointDecision = "HOLD";
  let evidenceManifestPath = "";
  try {
    const incidents = listOpenIncidents(db, 100);
    const candidates = deriveCandidatesFromIncidents(incidents).filter((candidate) =>
      candidateFitsRiskBudget(candidate, input.riskBudget),
    );
    const ranked = rankPatches(candidates, { limit: 5 });
    const selected = ranked[0];

    if (selected) {
      selectedIncidentId = selected.incidentId;
      selectedPatchId = insertPatchRecord(db, {
        incidentId: selected.incidentId,
        risk: input.riskBudget,
        impact: selected.breakdown.severityScore,
        rationale: selected.rationale,
        diffRef: selected.diffRef,
        score: selected.score,
        status: "proposed",
      });
    }

    const configuredInvariants = await loadInvariantConfig(
      input.invariantsPath ?? DEFAULT_INVARIANTS_PATH,
    );
    const runtimeInspection = await inspectRuntimeContainers({
      serviceNames: configuredInvariants.containers.map((container) => container.name),
      composeProject: process.env.GHOSTCONTROL_COMPOSE_PROJECT ?? "compose",
    });
    const mergedContainers = mergeRuntimeContainerStates(
      configuredInvariants.containers,
      runtimeInspection.containers,
    );
    const runtimeGovernance = await resolveRuntimeGovernanceGate({
      governanceNeeded: input.governanceNeeded,
      configured: configuredInvariants.governance,
    });
    const baseInvariantResult = evaluateInvariants({
      ...configuredInvariants,
      containers: mergedContainers,
      governance: runtimeGovernance,
    });
    const runtimeViolations = runtimeInspectionWarningsToViolations(
      runtimeInspection.warnings,
    );
    const invariantResult: InvariantResult = {
      ok: baseInvariantResult.ok && runtimeViolations.length === 0,
      violations: [...baseInvariantResult.violations, ...runtimeViolations],
    };

    decision = decideCheckpoint({
      preflight,
      invariants: invariantResult,
      openIncidentCount: incidents.length,
      selectedCandidateFound: Boolean(selected),
    });

    if (selectedPatchId) {
      db.prepare("UPDATE patches SET status = ? WHERE id = ?").run(
        patchStatusForDecision(decision),
        selectedPatchId,
      );
    }
    if (selectedIncidentId) {
      db.prepare("UPDATE incidents SET status = ? WHERE id = ?").run(
        incidentStatusForDecision(decision),
        selectedIncidentId,
      );
    }

    const notes = decision === "ADVANCE"
      ? (
        selected
          ? "Iteration is green: required prechecks passed, runtime+config invariants passed, patch selected."
          : "Iteration is green: required prechecks passed, runtime+config invariants passed, and there are no open incidents."
      )
      : "Iteration held: missing required prechecks, stop-ship invariant, runtime inspection degradation, or no safe patch.";
    const checkpointId = insertCheckpoint(db, {
      iteration: input.iteration,
      decision,
      notes,
    });

    const preflightLogPath = await writePreflightLog(
      input.iteration,
      preflight.map((item) => ({
        name: item.name,
        ok: item.ok,
        output: item.output,
      })),
    );
    const runtimeInspectionLogPath = await writeRuntimeInspectionLog(
      input.iteration,
      runtimeInspection,
    );
    const attestationLogPath = await writeAttestationLog({
      iteration: input.iteration,
      decision,
      patchId: selectedPatchId,
    });
    const chainIdentityAttestationPath = await writeChainIdentityAttestationLog({
      iteration: input.iteration,
      governanceMode: input.governanceNeeded,
      preflight: preflight.map((item) => ({
        name: item.name,
        ok: item.ok,
        output: item.output,
      })),
    });
    const evidence = await packageEvidence({
      dbPath: input.dbPath,
      patchId: selectedPatchId ?? undefined,
      artifacts: [
        {
          type: "preflight_log",
          uri: preflightLogPath,
          notes: "Preflight check outputs",
        },
        {
          type: "runtime_inspection_log",
          uri: runtimeInspectionLogPath,
          notes: "Runtime container security inspection outputs",
        },
        {
          type: "attestation",
          uri: attestationLogPath,
          notes: "SLSA-like iteration attestation metadata",
        },
        {
          type: "chain_identity_attestation",
          uri: chainIdentityAttestationPath,
          notes: "Signed L1/L2/L3 chain identity attestation",
        },
      ],
    });
    evidenceManifestPath = evidence.manifestPath;

    return {
      iteration: input.iteration,
      decision,
      checkpointId,
      selectedPatchId,
      selectedIncidentId,
      rankedPatchIds: ranked.map((patch) => patch.id),
      invariantViolations: invariantResult.violations,
      preflight: preflight.map((item) => ({
        name: item.name,
        ok: item.ok,
        output: item.output,
      })),
      evidenceManifestPath,
    };
  } finally {
    db.close();
  }
}

function parseArgs(argv: string[]): GhostloopIterationInput {
  const parsed: GhostloopIterationInput = {
    iteration: 1,
    vmTarget: "devnet",
    composeTargets: [],
    riskBudget: "LOW",
    governanceNeeded: "NONE",
    logFiles: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--iteration" && argv[i + 1]) {
      parsed.iteration = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--vm" && argv[i + 1]) {
      parsed.vmTarget = argv[i + 1] as VmTarget;
      i += 1;
      continue;
    }
    if (token === "--compose" && argv[i + 1]) {
      parsed.composeTargets.push(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--risk" && argv[i + 1]) {
      parsed.riskBudget = argv[i + 1] as RiskBudget;
      i += 1;
      continue;
    }
    if (token === "--governance" && argv[i + 1]) {
      parsed.governanceNeeded = argv[i + 1] as GovernanceMode;
      i += 1;
      continue;
    }
    if (token === "--log" && argv[i + 1]) {
      parsed.logFiles?.push(argv[i + 1]);
      i += 1;
    }
  }

  return parsed;
}

async function cliMain() {
  const input = parseArgs(process.argv.slice(2));
  const result = await runGhostloopIteration(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  cliMain().catch((error) => {
    process.stderr.write(`ghostloop_failed: ${String(error)}\n`);
    process.exit(1);
  });
}
