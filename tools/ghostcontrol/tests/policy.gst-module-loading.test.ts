import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const policySourcePath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/apps/policy/src/index.ts",
);
const policyDockerfilePath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/apps/policy/Dockerfile",
);

test("policy service resolves gst policy module from /app and local-dev candidate paths", () => {
  const source = readFileSync(policySourcePath, "utf8");
  assert.match(source, /"\/app\/apps\/policy\/gst_policy\.cjs"/);
  assert.match(source, /"\/app\/services\/ai-policy\/gst_policy\.cjs"/);
  assert.match(source, /path\.resolve\(process\.cwd\(\), "apps\/policy\/gst_policy\.cjs"\)/);
  assert.match(source, /path\.resolve\(process\.cwd\(\), "\.\.\/\.\.\/services\/ai-policy\/gst_policy\.cjs"\)/);
  assert.match(source, /path\.resolve\(process\.cwd\(\), "\.\.\/\.\.\/\.\.\/services\/ai-policy\/gst_policy\.cjs"\)/);
  assert.match(source, /gst_policy_module_unavailable/);
});

test("policy image includes ai-policy module payload", () => {
  const dockerfile = readFileSync(policyDockerfilePath, "utf8");
  assert.match(dockerfile, /COPY apps \.\/apps/);
  const embeddedPolicyModulePath = path.resolve(
    "/home/ghost/ghostl-stack/tools/ghostcontrol/apps/policy/gst_policy.cjs",
  );
  const embeddedPolicyModule = readFileSync(embeddedPolicyModulePath, "utf8");
  assert.match(embeddedPolicyModule, /module\.exports = \{/);
});
