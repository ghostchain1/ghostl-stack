import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const outDir = path.resolve(root, "..", "docs", "contracts", "diagrams");
mkdirSync(outDir, { recursive: true });

const dotPath = path.join(outDir, "contracts.dot");
const mdPath = path.join(outDir, "contracts.md");
const svgPath = path.join(outDir, "contracts.svg");
const mermaidOverview = path.join(outDir, "architecture.mmd");
const mermaidModules = path.join(outDir, "modules.mmd");

execSync("npx surya graph src/**/*.sol -O dot > \"" + dotPath + "\"", {
  cwd: root,
  stdio: "inherit",
  shell: process.env.SHELL ?? "/bin/bash"
});

execSync("npx surya mdreport src/**/*.sol > \"" + mdPath + "\"", {
  cwd: root,
  stdio: "inherit",
  shell: process.env.SHELL ?? "/bin/bash"
});

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
