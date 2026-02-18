import crypto from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAttestationSummary,
  buildChainIdentityAttestation,
  signPayloadEd25519,
} from "../evidence/packager.ts";

test("attestation summary includes provenance envelope fields", () => {
  const attestation = buildAttestationSummary({
    iteration: 16,
    commit: "abc123",
    decision: "ADVANCE",
    patchId: 42,
  }) as {
    _type?: string;
    buildType?: string;
    builder?: { id?: string };
    invocation?: { iteration?: number; commit?: string; patchId?: number | null };
    metadata?: { decision?: string; generatedAt?: string };
  };

  assert.equal(attestation._type, "https://slsa.dev/provenance/v1");
  assert.equal(attestation.buildType, "ghostcontrol/iteration");
  assert.equal(attestation.builder?.id, "ghostloop-v1");
  assert.equal(attestation.invocation?.iteration, 16);
  assert.equal(attestation.invocation?.commit, "abc123");
  assert.equal(attestation.invocation?.patchId, 42);
  assert.equal(attestation.metadata?.decision, "ADVANCE");
  assert.match(attestation.metadata?.generatedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
});

test("attestation summary sets patchId to null when omitted", () => {
  const attestation = buildAttestationSummary({
    iteration: 16,
    commit: "abc123",
    decision: "HOLD",
  }) as { invocation?: { patchId?: number | null } };

  assert.equal(attestation.invocation?.patchId, null);
});

test("chain identity attestation includes layer snapshots", () => {
  const attestation = buildChainIdentityAttestation({
    iteration: 7,
    governanceMode: "DEVNET",
    commit: "cafebabe",
    identities: [
      {
        layer: "l1",
        checkName: "rpc_l1_chain_id",
        rpcUrl: "http://localhost:18545",
        expectedChainIdDec: 14000101,
        expectedChainIdHex: "0xd5a8e5",
        observedChainIdHex: "0xd5a8e5",
        checkOk: true,
        checkOutput: "rpc_chain_id_ok",
      },
    ],
  }) as {
    _type?: string;
    invocation?: { governanceMode?: string };
    identities?: Array<{ layer?: string; checkOk?: boolean }>;
  };

  assert.equal(attestation._type, "ghostcontrol/chain-identity-attestation/v1");
  assert.equal(attestation.invocation?.governanceMode, "DEVNET");
  assert.equal(attestation.identities?.[0]?.layer, "l1");
  assert.equal(attestation.identities?.[0]?.checkOk, true);
});

test("signPayloadEd25519 signs payload and includes digest metadata", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicKeyObj = crypto.createPublicKey(
    publicKey.export({ format: "pem", type: "spki" }).toString(),
  );

  const payload = { layer: "l2", chainId: 901 };
  const signed = signPayloadEd25519({
    payload,
    privateKeyPem,
    keyId: "test-key",
  });

  assert.equal(signed.algorithm, "ed25519");
  assert.equal(signed.keyId, "test-key");
  assert.match(signed.payloadSha256, /^[0-9a-f]{64}$/);
  assert.match(signed.signatureB64, /^[A-Za-z0-9+/=]+$/);

  const ok = crypto.verify(
    null,
    Buffer.from(JSON.stringify({ chainId: 901, layer: "l2" }), "utf8"),
    publicKeyObj,
    Buffer.from(signed.signatureB64, "base64"),
  );
  assert.equal(ok, true);
});
