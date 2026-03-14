/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { ghost } from 'ghost';
import {
  EXECUTOR_ABI_FRAGMENTS,
  buildCall,
  buildExecutorCalldata,
  computeGovernorHash,
  computeProposalHash,
  type ExecutorMode
} from './governance/build_proposal_calldata';

const CONTRACTS_ROOT = path.resolve(__dirname, '..');
const STACK_ROOT = path.resolve(CONTRACTS_ROOT, '..');

const DEFAULT_STACK_ENV_PATH = path.join(STACK_ROOT, 'services', 'stack.env');
const STACK_ENV_PATH = process.env.STACK_ENV_PATH || DEFAULT_STACK_ENV_PATH;

const OUTPUT_PATH =
  process.env.GST_CONSTITUTION_PROPOSAL_OUTPUT ||
  path.join(STACK_ROOT, 'docs', 'gst-migration', 'PROPOSAL-CALLDATA.json');

const DESCRIPTION =
  process.env.GST_CONSTITUTION_DESCRIPTION ||
  'GST Constitution: lock native token metadata and enforce GST-only semantics';

const POLICY_REGISTRY_ADDRESS = process.env.POLICY_REGISTRY_ADDRESS;
const EXECUTOR_ADDRESS = process.env.PROPOSAL_EXECUTOR_ADDRESS;
const EXECUTOR_MODE = process.env.PROPOSAL_EXECUTOR_MODE as ExecutorMode | undefined;

type EnvMap = Record<string, string>;

function parseEnvFile(envPath: string): EnvMap {
  if (!fs.existsSync(envPath)) return {};
  const out: EnvMap = {};
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function requireAddress(name: string, value: string | undefined) {
  if (!value || !ghost.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ghost.getAddress(value);
}

const POLICY_REGISTRY_ABI = [
  'function setPolicySetting(bytes32 key,uint256 min,uint256 max,uint64 activationDelay,uint64 emergencyExpiry,uint64 rollbackWindow,bool hasBounds,bool enabled) external',
  'function applyPolicy(bytes32 key,uint256 value,bytes32 evidenceHash) external returns (bool)'
] as const;

const POLICY_GST_NATIVE_ONLY = ghost.id('ghost.policy.native.gst_only');
const POLICY_GST_ONLY_L1_L2_L3 = ghost.id('ghost.policy.native.gst_l1_l2_l3_only');
const POLICY_NO_LEGACY_BRANDING_SURFACES = ghost.id('ghost.policy.branding.no_legacy_eth_surface');
const POLICY_REQUIRE_GST_LEAKAGE_GATE = ghost.id('ghost.policy.release.gst_leakage_gate_required');
const POLICY_REQUIRE_GST_INVARIANTS = ghost.id('ghost.policy.release.gst_invariant_test_required');
const POLICY_NATIVE_METADATA_GOVERNANCE_ONLY = ghost.id('ghost.policy.native.metadata_governance_only');
const POLICY_NATIVE_TOKEN_DECIMALS = ghost.id('ghost.policy.native.token.decimals');
const POLICY_NATIVE_TOKEN_SYMBOL_HASH = ghost.id('ghost.policy.native.token.symbol.hash');
const POLICY_NATIVE_TOKEN_NAME_HASH = ghost.id('ghost.policy.native.token.name.hash');

const EVIDENCE_HASH = ghost.id('ghost.evidence.gst_constitution.v1');
const SYMBOL = 'GST';
const NAME = 'Ghost';
type ProposalCall = ReturnType<typeof buildCall>;

function pushBooleanPolicy(calls: ProposalCall[], policyRegistry: string, policyKey: string) {
  calls.push(
    buildCall(policyRegistry, POLICY_REGISTRY_ABI, 'setPolicySetting', [
      policyKey,
      1n,
      1n,
      0,
      0,
      0,
      true,
      true
    ])
  );
  calls.push(buildCall(policyRegistry, POLICY_REGISTRY_ABI, 'applyPolicy', [policyKey, 1n, EVIDENCE_HASH]));
}

function main() {
  const envFromFile = parseEnvFile(STACK_ENV_PATH);

  const policyRegistry = requireAddress(
    'POLICY_REGISTRY_ADDRESS',
    POLICY_REGISTRY_ADDRESS || envFromFile.POLICY_REGISTRY_ADDRESS || envFromFile.AGENT_POLICY_CONTRACT
  );

  const executor = EXECUTOR_ADDRESS
    ? requireAddress('PROPOSAL_EXECUTOR_ADDRESS', EXECUTOR_ADDRESS)
    : envFromFile.EXECUTOR_ADDRESS_L1
      ? requireAddress('EXECUTOR_ADDRESS_L1', envFromFile.EXECUTOR_ADDRESS_L1)
      : null;

  const calls: ProposalCall[] = [];

  // Enforce GST-native constitutional policies (bool = 1).
  pushBooleanPolicy(calls, policyRegistry, POLICY_GST_NATIVE_ONLY);
  pushBooleanPolicy(calls, policyRegistry, POLICY_GST_ONLY_L1_L2_L3);
  pushBooleanPolicy(calls, policyRegistry, POLICY_NO_LEGACY_BRANDING_SURFACES);
  pushBooleanPolicy(calls, policyRegistry, POLICY_REQUIRE_GST_LEAKAGE_GATE);
  pushBooleanPolicy(calls, policyRegistry, POLICY_REQUIRE_GST_INVARIANTS);
  pushBooleanPolicy(calls, policyRegistry, POLICY_NATIVE_METADATA_GOVERNANCE_ONLY);

  // Lock decimals to 18 (min=max=18).
  calls.push(
    buildCall(policyRegistry, POLICY_REGISTRY_ABI, 'setPolicySetting', [
      POLICY_NATIVE_TOKEN_DECIMALS,
      18n,
      18n,
      0,
      0,
      0,
      true,
      true
    ])
  );
  calls.push(
    buildCall(policyRegistry, POLICY_REGISTRY_ABI, 'applyPolicy', [POLICY_NATIVE_TOKEN_DECIMALS, 18n, EVIDENCE_HASH])
  );

  // Record metadata hashes (no bounds; full uint256 range).
  const symbolHashValue = BigInt(ghost.id(SYMBOL));
  const nameHashValue = BigInt(ghost.id(NAME));

  calls.push(
    buildCall(policyRegistry, POLICY_REGISTRY_ABI, 'setPolicySetting', [
      POLICY_NATIVE_TOKEN_SYMBOL_HASH,
      0n,
      (1n << 256n) - 1n,
      0,
      0,
      0,
      false,
      true
    ])
  );
  calls.push(
    buildCall(policyRegistry, POLICY_REGISTRY_ABI, 'applyPolicy', [POLICY_NATIVE_TOKEN_SYMBOL_HASH, symbolHashValue, EVIDENCE_HASH])
  );

  calls.push(
    buildCall(policyRegistry, POLICY_REGISTRY_ABI, 'setPolicySetting', [
      POLICY_NATIVE_TOKEN_NAME_HASH,
      0n,
      (1n << 256n) - 1n,
      0,
      0,
      0,
      false,
      true
    ])
  );
  calls.push(
    buildCall(policyRegistry, POLICY_REGISTRY_ABI, 'applyPolicy', [POLICY_NATIVE_TOKEN_NAME_HASH, nameHashValue, EVIDENCE_HASH])
  );

  const serializedCalls = calls.map((call) => ({
    ...call,
    value: call.value.toString()
  }));

  const payload: Record<string, unknown> = {
    description: DESCRIPTION,
    descriptionHash: ghost.id(DESCRIPTION),
    policyRegistry,
    evidenceHash: EVIDENCE_HASH,
    policies: {
      gstNativeOnly: POLICY_GST_NATIVE_ONLY,
      gstOnlyL1L2L3: POLICY_GST_ONLY_L1_L2_L3,
      noLegacyBrandingSurfaces: POLICY_NO_LEGACY_BRANDING_SURFACES,
      requireGstLeakageGate: POLICY_REQUIRE_GST_LEAKAGE_GATE,
      requireGstInvariants: POLICY_REQUIRE_GST_INVARIANTS,
      nativeMetadataGovernanceOnly: POLICY_NATIVE_METADATA_GOVERNANCE_ONLY,
      decimals: POLICY_NATIVE_TOKEN_DECIMALS,
      symbolHash: POLICY_NATIVE_TOKEN_SYMBOL_HASH,
      nameHash: POLICY_NATIVE_TOKEN_NAME_HASH
    },
    calls: serializedCalls
  };

  if (executor) {
    const execBundle = buildExecutorCalldata(EXECUTOR_ABI_FRAGMENTS, calls, EXECUTOR_MODE);
    payload['executor'] = {
      target: executor,
      mode: execBundle.mode,
      calldata: execBundle.calldata,
      proposalHash: computeProposalHash(executor, execBundle.calldata, DESCRIPTION)
    };
    payload['governorHash'] = computeGovernorHash(executor, 0n, execBundle.calldata, DESCRIPTION);
  } else {
    payload['executor'] = null;
    payload['governorHash'] = computeGovernorHash(calls[0].target, calls[0].value, calls[0].data, DESCRIPTION);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log('[gst-constitution] calls:', calls.length);
  console.log('[gst-constitution] output:', OUTPUT_PATH);
  if (executor) {
    console.log('[gst-constitution] executor:', executor);
  } else {
    console.log('[gst-constitution] executor not configured; proposal will target first call only');
  }
}

main();
