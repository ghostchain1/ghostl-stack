/**
 * GhostCode AI — main autonomous build controller.
 * Scans, enforces branding, verifies nodes, and orchestrates builds.
 */
import { RepoScanner }      from "./RepoScanner";
import { DependencyGraph }  from "./DependencyGraph";
import { BrandingEnforcer } from "./BrandingEnforcer";
import { ErrorRepair }      from "./ErrorRepair";
import { NodeVerifier }     from "./NodeVerifier";
import { ArchitectAgent, AuditorAgent, GovernorAgent } from "../agents/index";
import * as fs from "fs";
import * as path from "path";

const ROOT = process.env.GHOSTSTACK_ROOT ?? "/home/ghost/ghostl-stack";

const NODES: Record<string, string> = {
  "GhostChain L1": process.env.GHOST_L1_RPC  ?? "http://localhost:18545",
  "GhostL2":       process.env.GHOST_L2_RPC  ?? "http://localhost:7260",
  "GhostL3":       process.env.GHOST_L3_RPC  ?? "http://localhost:7270",
};

async function main(): Promise<void> {
  console.log("=== GhostCode AI — Autonomous Build System ===");
  console.log(`Root: ${ROOT}\n`);

  // 1. Scan repo
  const scanner = new RepoScanner();
  const files   = scanner.scan(ROOT);
  console.log(`[Scan] Found ${files.length} files\n`);

  // 2. Build dependency graph
  const graphBuilder = new DependencyGraph();
  const graph = graphBuilder.build(files.map(f => f.path));
  console.log(`[Graph] Dependency graph built — ${graph.size} nodes\n`);

  // 3. Architect analysis
  const architect = new ArchitectAgent();
  const serviceCount = files.filter(f => f.path.includes("/services/")).length;
  const suggestion = architect.analyze({ files: files.length, services: serviceCount });
  console.log(`[Architect] ${suggestion}\n`);

  // 4. Branding enforcement
  const enforcer = new BrandingEnforcer();
  let brandViolations = 0;
  const tsFiles = files.filter(f => [".ts", ".js", ".sol"].includes(f.ext));
  for (const file of tsFiles) {
    const code = fs.readFileSync(file.path, "utf8");
    const v    = enforcer.scan(code);
    if (v.length > 0) {
      console.error(`[Branding] Violations in ${path.relative(ROOT, file.path)}: ${v.map(x => x.label).join(", ")}`);
      brandViolations += v.length;
    }
  }
  if (brandViolations === 0) {
    console.log("[Branding] All files Ghost-native ✓\n");
  } else {
    console.warn(`[Branding] ${brandViolations} violation(s) found\n`);
  }

  // 5. TypeScript error check
  const repair  = new ErrorRepair();
  const auditor = new AuditorAgent();
  const errors  = repair.compile(ROOT);
  auditor.audit(errors.map(e => `${e.file}:${e.line} ${e.code}`));

  // 6. Node health check (non-fatal in CI)
  const verifier = new NodeVerifier();
  try {
    await verifier.checkAll(NODES);
  } catch (e: any) {
    console.warn(`[Nodes] ${e.message} (non-fatal)\n`);
  }

  // 7. Governor decision
  const governor = new GovernorAgent();
  const approved = governor.approve({
    name: "ghostcode-ai-build-cycle",
    risk: brandViolations > 0 ? "HIGH" : errors.length > 0 ? "MEDIUM" : "LOW",
  });

  process.exit(approved ? 0 : 1);
}

main().catch(err => {
  console.error("[GhostCode FATAL]", err);
  process.exit(1);
});
