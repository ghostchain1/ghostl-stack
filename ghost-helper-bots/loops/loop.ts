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
import { connectBrain, disconnectBrain, publishStageSignal } from "../core/brain-client.js";

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("mode", { type: "string", default: "all", choices: ["analyze", "fix", "build", "verify", "remediate", "attest", "automate", "all"] })
    .option("maxIters", { type: "number" })
    .option("fixPlan", { type: "string" })
    .parse();

  const cfg = loadConfig();
  if (argv.maxIters) cfg.maxIterations = argv.maxIters;

  // ── Connect to GhostBrain Core ─────────────────────────────────────────
  await connectBrain(cfg.natsUrl);

  // ── Graceful disconnect on exit ────────────────────────────────────────
  const _cleanup = () => { void disconnectBrain(); };
  process.on("exit", _cleanup);
  process.on("SIGTERM", _cleanup);
  process.on("SIGINT", _cleanup);

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
    publishStageSignal("sentinel", sent.ok);
    if (!sent.ok) {
      state.stage = "blocked";
      state.lastError = "Sentinel vetoed run.";
      saveState();
      return false;
    }

    const runAnalyze = async () => {
      state.stage = "analyze";
      const a = await analyzer(cfg);
      state.artifacts!["analysis"] = a.reportMd;
      state.artifacts!["fixPlan"] = a.evidenceJson;
      saveState();
      publishStageSignal("analyze", true);
      return a;
    };

    const runFix = async (fixPlanPath?: string) => {
      state.stage = "fix";
      const f = await fixer(cfg, fixPlanPath);
      state.artifacts!["fix"] = f.reportMd;
      saveState();
      publishStageSignal("fix", f.ok);
      return f.ok;
    };

    const runBuild = async () => {
      state.stage = "build";
      const b = await builder(cfg);
      state.artifacts!["build"] = b.reportMd;
      saveState();
      publishStageSignal("build", b.ok);
      return b.ok;
    };

    const runVerify = async () => {
      state.stage = "verify";
      const v = await verifier(cfg);
      state.artifacts!["verify"] = v.reportMd;
      saveState();
      publishStageSignal("verify", v.ok);
      return v.ok;
    };

    const runRemediate = async () => {
      state.stage = "remediate";
      const r = await remediator(cfg);
      state.artifacts!["remediate"] = r.reportMd;
      saveState();
      publishStageSignal("remediate", r.ok);
      return r.ok;
    };

    const runAttest = async () => {
      state.stage = "attest";
      const at = await attestor(cfg);
      state.artifacts!["attest"] = at.reportMd;
      saveState();
      publishStageSignal("attest", at.ok);
      return at.ok;
    };

    const runAutomate = async () => {
      state.stage = "automate";
      const au = await automator(cfg);
      state.artifacts!["automate"] = au.reportMd;
      saveState();
      publishStageSignal("automate", au.ok);
      return au.ok;
    };

    if (argv.mode === "analyze") {
      await runAnalyze();
    } else if (argv.mode === "fix") {
      const a = await runAnalyze();
      if (!(await runFix(argv.fixPlan || a.evidenceJson))) return false;
    } else if (argv.mode === "build") {
      if (!(await runBuild())) return false;
    } else if (argv.mode === "verify") {
      if (!(await runVerify())) return false;
    } else if (argv.mode === "remediate") {
      if (!(await runRemediate())) return false;
    } else if (argv.mode === "attest") {
      if (!(await runAttest())) return false;
    } else if (argv.mode === "automate") {
      if (!(await runAutomate())) return false;
    } else {
      const a = await runAnalyze();
      if (!(await runFix(argv.fixPlan || a.evidenceJson))) return false;
      if (!(await runBuild())) return false;
      if (!(await runVerify())) return false;
      if (!(await runRemediate())) return false;
      if (!(await runAttest())) return false;
      if (!(await runAutomate())) return false;
    }

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
