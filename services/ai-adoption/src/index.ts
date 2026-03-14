/**
 * ai-adoption service — Autonomous Adoption Engine entry point (port 9972).
 */

import "dotenv/config";
import express from "express";
import cron from "node-cron";
import { scanDevelopers, getAllDevs } from "./developers/devScanner";
import { runOutreachCycle, getHistory as devOutreachHistory } from "./developers/devOutreach";
import { findProjects, getAllProjects } from "./projects/projectDiscovery";
import { onboardProject, getPlans } from "./projects/onboardingEngine";
import { growLiquidity, getPools } from "./liquidity/liquidityExpansion";
import { runGrantCycle, getGrants } from "./grants/grantEngine";
import { scanWeb3Companies, getAllPartners } from "./partnerships/partnerDiscovery";
import { institutionalCampaign, getInstitutions, getProposals } from "./institutions/institutionalOutreach";
import logger from "./utils/logger";

const app    = express();
const PORT   = Number(process.env.PORT ?? 9972);
const started = Date.now();
let cycleCount = 0;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-adoption", port: PORT, cycleCount, uptimeSec: Math.floor((Date.now() - started) / 1000) });
});

app.get("/developers",         (_req, res) => { res.json(getAllDevs()); });
app.get("/developers/outreach",(_req, res) => { res.json(devOutreachHistory()); });
app.get("/projects",           (_req, res) => { res.json(getAllProjects()); });
app.get("/projects/plans",     (_req, res) => { res.json(getPlans()); });
app.get("/liquidity/pools",    (_req, res) => { res.json(getPools()); });
app.get("/grants",             (_req, res) => { res.json(getGrants()); });
app.get("/partners",           (_req, res) => { res.json(getAllPartners()); });
app.get("/institutions",       (_req, res) => { res.json(getInstitutions()); });
app.get("/institutions/proposals", (_req, res) => { res.json(getProposals()); });

// ── Autonomous cycles ─────────────────────────────────────────────────────────

// Every 6 hours: developer scanning + outreach
cron.schedule("0 */6 * * *", async () => {
  try {
    cycleCount++;
    logger.info("ai-adoption: running developer outreach cycle");
    await runOutreachCycle(5);
  } catch (err: any) {
    logger.error("ai-adoption: dev outreach error", { err: err?.message });
  }
});

// Every 12 hours: project discovery + onboarding
cron.schedule("0 */12 * * *", async () => {
  try {
    logger.info("ai-adoption: running project onboarding cycle");
    const projects = await findProjects();
    const candidates = projects.filter(p => p.status === "discovered").slice(0, 3);
    await Promise.all(candidates.map(onboardProject));
    await runGrantCycle();
  } catch (err: any) {
    logger.error("ai-adoption: project cycle error", { err: err?.message });
  }
});

// Every 4 hours: liquidity expansion
cron.schedule("0 */4 * * *", async () => {
  try { await growLiquidity(); }
  catch (err: any) { logger.error("ai-adoption: liquidity error", { err: err?.message }); }
});

// Daily at 11:00: institutional outreach
cron.schedule("0 11 * * *", async () => {
  try { await institutionalCampaign(); }
  catch (err: any) { logger.error("ai-adoption: institutional error", { err: err?.message }); }
});

app.listen(PORT, () => {
  logger.info(`ai-adoption service listening on port ${PORT}`);
});
