import { keccak256, solidityPacked, toUtf8Bytes, getAddress } from '@ghostchain/sdk';
import type { DecisionInput } from '../engine/types';
import { signParamsHash } from './ecdsa';
import { config } from '../config';

export type Attestation = {
  paramsHash: string;
  expiry: number;
  signature: string;
};

export const buildAttestation = async (input: DecisionInput, resource: Record<string, unknown> | undefined): Promise<Attestation> => {
  const expiry = Math.floor(Date.now() / 1000) + config.attestationExpirySeconds;
  const resourceHash = keccak256(toUtf8Bytes(stableStringify(resource || {})));
  const paramsHash = keccak256(solidityPacked(['bytes32', 'string'], [resourceHash, input.requestId]));
  const actionHash = keccak256(toUtf8Bytes(input.action));
  const chainId = BigInt(input.subject.chainId);
  const subject = getAddress(input.subject.walletAddress);
  const digest = keccak256(
    solidityPacked(['address', 'bytes32', 'bytes32', 'uint256', 'uint256'], [subject, actionHash, paramsHash, expiry, chainId])
  );
  const signature = await signParamsHash(digest, config.attestationPrivateKey);
  return { paramsHash, expiry, signature };
};

export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${entries.join(',')}}`;
};
