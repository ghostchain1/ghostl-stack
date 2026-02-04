import path from "node:path";
import { writeText, timestamp } from "../core/artifacts.js";
import { GhostHelperConfig } from "../core/config.js";
import { requireGovernanceCapability } from "../core/policy.js";

export async function automator(cfg: GhostHelperConfig) {
  const ts = timestamp();
  const reportMd = path.join(cfg.reportsDir, `automate-${ts}.md`);

  await requireGovernanceCapability(cfg.repoRoot, "CAP_AUTOMATION_SCHEDULE");

  writeText(reportMd, `# Automator Report ${ts}\n\nCI/nightly automation is configured via .github/workflows.\n`);
  return { reportMd, ok: true };
}
