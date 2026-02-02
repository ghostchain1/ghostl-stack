import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_ATTESTATION_TYPEHASH,
  EIP712_DOMAIN_TYPEHASH,
  GHOST_AI_GOLDEN_VECTOR,
  computeAttestationId,
  computeDigest,
  computeDomainSeparator,
  computeStructHash
} from "../src/attestation.js";

test("GhostAI golden vector matches canonical hashes", () => {
  const { domain, attestation, expected } = GHOST_AI_GOLDEN_VECTOR;

  assert.equal(EIP712_DOMAIN_TYPEHASH, expected.domainTypehash);
  assert.equal(AI_ATTESTATION_TYPEHASH, expected.attestationTypehash);

  const domainSeparator = computeDomainSeparator(domain);
  const structHash = computeStructHash(attestation);
  const digest = computeDigest(domain, attestation);
  const attestationId = computeAttestationId(attestation);

  assert.equal(domainSeparator, expected.domainSeparator);
  assert.equal(structHash, expected.structHash);
  assert.equal(digest, expected.digest);
  assert.equal(attestationId, expected.attestationId);
});

