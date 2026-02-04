import path from "node:path";
import fs from "node:fs";
import { run } from "../core/exec.js";
import { writeText, timestamp } from "../core/artifacts.js";
import { GhostHelperConfig } from "../core/config.js";
import { requireGovernanceCapability } from "../core/policy.js";

export async function remediator(cfg: GhostHelperConfig) {
  const ts = timestamp();
  const reportMd = path.join(cfg.reportsDir, `remediate-${ts}.md`);

  await requireGovernanceCapability(cfg.repoRoot, "CAP_REMEDIATE_DEPS");

  const ghostctl = path.join(cfg.repoRoot, "ops/scripts/ghostctl");
  const exists = fs.existsSync(ghostctl);

  const scanOut = exists
    ? await run("bash", [ghostctl, "scan"], cfg.repoRoot)
    : { stdout: "", stderr: `Missing ${ghostctl}.`, exitCode: 1 };

  const remediateOut = scanOut.exitCode === 0
    ? await run("bash", [ghostctl, "remediate"], cfg.repoRoot).catch(() => ({ stdout: "", stderr: "remediate failed", exitCode: 1 }))
    : { stdout: "", stderr: "Scan failed; remediation skipped.", exitCode: 1 };

  writeText(
    reportMd,
    `# Remediator Report ${ts}\n\n## scan\nExit: ${scanOut.exitCode}\n\
\n${scanOut.stdout || scanOut.stderr}\n\
\n## remediate\nExit: ${remediateOut.exitCode}\n\
\n${remediateOut.stdout || remediateOut.stderr}\n\
\n`
  );
  const ok = scanOut.exitCode === 0 && remediateOut.exitCode === 0;
  return { reportMd, ok };
}
