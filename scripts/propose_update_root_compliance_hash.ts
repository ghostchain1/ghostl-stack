/* eslint-disable no-console */
import { ethers } from 'ethers';
import {
  EXECUTOR_ABI_FRAGMENTS,
  buildCall,
  buildExecutorCalldata,
  computeGovernorHash,
  computeProposalHash,
  type ExecutorMode
} from '../contracts/scripts/governance/build_proposal_calldata';

const DEV_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ??
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const RPC_L1 = process.env.RPC_L1 ?? 'http://localhost:18545';

const GOVERNOR_ADDRESS = process.env.GOVERNOR_ADDRESS;
const EXECUTOR_ADDRESS = process.env.PROPOSAL_EXECUTOR_ADDRESS;
const EXECUTOR_MODE = process.env.PROPOSAL_EXECUTOR_MODE as ExecutorMode | undefined;
const PROPOSE_VIA_EXECUTOR = (process.env.PROPOSE_VIA_EXECUTOR ?? 'false') === 'true';
const DESCRIPTION = process.env.PROPOSAL_DESCRIPTION ?? 'Update compliance root hash';

const ROOT_ORACLE_L1_ADDRESS = process.env.ROOT_ORACLE_L1_ADDRESS;
const ROOT_MIRROR_L2_ADDRESS = process.env.ROOT_MIRROR_L2_ADDRESS;
const ROOT_MIRROR_L3_ADDRESS = process.env.ROOT_MIRROR_L3_ADDRESS;

const ROOT_HASH = process.env.ROOT_HASH;
const ROOT_EPOCH = process.env.ROOT_EPOCH;
const PROOF_ID = process.env.PROOF_ID ?? '0x' + '00'.repeat(32);

function requireAddress(name: string, value: string | undefined) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ethers.getAddress(value);
}

function requireBytes32(name: string, value: string | undefined) {
  if (!value || !ethers.isHexString(value, 32)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return value;
}

function requireEpoch(name: string, value: string | undefined) {
  const epoch = Number(value ?? '');
  if (!Number.isFinite(epoch) || epoch <= 0) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return epoch;
}

async function main() {
  const oracle = requireAddress('ROOT_ORACLE_L1_ADDRESS', ROOT_ORACLE_L1_ADDRESS);
  const rootHash = requireBytes32('ROOT_HASH', ROOT_HASH);
  const proofId = requireBytes32('PROOF_ID', PROOF_ID);

  const calls = [];
  const oracleAbi = ['function updateRoot(bytes32 newRootHash,bytes32 proofId) external returns (uint256)'];
  calls.push(buildCall(oracle, oracleAbi, 'updateRoot', [rootHash, proofId]));

  const mirrorAbi = ['function updateRoot(bytes32 rootHash,uint256 rootEpoch,bytes32 proofId) external'];
  if (ROOT_MIRROR_L2_ADDRESS) {
    const mirror = requireAddress('ROOT_MIRROR_L2_ADDRESS', ROOT_MIRROR_L2_ADDRESS);
    const rootEpoch = requireEpoch('ROOT_EPOCH', ROOT_EPOCH);
    calls.push(buildCall(mirror, mirrorAbi, 'updateRoot', [rootHash, rootEpoch, proofId]));
  }
  if (ROOT_MIRROR_L3_ADDRESS) {
    const mirror = requireAddress('ROOT_MIRROR_L3_ADDRESS', ROOT_MIRROR_L3_ADDRESS);
    const rootEpoch = requireEpoch('ROOT_EPOCH', ROOT_EPOCH);
    calls.push(buildCall(mirror, mirrorAbi, 'updateRoot', [rootHash, rootEpoch, proofId]));
  }

  console.log('[compliance-root] calls:', calls.length);
  calls.forEach((call, idx) => {
    console.log(`[compliance-root] call[${idx}] target:`, call.target);
    console.log(`[compliance-root] call[${idx}] calldata:`, call.data);
    console.log(
      `[compliance-root] call[${idx}] governorHash:`,
      computeGovernorHash(call.target, call.value, call.data, DESCRIPTION)
    );
  });

  let executorTarget: string | null = null;
  let executorCalldata: string | null = null;

  if (EXECUTOR_ADDRESS) {
    const executor = requireAddress('PROPOSAL_EXECUTOR_ADDRESS', EXECUTOR_ADDRESS);
    const execBundle = buildExecutorCalldata(EXECUTOR_ABI_FRAGMENTS, calls, EXECUTOR_MODE);
    executorTarget = executor;
    executorCalldata = execBundle.calldata;
    console.log('[compliance-root] executorMode:', execBundle.mode);
    console.log('[compliance-root] executorCalldata:', execBundle.calldata);
    console.log('[compliance-root] executorHash:', computeProposalHash(executor, execBundle.calldata, DESCRIPTION));
  }

  if (!GOVERNOR_ADDRESS) {
    console.log('[compliance-root] GOVERNOR_ADDRESS not set; calldata emitted only.');
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
    const tx = await governorContract.propose(executorTarget, 0, executorCalldata);
    const receipt = await tx.wait();
    console.log('[compliance-root] proposal tx:', tx.hash, 'status:', receipt?.status);
    return;
  }

  if (calls.length !== 1) {
    throw new Error('direct_propose_requires_single_call');
  }

  const tx = await governorContract.propose(calls[0].target, 0, calls[0].data);
  const receipt = await tx.wait();
  console.log('[compliance-root] proposal tx:', tx.hash, 'status:', receipt?.status);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
