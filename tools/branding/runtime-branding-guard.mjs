#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const RPC_METHOD_FILES = [
  "compose.mainnet.yml",
  "infra/ghostchain/docker-compose.l1.yml",
  "infra/opstack/docker-compose.l2-node.yml",
  "infra/opstack/docker-compose.l3.yml",
  "infra/opstack/docker-compose.l3-node.yml",
  "infra/ghostchain/scripts/health.sh",
  "scripts/verify-routing.sh",
  "services/ghost-orchestrator/src/index.ts",
  "services/ghost-promotion-engine/src/index.ts",
  "infra/hypervisor/supervisor/ghostais.py",
  "infra/hypervisor/supervisor/supervisor.py",
];

const CANONICAL_L2_FILES = [
  "AGENTS.md",
  ".github/copilot-instructions.md",
  "stack.env.example",
  "docker-compose.supervisor.yml",
  "infra/hypervisor/supervisor/ghostais.service",
  "infra/hypervisor/supervisor/supervisor.service",
  "infra/hypervisor/supervisor/ghostais.py",
  "infra/hypervisor/supervisor/supervisor.py",
  "services/ghost-orchestrator/src/index.ts",
  "services/ghost-promotion-engine/src/index.ts",
];

function isCommentLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("<!--")
  );
}

function readLines(relPath) {
  const absPath = path.join(ROOT, relPath);
  return fs.readFileSync(absPath, "utf8").split("\n");
}

const violations = [];

for (const relPath of RPC_METHOD_FILES) {
  const lines = readLines(relPath);
  lines.forEach((line, idx) => {
    if (!line.includes("eth_")) {
      return;
    }
    if (isCommentLine(line)) {
      return;
    }
    if (line.includes("ghost_")) {
      return;
    }
    violations.push({
      file: relPath,
      line: idx + 1,
      rule: "ghost_rpc_namespace",
      detail: "Found eth_ without adjacent ghost_ fallback or preferred ghost_ usage",
      context: line.trim(),
    });
  });
}

for (const relPath of CANONICAL_L2_FILES) {
  const lines = readLines(relPath);
  lines.forEach((line, idx) => {
    if (!line.includes("29545")) {
      return;
    }
    const lowered = line.toLowerCase();
    if (
      lowered.includes("compatibility") ||
      lowered.includes("legacy") ||
      lowered.includes("forward") ||
      lowered.includes("may still exist")
    ) {
      return;
    }
    violations.push({
      file: relPath,
      line: idx + 1,
      rule: "canonical_l2_rpc_port",
      detail: "Found stale 29545 direct L2 RPC reference in canonical control-plane file",
      context: line.trim(),
    });
  });
}

if (violations.length === 0) {
  console.log("runtime_branding_guard:PASS");
  process.exit(0);
}

console.error("runtime_branding_guard:FAIL");
for (const violation of violations) {
  console.error(
    `${violation.file}:${violation.line} ${violation.rule} ${violation.detail}\n  ${violation.context}`,
  );
}
process.exit(1);
