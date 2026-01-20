import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const outDir = path.resolve(root, "..", "docs", "contracts", "diagrams");
mkdirSync(outDir, { recursive: true });

const dotPath = path.join(outDir, "contracts.dot");
const mdPath = path.join(outDir, "contracts.md");
const svgPath = path.join(outDir, "contracts.svg");
const mermaidOverview = path.join(outDir, "architecture.mmd");
const mermaidModules = path.join(outDir, "modules.mmd");

const collectSolFiles = (dir: string, files: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "apps") {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSolFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".sol")) {
      files.push(path.relative(root, fullPath));
    }
  }
  return files;
};

const solFiles = collectSolFiles(path.join(root, "src"));
if (solFiles.length === 0) {
  throw new Error("No Solidity files found for diagram generation.");
}

const graphResult = spawnSync("npx", ["surya", "graph", ...solFiles, "-O", "dot"], {
  cwd: root,
  stdio: ["ignore", "pipe", "inherit"]
});
if (graphResult.status !== 0) {
  process.exit(graphResult.status ?? 1);
}
if (graphResult.stdout) {
  writeFileSync(dotPath, graphResult.stdout);
}

const reportResult = spawnSync("npx", ["surya", "mdreport", ...solFiles], {
  cwd: root,
  stdio: ["ignore", "pipe", "inherit"]
});
if (reportResult.status !== 0) {
  process.exit(reportResult.status ?? 1);
}
if (reportResult.stdout) {
  writeFileSync(mdPath, reportResult.stdout);
}

try {
  execSync('dot -Tsvg "' + dotPath + '" -o "' + svgPath + '"', {
    cwd: root,
    stdio: "inherit",
    shell: process.env.SHELL ?? "/bin/bash"
  });
} catch (err) {
  console.warn("dot not installed; skipping SVG render.");
}

const overviewDiagram = `flowchart TB
  subgraph L1["GhostChain L1"]
    NativeToken["NativeToken"]
    Treasury["Treasury"]
    L1Portal["L1OptimismPortal"]
    L1Oracle["L1OutputOracle"]
  end
  subgraph L2["Ghost L2"]
    GuardPolicy["GuardPolicy"]
    L2L3Bridge["L2L3Bridge"]
    GhostTokenL2["GhostTokenL2"]
    L2Rollup["OptimisticRollup L3->L2"]
  end
  subgraph L3["Ghost L3"]
    L3Inbox["L3Inbox"]
    L3Factory["L3BridgedTokenFactory"]
  end
  NativeToken --> Treasury
  L2L3Bridge --> L3Inbox
  GhostTokenL2 --> L3Factory
  L1Oracle --> L1Portal
`;

const moduleDiagram = `flowchart LR
  subgraph Bridge
    GuardPolicy --> L2L3Bridge
    L2L3Bridge --> L3Inbox
    L3Inbox --> L3Factory
  end
  subgraph Governance
    Governor --> ProposalExecutor
  end
  subgraph Treasury
    NativeToken --> Treasury
  end
  subgraph Validators
    ValidatorRegistry
    StakingManager
    SlashingManager
  end
`;

writeFileSync(mermaidOverview, overviewDiagram);
writeFileSync(mermaidModules, moduleDiagram);
