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
const WATCHER_ADDRESS = process.env.FEE_WATCHER_ADDRESS;
const WATCHER_ALLOWED = (process.env.FEE_WATCHER_ALLOWED ?? 'true') === 'true';
const AUTO_EXEC_ENABLED = (process.env.AUTO_EXEC_ENABLED ?? 'false') === 'true';
const EXECUTOR_ADDRESS = process.env.PROPOSAL_EXECUTOR_ADDRESS;
const EXECUTOR_MODE = process.env.PROPOSAL_EXECUTOR_MODE as ExecutorMode | undefined;
const PROPOSE_VIA_EXECUTOR = (process.env.PROPOSE_VIA_EXECUTOR ?? 'false') === 'true';
const DESCRIPTION = process.env.PROPOSAL_DESCRIPTION ?? 'Update slashing controls (GHOST)';

function requireAddress(name: string, value: string | undefined) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ethers.getAddress(value);
}

type GovernanceCall = {
  label: string;
  call: ReturnType<typeof buildCall>;
};

async function main() {
  const slashing = requireAddress('SLASHING_MANAGER_ADDRESS', SLASHING_MANAGER_ADDRESS);

  const slashingAbi = [
    'function setWatcherRoles(address watcher,bool allowed) external',
    'function enableAutoExec(bool enabled) external'
  ];

  const calls: GovernanceCall[] = [];

  if (WATCHER_ADDRESS) {
    const watcher = requireAddress('FEE_WATCHER_ADDRESS', WATCHER_ADDRESS);
    const call = buildCall(slashing, slashingAbi, 'setWatcherRoles', [watcher, WATCHER_ALLOWED]);
    calls.push({ label: `setWatcherRoles(${watcher},${WATCHER_ALLOWED})`, call });
  } else {
    console.log('[slashing] FEE_WATCHER_ADDRESS not set; skipping watcher proposal.');
  }

  const autoExecCall = buildCall(slashing, slashingAbi, 'enableAutoExec', [AUTO_EXEC_ENABLED]);
  calls.push({ label: `enableAutoExec(${AUTO_EXEC_ENABLED})`, call: autoExecCall });

  if (AUTO_EXEC_ENABLED) {
    console.warn('[slashing] AUTO_EXEC_ENABLED=true. Ensure governance approval and monitoring are in place.');
  }

  console.log('[slashing] target:', slashing);
  calls.forEach((entry) => {
    console.log('[slashing] calldata', entry.label, entry.call.data);
    console.log('[slashing] governorHash', entry.label, computeGovernorHash(entry.call.target, entry.call.value, entry.call.data, DESCRIPTION));
  });

  let executorTarget: string | null = null;
  let executorCalldata: string | null = null;

  if (EXECUTOR_ADDRESS) {
    const executor = requireAddress('PROPOSAL_EXECUTOR_ADDRESS', EXECUTOR_ADDRESS);
    try {
      const execBundle = buildExecutorCalldata(
        EXECUTOR_ABI_FRAGMENTS,
        calls.map((entry) => entry.call),
        EXECUTOR_MODE
      );
      executorTarget = executor;
      executorCalldata = execBundle.calldata;
      console.log('[slashing] executorMode:', execBundle.mode);
      console.log('[slashing] executorCalldata:', execBundle.calldata);
      console.log('[slashing] executorHash:', computeProposalHash(executor, execBundle.calldata, DESCRIPTION));
    } catch (err) {
      console.warn('[slashing] executor calldata unavailable:', (err as Error).message);
    }
  }

  if (!GOVERNOR_ADDRESS) {
    console.log('[slashing] GOVERNOR_ADDRESS not set; calldata emitted only.');
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
    console.log('[slashing] proposing via executor target:', executorTarget);
    const tx = await governorContract.propose(executorTarget, 0, executorCalldata);
    const receipt = await tx.wait();
    console.log('[slashing] proposed executor bundle tx:', tx.hash, 'status:', receipt?.status);
    return;
  }

  for (const entry of calls) {
    const tx = await governorContract.propose(slashing, 0, entry.call.data);
    const receipt = await tx.wait();
    console.log('[slashing] proposed', entry.label, 'tx:', tx.hash, 'status:', receipt?.status);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
