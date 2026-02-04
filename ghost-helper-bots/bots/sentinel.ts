import path from "node:path";
import { writeText, writeJson, timestamp } from "../core/artifacts.js";
import { GhostHelperConfig } from "../core/config.js";

export async function sentinel(cfg: GhostHelperConfig) {
  const ts = timestamp();
  const reportMd = path.join(cfg.reportsDir, `sentinel-${ts}.md`);
  const evidenceJson = path.join(cfg.evidenceDir, `sentinel-${ts}.json`);

  const verdict = {
    ok: true,
    reasons: ["No diff inspection implemented yet. Add git diff parsing before enforcing patches."],
    blockedActions: []
  };

  writeJson(evidenceJson, verdict);
  writeText(reportMd, `# Sentinel Verdict ${ts}\n\nSAFE: ${verdict.ok}\n\n${verdict.reasons.map((r) => `- ${r}`).join("\n")}\n`);
  return { reportMd, evidenceJson, ok: verdict.ok };
}
