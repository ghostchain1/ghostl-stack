/* eslint-disable no-console */
import { ethers } from 'ethers';
import {
  EXECUTOR_ABI_FRAGMENTS,
  buildCall,
  buildExecutorCalldata,
  computeGovernorHash,
  computeProposalHash,
  type ExecutorMode
} from './governance/build_proposal_calldata';

const DEV_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ??
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const RPC_L1 = process.env.RPC_L1 ?? 'http://localhost:18545';

const GOVERNOR_ADDRESS = process.env.GOVERNOR_ADDRESS;
const SLASHING_MANAGER_ADDRESS = process.env.SLASHING_MANAGER_ADDRESS;
const EXECUTOR_ADDRESS = process.env.PROPOSAL_EXECUTOR_ADDRESS;
const EXECUTOR_MODE = process.env.PROPOSAL_EXECUTOR_MODE as ExecutorMode | undefined;
const PROPOSE_VIA_EXECUTOR = (process.env.PROPOSE_VIA_EXECUTOR ?? 'false') === 'true';
const DESCRIPTION = process.env.PROPOSAL_DESCRIPTION ?? 'Update fee policy (GHOST)';

const toGweiWei = (value: string | number | undefined, fallbackGwei: number) => {
  const gwei = Number(value ?? fallbackGwei);
  if (!Number.isFinite(gwei) || gwei <= 0) {
    throw new Error(`invalid_gwei:${value}`);
  }
  return BigInt(Math.trunc(gwei * 1_000_000_000));
};

const toGhostWei = (value: string | number | undefined, fallbackGhost: number) => {
  const ghost = Number(value ?? fallbackGhost);
  if (!Number.isFinite(ghost) || ghost <= 0) {
    throw new Error(`invalid_ghost:${value}`);
  }
  return ethers.parseUnits(ghost.toString(), 18);
};

function requireAddress(name: string, value: string | undefined) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ethers.getAddress(value);
}

async function main() {
  const slashing = requireAddress('SLASHING_MANAGER_ADDRESS', SLASHING_MANAGER_ADDRESS);

  const policy = {
    maxBaseFeeGHOST: toGweiWei(process.env.MAX_BASE_FEE_GWEI, 2),
    maxPriorityFeeGHOST: toGweiWei(process.env.MAX_PRIORITY_FEE_GWEI, 1),
    spikeThresholdBps: Number(process.env.SPIKE_THRESHOLD_BPS ?? 500),
    windowSeconds: Number(process.env.WINDOW_SECONDS ?? 300),
    violationPenaltyBps: Number(process.env.VIOLATION_PENALTY_BPS ?? 1_000),
    minBondGHOST: toGhostWei(process.env.MIN_BOND_GHOST, 10)
  } as const;

  if (policy.spikeThresholdBps < 0 || policy.spikeThresholdBps > 10_000) {
    throw new Error(`spikeThresholdBps_out_of_bounds:${policy.spikeThresholdBps}`);
  }
  if (policy.windowSeconds < 30 || policy.windowSeconds > 86_400) {
    throw new Error(`windowSeconds_out_of_bounds:${policy.windowSeconds}`);
  }
  if (policy.violationPenaltyBps <= 0 || policy.violationPenaltyBps > 10_000) {
    throw new Error(`violationPenaltyBps_out_of_bounds:${policy.violationPenaltyBps}`);
  }

  const slashingAbi = [
    'function setFeePolicy((uint256 maxBaseFeeGHOST,uint256 maxPriorityFeeGHOST,uint256 spikeThresholdBps,uint256 windowSeconds,uint256 violationPenaltyBps,uint256 minBondGHOST) policy) external'
  ];
  const call = buildCall(slashing, slashingAbi, 'setFeePolicy', [policy]);
  const calldata = call.data;

  console.log('[fee-policy] target:', slashing);
  console.log('[fee-policy] calldata:', calldata);
  console.log('[fee-policy] governorHash:', computeGovernorHash(call.target, call.value, call.data, DESCRIPTION));
  console.log('[fee-policy] params:', {
    ...policy,
    maxBaseFeeGHOST: policy.maxBaseFeeGHOST.toString(),
    maxPriorityFeeGHOST: policy.maxPriorityFeeGHOST.toString(),
    minBondGHOST: policy.minBondGHOST.toString()
  });

  let executorTarget: string | null = null;
  let executorCalldata: string | null = null;

  if (EXECUTOR_ADDRESS) {
    const executor = requireAddress('PROPOSAL_EXECUTOR_ADDRESS', EXECUTOR_ADDRESS);
    try {
      const execBundle = buildExecutorCalldata(EXECUTOR_ABI_FRAGMENTS, [call], EXECUTOR_MODE);
      executorTarget = executor;
      executorCalldata = execBundle.calldata;
      console.log('[fee-policy] executorMode:', execBundle.mode);
      console.log('[fee-policy] executorCalldata:', execBundle.calldata);
      console.log('[fee-policy] executorHash:', computeProposalHash(executor, execBundle.calldata, DESCRIPTION));
    } catch (err) {
      console.warn('[fee-policy] executor calldata unavailable:', (err as Error).message);
    }
  }

  if (!GOVERNOR_ADDRESS) {
    console.log('[fee-policy] GOVERNOR_ADDRESS not set; calldata emitted only.');
    return;
  }

  const governor = requireAddress('GOVERNOR_ADDRESS', GOVERNOR_ADDRESS);
  const provider = new ethers.JsonRpcProvider(RPC_L1);
  const signer = new ethers.Wallet(DEV_PRIVATE_KEY, provider);
  const governorContract = new ethers.Contract(
    governor,
    ['function propose(address target,uint256 value,bytes data) external returns (uint256)'],
    signer
  );

  if (PROPOSE_VIA_EXECUTOR) {
    if (!executorTarget || !executorCalldata) {
      throw new Error('executor_payload_required_for_propose_via_executor');
    }
    console.log('[fee-policy] proposing via executor target:', executorTarget);
    const tx = await governorContract.propose(executorTarget, 0, executorCalldata);
    const receipt = await tx.wait();
    console.log('[fee-policy] proposal tx:', tx.hash, 'status:', receipt?.status);
    return;
  }

  const tx = await governorContract.propose(slashing, 0, calldata);
  const receipt = await tx.wait();
  console.log('[fee-policy] proposal tx:', tx.hash, 'status:', receipt?.status);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
