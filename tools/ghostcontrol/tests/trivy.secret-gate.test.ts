import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/security/trivy/scan-secrets.sh",
);
const allowlistPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/security/trivy/allowlist/ghostcontrol-secrets.json",
);

test("secret scan gate script is wired to allowlist and emits gate status", () => {
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /ALLOWLIST_PATH=.*ghostcontrol-secrets\.json/);
  assert.match(script, /trivy fs/);
  assert.match(script, /--scanners secret/);
  assert.match(script, /ghostcontrol_secret_gate=PASS/);
  assert.match(script, /ghostcontrol_secret_gate=FAIL/);
});

test("secret allowlist contains scoped private-key exception for devnet signing key", () => {
  const raw = readFileSync(allowlistPath, "utf8");
  const parsed = JSON.parse(raw) as {
    entries?: Array<{ rule_id?: string; severity?: string; target_patterns?: string[]; expires_on?: string }>;
  };

  assert.ok(Array.isArray(parsed.entries));
  const entry = parsed.entries?.find((item) => item.rule_id === "private-key");
  assert.ok(entry);
  assert.equal(entry?.severity, "HIGH");
  assert.ok(entry?.target_patterns?.some((pattern) => /signing\\\.key/.test(pattern)));
  assert.match(entry?.expires_on ?? "", /^\d{4}-\d{2}-\d{2}$/);
});
