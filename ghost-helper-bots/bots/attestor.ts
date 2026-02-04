import path from "node:path";
import fs from "node:fs";
import { run } from "../core/exec.js";
import { writeText, timestamp } from "../core/artifacts.js";
import { GhostHelperConfig } from "../core/config.js";

export async function attestor(cfg: GhostHelperConfig) {
  const ts = timestamp();
  const reportMd = path.join(cfg.reportsDir, `attest-${ts}.md`);

  const ghostctl = path.join(cfg.repoRoot, "ops/scripts/ghostctl");
  const exists = fs.existsSync(ghostctl);

  const out = exists
    ? await run("bash", [ghostctl, "attest"], cfg.repoRoot)
    : { stdout: "", stderr: `Missing ${ghostctl}. Create ops/scripts/ghostctl first.`, exitCode: 1 };

  writeText(
    reportMd,
    `# Attestor Report ${ts}\n\nExit: ${out.exitCode}\n\n\
\n${out.stdout || out.stderr}\n\
\n`
  );
  return { reportMd, ok: out.exitCode === 0 };
}
