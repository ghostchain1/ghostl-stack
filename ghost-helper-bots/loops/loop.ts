import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { loadConfig } from "../core/config.js";
import { ensureDir, writeJson, timestamp } from "../core/artifacts.js";
import { log, err } from "../core/logger.js";
import { sentinel } from "../bots/sentinel.js";
import { analyzer } from "../bots/analyzer.js";
import { fixer } from "../bots/fixer.js";
import { builder } from "../bots/builder.js";
import { verifier } from "../bots/verifier.js";
import { remediator } from "../bots/remediator.js";
import { attestor } from "../bots/attestor.js";
import { automator } from "../bots/automator.js";
import type { LoopState } from "../core/state.js";

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("mode", { type: "string", default: "all", choices: ["analyze", "fix", "build", "verify", "remediate", "attest", "automate", "all"] })
    .option("maxIters", { type: "number" })
    .option("fixPlan", { type: "string" })
    .parse();

  const cfg = loadConfig();
  if (argv.maxIters) cfg.maxIterations = argv.maxIters;

  ensureDir(cfg.reportsDir);
  ensureDir(cfg.evidenceDir);
  ensureDir(cfg.sbomDir);
  ensureDir(cfg.attestDir);

  const runTs = timestamp();
  const state: LoopState = { iteration: 0, stage: "analyze", artifacts: {} };

  const saveState = () => writeJson(`${cfg.evidenceDir}/loop-state-${runTs}.json`, state);

  const runOne = async () => {
    state.iteration += 1;

    log(`Iteration ${state.iteration}/${cfg.maxIterations}`);

    state.stage = "analyze";
    const sent = await sentinel(cfg);
    state.artifacts!["sentinel"] = sent.reportMd;
    saveState();
    if (!sent.ok) {
      state.stage = "blocked";
      state.lastError = "Sentinel vetoed run.";
      saveState();
      return false;
    }

    const a = await analyzer(cfg);
    state.artifacts!["analysis"] = a.reportMd;
    state.artifacts!["fixPlan"] = a.evidenceJson;
    saveState();

    state.stage = "fix";
    const f = await fixer(cfg, argv.fixPlan || a.evidenceJson);
    state.artifacts!["fix"] = f.reportMd;
    saveState();
    if (!f.ok) return false;

    state.stage = "build";
    const b = await builder(cfg);
    state.artifacts!["build"] = b.reportMd;
    saveState();
    if (!b.ok) return false;

    state.stage = "verify";
    const v = await verifier(cfg);
    state.artifacts!["verify"] = v.reportMd;
    saveState();
    if (!v.ok) return false;

    state.stage = "remediate";
    const r = await remediator(cfg);
    state.artifacts!["remediate"] = r.reportMd;
    saveState();
    if (!r.ok) return false;

    state.stage = "attest";
    const at = await attestor(cfg);
    state.artifacts!["attest"] = at.reportMd;
    saveState();
    if (!at.ok) return false;

    state.stage = "automate";
    const au = await automator(cfg);
    state.artifacts!["automate"] = au.reportMd;
    saveState();
    if (!au.ok) return false;

    state.stage = "done";
    saveState();
    return true;
  };

  if (argv.mode !== "all") {
    log(`Running single mode: ${argv.mode}`);
  }

  for (let i = 0; i < cfg.maxIterations; i++) {
    const ok = await runOne();
    if (ok) {
      log("Ghost Helper Bots completed the pipeline successfully.");
      process.exit(0);
    }
    err("Pipeline failed; re-entering loop for another iteration (after re-analysis).");
  }

  err("Max iterations reached. System remains unstable; check reports/evidence.");
  process.exit(2);
}

main().catch((e) => {
  err(String(e?.stack || e));
  process.exit(1);
});
