import { ghost } from '@ghostchain/sdk';

export type PolicyUpdate = {
  policyKey: string;
  value: bigint;
  evidenceHash: string;
  metadataHash: string;
  nonce: bigint;
  issuedAt: bigint;
  validUntil: bigint;
  emergency: boolean;
};

const DOMAIN_TYPEHASH = ghost.keccak256(
  ghost.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
);
const UPDATE_TYPEHASH = ghost.keccak256(
  ghost.toUtf8Bytes(
    'PolicyUpdate(bytes32 policyKey,uint256 value,bytes32 evidenceHash,bytes32 metadataHash,uint256 nonce,uint64 issuedAt,uint64 validUntil,bool emergency)'
  )
);

const toBigIntValue = (value: string | number | bigint) => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') {
    if (value.startsWith('0x')) return BigInt(value);
    return BigInt(value);
  }
  return 0n;
};

export const normalizeBytes32 = (value: string) => {
  if (ghost.isHexString(value, 32)) return value;
  return ghost.keccak256(ghost.toUtf8Bytes(value));
};

export const buildPolicyUpdate = (input: {
  policyKey: string;
  value: string | number | bigint;
  evidenceHash: string;
  metadataHash: string;
  nonce?: string | number | bigint;
  issuedAt: number;
  validUntil: number;
  emergency: boolean;
}): PolicyUpdate => {
  const nonce =
    input.nonce !== undefined && input.nonce !== null ? toBigIntValue(input.nonce) : ghost.toBigInt(input.evidenceHash);
  return {
    policyKey: input.policyKey,
    value: toBigIntValue(input.value),
    evidenceHash: input.evidenceHash,
    metadataHash: input.metadataHash,
    nonce,
    issuedAt: BigInt(input.issuedAt),
    validUntil: BigInt(input.validUntil),
    emergency: input.emergency
  };
};

export const hashPolicyUpdate = (update: PolicyUpdate): string => {
  const encoded = ghost.AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'bytes32', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint64', 'uint64', 'bool'],
    [
      UPDATE_TYPEHASH,
      update.policyKey,
      update.value,
      update.evidenceHash,
      update.metadataHash,
      update.nonce,
      update.issuedAt,
      update.validUntil,
      update.emergency
    ]
  );
  return ghost.keccak256(encoded);
};

export const domainSeparator = (chainId: number, verifyingContract: string): string => {
  const encoded = ghost.AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
    [
      DOMAIN_TYPEHASH,
      ghost.keccak256(ghost.toUtf8Bytes('GhostAIProposalExecutor')),
      ghost.keccak256(ghost.toUtf8Bytes('1')),
      chainId,
      verifyingContract
    ]
  );
  return ghost.keccak256(encoded);
};

export const digestPolicyUpdate = (updateHash: string, chainId: number, verifyingContract: string): string => {
  const domain = domainSeparator(chainId, verifyingContract);
  return ghost.keccak256(ghost.concat(['0x1901', domain, updateHash]));
};
