import path from "node:path";
import fs from "node:fs";
import { run } from "../core/exec.js";
import { writeJson, writeText, timestamp } from "../core/artifacts.js";
import { GhostHelperConfig } from "../core/config.js";

export async function verifier(cfg: GhostHelperConfig) {
  const ts = timestamp();
  const reportMd = path.join(cfg.reportsDir, `verify-${ts}.md`);
  const evidenceJson = path.join(cfg.evidenceDir, `verify-${ts}.json`);

  const ghostctl = path.join(cfg.repoRoot, "ops/scripts/ghostctl");
  const exists = fs.existsSync(ghostctl);

  const out = exists
    ? await run("bash", [ghostctl, "doctor"], cfg.repoRoot)
    : { stdout: "", stderr: `Missing ${ghostctl}. Create ops/scripts/ghostctl first.`, exitCode: 1 };

  const gates = {
    doctor: out.exitCode === 0 ? "pass" : "fail"
  } as const;

  writeJson(evidenceJson, { ok: out.exitCode === 0, gates, timestamp: ts });
  writeText(
    reportMd,
    `# Verifier Report ${ts}\n\nGates:\n- doctor: ${gates.doctor}\n\n\
\n${out.stdout || out.stderr}\n\
\n`
  );
  return { reportMd, evidenceJson, ok: out.exitCode === 0, gates };
}
