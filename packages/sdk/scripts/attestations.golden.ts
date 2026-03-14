import {
  AI_ATTESTATION_TYPEHASH,
  EIP712_DOMAIN_TYPEHASH,
  GHOST_AI_GOLDEN_VECTOR,
  computeAttestationDigest,
  computeAttestationId,
  computeDomainSeparator,
  computeStructHash
} from "../src/ai/attestations.ts";

const assertHex = (label: string, actual: string, expected: string) => {
  const a = actual.toLowerCase();
  const e = expected.toLowerCase();
  if (a !== e) {
    throw new Error(`${label} mismatch\nactual:   ${actual}\nexpected: ${expected}`);
  }
  console.log(`[ok] ${label}: ${actual}`);
};

const { domain, attestation, expected } = GHOST_AI_GOLDEN_VECTOR;

assertHex("domain typehash", EIP712_DOMAIN_TYPEHASH, expected.domainTypehash);
assertHex("attestation typehash", AI_ATTESTATION_TYPEHASH, expected.attestationTypehash);

const domainSeparator = computeDomainSeparator(domain);
assertHex("domain separator", domainSeparator, expected.domainSeparator);

const attestationId = computeAttestationId(attestation);
assertHex("attestation id", attestationId, expected.attestationId);

const structHash = computeStructHash(attestation);
assertHex("struct hash", structHash, expected.structHash);

const digest = computeAttestationDigest(domain, attestation);
assertHex("digest", digest, expected.digest);

console.log("Golden vector verification passed.");
