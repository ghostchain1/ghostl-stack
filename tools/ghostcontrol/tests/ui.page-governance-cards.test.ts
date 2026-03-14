import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageTsxPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/apps/ui/app/page.tsx",
);
const pageJsxPath = path.resolve(
  "/home/ghost/ghostl-stack/tools/ghostcontrol/apps/ui/app/page.jsx",
);

test("ui governance page renders lock and rpc preflight governance sections", () => {
  const tsx = readFileSync(pageTsxPath, "utf8");

  assert.match(tsx, /Lock Contention Governance/);
  assert.match(tsx, /RPC Preflight Governance/);
  assert.match(tsx, /rpcPreflight/);
  assert.match(tsx, /Recent mitigation runs:/);
});

test("ui compiled governance page mirrors rpc preflight governance section", () => {
  const jsx = readFileSync(pageJsxPath, "utf8");

  assert.match(jsx, /Lock Contention Governance/);
  assert.match(jsx, /RPC Preflight Governance/);
  assert.match(jsx, /rpcPreflight/);
  assert.match(jsx, /Recent mitigation runs:/);
});
