import { ghost } from '@ghostchain/sdk';
import type { PolicyUpdate } from './proposal.js';

const EXECUTOR_ABI = [
  'function executePolicyUpdate((bytes32 policyKey,uint256 value,bytes32 evidenceHash,bytes32 metadataHash,uint256 nonce,uint64 issuedAt,uint64 validUntil,bool emergency),bytes[] signatures,bytes32 evidenceKind,uint256 proposalId) returns (bytes32)'
];

export const normalizeBytes32 = (value: string) => {
  if (ghost.isHexString(value, 32)) return value;
  return ghost.keccak256(ghost.toUtf8Bytes(value));
};

export const signDigest = (digest: string, privateKeys: string[]) => {
  return privateKeys.map((key) => {
    const wallet = new ghost.Wallet(key);
    const signature = wallet.signingKey.sign(digest);
    return {
      signer: wallet.address,
      signature: ghost.Signature.from(signature).serialized
    };
  });
};

export const submitPolicyUpdate = async (input: {
  rpcUrl: string;
  executorAddress: string;
  submitterKey: string;
  update: PolicyUpdate;
  signatures: string[];
  evidenceKind: string;
  proposalId: number;
}) => {
  const provider = new ghost.JsonRpcProvider(input.rpcUrl);
  const wallet = new ghost.Wallet(input.submitterKey, provider);
  const executor = new ghost.Contract(input.executorAddress, EXECUTOR_ABI, wallet);
  const tx = await executor.executePolicyUpdate(
    {
      policyKey: input.update.policyKey,
      value: input.update.value,
      evidenceHash: input.update.evidenceHash,
      metadataHash: input.update.metadataHash,
      nonce: input.update.nonce,
      issuedAt: input.update.issuedAt,
      validUntil: input.update.validUntil,
      emergency: input.update.emergency
    },
    input.signatures,
    normalizeBytes32(input.evidenceKind),
    input.proposalId
  );
  const receipt = await tx.wait();
  return { txHash: tx.hash, blockNumber: receipt?.blockNumber ?? null };
};
