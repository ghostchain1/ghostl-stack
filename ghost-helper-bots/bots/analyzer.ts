import path from "node:path";
import { run } from "../core/exec.js";
import { writeJson, writeText, timestamp } from "../core/artifacts.js";
import { GhostHelperConfig } from "../core/config.js";

export async function analyzer(cfg: GhostHelperConfig) {
  const ts = timestamp();
  const reportMd = path.join(cfg.reportsDir, `analyze-${ts}.md`);
  const evidenceJson = path.join(cfg.evidenceDir, `analysis-${ts}.json`);

  const dockerPs = await run("docker", ["ps", "--format", "json"], cfg.repoRoot).catch(() => ({
    stdout: "",
    stderr: "docker ps failed",
    exitCode: 1
  }));
  const composePs = await run("docker", ["compose", "ps"], cfg.repoRoot).catch(() => ({
    stdout: "",
    stderr: "compose ps failed",
    exitCode: 1
  }));

  const fixPlan = {
    timestamp: ts,
    observations: {
      dockerPsExit: dockerPs.exitCode,
      composePsExit: composePs.exitCode
    },
    hypotheses: [
      { id: "unknown", summary: "Collect logs and classify failing containers.", confidence: 0.4 }
    ],
    recommendedActions: [
      { action: "run_doctor", cmd: "ops/scripts/doctor.sh", risk: "low" }
    ]
  };

  writeJson(evidenceJson, fixPlan);
  writeText(
    reportMd,
    `# Analyzer Report ${ts}\n\n## docker ps\n\
\n${dockerPs.stdout || dockerPs.stderr}\n\
\n## docker compose ps\n\
\n${composePs.stdout || composePs.stderr}\n\
\n## fixPlan\nSaved: ${evidenceJson}\n`
  );

  return { reportMd, evidenceJson };
}
