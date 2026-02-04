import path from "node:path";
import fs from "node:fs";
import { run } from "../core/exec.js";
import { writeText, timestamp } from "../core/artifacts.js";
import { GhostHelperConfig } from "../core/config.js";
import { requireGovernanceCapability } from "../core/policy.js";

export async function fixer(cfg: GhostHelperConfig, fixPlanPath?: string) {
  const ts = timestamp();
  const reportMd = path.join(cfg.reportsDir, `fix-${ts}.md`);

  await requireGovernanceCapability(cfg.repoRoot, "CAP_FIX_CONFIG");

  const doctorScript = path.join(cfg.repoRoot, "ops/scripts/doctor.sh");
  const exists = fs.existsSync(doctorScript);

  const out = exists
    ? await run("bash", [doctorScript], cfg.repoRoot)
    : { stdout: "", stderr: `Missing ${doctorScript}. Create ops/scripts/doctor.sh first.`, exitCode: 0 };

  writeText(
    reportMd,
    `# Fixer Report ${ts}\n\nFixPlan: ${fixPlanPath || "(none)"}\n\nDoctor run exit: ${out.exitCode}\n\n\
\n${out.stdout || out.stderr}\n\
\n`
  );

  return { reportMd, ok: out.exitCode === 0 };
}
