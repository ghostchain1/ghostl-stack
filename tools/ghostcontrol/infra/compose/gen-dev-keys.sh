#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SECRETS_DIR="${ROOT_DIR}/secrets"

mkdir -p "${SECRETS_DIR}"

SECRETS_DIR="${SECRETS_DIR}" node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const secretsDir = process.env.SECRETS_DIR;
if (!secretsDir) {
  console.error("Missing SECRETS_DIR env var");
  process.exit(1);
}
const privPath = path.join(secretsDir, "signing.key");
const pubPath = path.join(secretsDir, "signing.pub");

if (fs.existsSync(privPath) || fs.existsSync(pubPath)) {
  console.error("Refusing to overwrite existing keys.");
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const privPem = privateKey.export({ format: "pem", type: "pkcs8" });
const pubPem = publicKey.export({ format: "pem", type: "spki" });

fs.writeFileSync(privPath, privPem, { mode: 0o600 });
fs.writeFileSync(pubPath, pubPem, { mode: 0o644 });

console.log("Wrote:", privPath);
console.log("Wrote:", pubPath);
NODE

echo "Done."
