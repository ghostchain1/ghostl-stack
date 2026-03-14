import crypto from "node:crypto";

import { SignedActionBundleSchema } from "./schemas.js";
import { type SignedActionBundle } from "./types.js";
import { stableStringify } from "./hash.js";

export function signActionBundle(params: {
  bundle: SignedActionBundle["bundle"];
  keyId: string;
  privateKeyPem: string;
}): SignedActionBundle {
  const privateKey = crypto.createPrivateKey(params.privateKeyPem);
  const payload = Buffer.from(stableStringify(params.bundle), "utf8");
  const signature = crypto.sign(null, payload, privateKey);
  const signed: SignedActionBundle = {
    algorithm: "ed25519",
    keyId: params.keyId,
    bundle: params.bundle,
    signatureB64: signature.toString("base64"),
  };
  SignedActionBundleSchema.parse(signed);
  return signed;
}

export function verifyActionBundle(params: {
  signed: SignedActionBundle;
  publicKeyPem: string;
}): { ok: true } | { ok: false; reason: string } {
  const parsed = SignedActionBundleSchema.safeParse(params.signed);
  if (!parsed.success) return { ok: false, reason: "invalid_schema" };

  const publicKey = crypto.createPublicKey(params.publicKeyPem);
  const payload = Buffer.from(stableStringify(params.signed.bundle), "utf8");
  const signature = Buffer.from(params.signed.signatureB64, "base64");
  const ok = crypto.verify(null, payload, publicKey, signature);
  return ok ? { ok: true } : { ok: false, reason: "bad_signature" };
}
