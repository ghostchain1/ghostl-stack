/**
 * ai-expansion — Global Expansion Engine (GEE) — port 9973
 * Exchange listings · media coverage · partnerships · regional growth · institutional integration
 */

import express               from "express";
import cron                  from "node-cron";
import dotenv                from "dotenv";
dotenv.config();

import logger                from "./utils/logger";
import { getExchanges }                         from "./exchanges/exchangeScanner";
import { getApplications, runListingCycle }    from "./exchanges/listingEngine";
import { getAllMedia }                          from "./media/mediaDiscovery";
import { createPressRelease, getReleases }      from "./media/pressReleaseAI";
import { discoverPartners, summaryByCategory }  from "./partnerships/partnershipDiscovery";
import { runNegotiationCycle, getDeals }        from "./partnerships/negotiationEngine";
import { getRegions, runRegionalTick }          from "./regions/regionalExpansion";
import { getInstitutions, getProposals, runInstitutionalCampaign } from "./institutions/institutionalIntegration";
import { getAlliances, runAllianceCycle }        from "./alliances/ecosystemAlliance";

const app  = express();
const PORT = parseInt(process.env.PORT ?? "9973", 10);
app.use(express.json());

// ── Health ──────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-expansion", ts: new Date().toISOString() });
});

// ── Exchanges ────────────────────────────────────────────────────────────────
app.get("/exchanges",             (_req, res) => res.json(getExchanges()));
app.get("/exchanges/applications",(_req, res) => res.json(getApplications()));
app.post("/exchanges/run-cycle",  async (_req, res) => {
  try { res.json(await runListingCycle()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Media ────────────────────────────────────────────────────────────────────
app.get("/media",         (_req, res) => res.json(getAllMedia()));
app.get("/media/releases",(_req, res) => res.json(getReleases()));
app.post("/media/release",async (req, res) => {
  const { topic } = req.body as { topic?: string };
  if (!topic) return res.status(400).json({ error: "topic required" });
  try { res.json(await createPressRelease(topic)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Partnerships ──────────────────────────────────────────────────────────────
app.get("/partnerships",              (_req, res) => res.json(discoverPartners()));
app.get("/partnerships/by-category",  (_req, res) => res.json(summaryByCategory()));
app.get("/partnerships/deals",        (_req, res) => res.json(getDeals()));
app.post("/partnerships/run-cycle",   async (_req, res) => {
  try { res.json(await runNegotiationCycle()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Regions ───────────────────────────────────────────────────────────────────
app.get("/regions",         (_req, res) => res.json(getRegions()));
app.post("/regions/tick",   async (_req, res) => {
  try { res.json(await runRegionalTick()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Institutions ──────────────────────────────────────────────────────────────
app.get("/institutions",          (_req, res) => res.json(getInstitutions()));
app.get("/institutions/proposals",(_req, res) => res.json(getProposals()));
app.post("/institutions/campaign",async (_req, res) => {
  try { res.json(await runInstitutionalCampaign()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Alliances ──────────────────────────────────────────────────────────────────
app.get("/alliances",         (_req, res) => res.json(getAlliances()));
app.post("/alliances/cycle",  async (_req, res) => {
  try { res.json(await runAllianceCycle()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Summary ───────────────────────────────────────────────────────────────────
app.get("/summary", (_req, res) => {
  const exchanges = getExchanges();
  res.json({
    exchanges:    { total: exchanges.length, listed: exchanges.filter(e => e.status === "listed").length, applications: getApplications().length },
    media:        { total: getAllMedia().length, releases: getReleases().length },
    partnerships: { total: discoverPartners().length, deals: getDeals().length },
    regions:      { total: getRegions().length, active: getRegions().filter(r => r.status === "active").length },
    institutions: { total: getInstitutions().length, contacted: getInstitutions().filter(i => i.status !== "identified").length },
    alliances:    { total: getAlliances().length, proposed: getAlliances().filter(a => a.status !== "identified").length },
  });
});

// ── Autonomous Cron Jobs ──────────────────────────────────────────────────────
// Exchange listing cycle — every 24 h
cron.schedule("0 0 * * *", async () => {
  logger.info("CRON: running exchange listing cycle");
  await runListingCycle();
});

// Media pitch cycle — every 12 h
cron.schedule("0 */12 * * *", async () => {
  logger.info("CRON: running media pitch cycle");
  await createPressRelease("Latest GhostChain ecosystem growth milestone");
});

// Partnership negotiation — every 6 h
cron.schedule("0 */6 * * *", async () => {
  logger.info("CRON: running partnership negotiation cycle");
  await runNegotiationCycle();
});

// Regional expansion tick — every 6 h offset
cron.schedule("30 */6 * * *", async () => {
  logger.info("CRON: running regional expansion tick");
  await runRegionalTick();
});

// Institutional outreach — every Monday 10:00
cron.schedule("0 10 * * 1", async () => {
  logger.info("CRON: running institutional campaign");
  await runInstitutionalCampaign();
});

// Ecosystem alliances — every Sunday 09:00
cron.schedule("0 9 * * 0", async () => {
  logger.info("CRON: running ecosystem alliance cycle");
  await runAllianceCycle();
});

app.listen(PORT, () => {
  logger.info(`ai-expansion (GEE) listening on port ${PORT}`);
});

export default app;
