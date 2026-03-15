/**
 * Ghost Autonomous Security Engine (ASE) — index.ts
 * Port: 9976
 *
 * Covers:
 *  - Threat detection              /threats
 *  - Smart contract auditing       /contracts/*
 *  - Validator protection          /validators/*
 *  - Treasury guard                /treasury/*
 *  - DDoS / rate-abuse defence     /network/*
 *  - Intrusion detection           /intrusion/*
 *  - Blocked-IP registry           /blocked-ips
 *  - Health + summary              /health, /summary
 *
 * Security decisions (live IP blocking, treasury pause) require
 * explicit opt-in env vars:
 *   ASE_ENABLE_IPTABLES=true        enables iptables block commands
 *   ASE_ENABLE_TREASURY_PAUSE=true  enables AEE treasury pause call
 */

import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cron from "node-cron";
import logger from "./utils/logger";

import { detectThreats, getThreats, getThreatSummary, recordExternalThreat, type ThreatCategory, type ThreatSeverity } from "./threats/threatDetector";
import { auditContract, getAuditReports, getAuditSummary }                   from "./contracts/contractAuditor";
import { monitorValidators, getValidatorAlerts, getValidatorSummary }         from "./validators/validatorProtection";
import { monitorTreasury, getTreasuryEvents, getTreasuryStatus }              from "./treasury/treasuryGuard";
import { checkDDoS, recordRequest, getBlockedIps, getNetworkStatus, getDDoSEvents, blockIp } from "./network/ddosDefense";
import { detectIntrusion, getIntrusionLog, getIntrusionAttempts, getIntrusionBlockedIps }    from "./intrusion/intrusionDetector";

const PORT = Number(process.env.PORT ?? 9976);
const app  = express();
app.use(express.json({ limit: "256kb" }));

// ── Per-request DDoS recording middleware ─────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? "0.0.0.0";
  const { allowed } = recordRequest(ip);
  if (!allowed) {
    return res.status(429).json({ error: "Too many requests — IP temporarily rate-limited" });
  }
  next();
  return;
});

// ── Health ─────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ase", port: PORT, uptime: process.uptime() });
});

// ── Threat detection ──────────────────────────────────────────────────────────
app.get("/threats", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json({ threats: getThreats(limit) });
});

app.get("/threats/summary", (_req, res) => {
  res.json(getThreatSummary());
});

app.post("/threats/external", (req, res) => {
  const { category, severity, source, description } = req.body as {
    category?: string; severity?: string; source?: string; description?: string;
  };
  if (!category || !source || !description) {
    return res.status(400).json({ error: "category, source, description required" });
  }
  recordExternalThreat({
    category:    (category as ThreatCategory) ?? "unknown",
    severity:    (severity as ThreatSeverity) ?? "medium",
    source,
    description,
    mitigated:   false,
  });
  return res.json({ accepted: true });
});

// ── Contract auditing ─────────────────────────────────────────────────────────
app.get("/contracts/audits", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  res.json({ audits: getAuditReports(limit), summary: getAuditSummary() });
});

app.post("/contracts/audit", (req, res) => {
  const { name, source } = req.body as { name?: string; source?: string };
  if (!name || !source) {
    return res.status(400).json({ error: "name and source are required" });
  }
  try {
    const report = auditContract(name, source);
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ── Validator protection ──────────────────────────────────────────────────────
app.get("/validators", async (_req, res) => {
  try {
    const validators = await monitorValidators();
    res.json({ validators, alerts: getValidatorAlerts(50) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/validators/alerts", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  res.json({ alerts: getValidatorAlerts(limit) });
});

// ── Treasury guard ────────────────────────────────────────────────────────────
app.get("/treasury/status", async (_req, res) => {
  try {
    const status = await getTreasuryStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/treasury/events", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  res.json({ events: getTreasuryEvents(limit) });
});

// ── DDoS / network defence ─────────────────────────────────────────────────────
app.get("/network/traffic", (_req, res) => {
  res.json({ status: getNetworkStatus(), events: getDDoSEvents(20) });
});

app.get("/network/blocked-ips", (_req, res) => {
  res.json({ blocked: getBlockedIps() });
});

app.post("/network/block", (req, res) => {
  const { ip, ttlMs } = req.body as { ip?: string; ttlMs?: number };
  if (!ip) return res.status(400).json({ error: "ip required" });
  const IPv4_RE = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)(\.(25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/;
  const IPv6_RE = /^[0-9a-f:]{3,39}$/i;
  if (!IPv4_RE.test(ip) && !IPv6_RE.test(ip)) {
    return res.status(400).json({ error: "Invalid IP address" });
  }
  blockIp(ip, ttlMs);
  return res.json({ blocked: true, ip });
});

// ── Intrusion detection ───────────────────────────────────────────────────────
app.get("/intrusion/log", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json({
    log:         getIntrusionLog(limit),
    attempts:    getIntrusionAttempts(),
    blockedIps:  getIntrusionBlockedIps(),
  });
});

app.get("/intrusion/blocked", (_req, res) => {
  res.json({ blockedIps: getIntrusionBlockedIps() });
});

// ── Blocked IPs (combined) ────────────────────────────────────────────────────
app.get("/blocked-ips", (_req, res) => {
  const ddos      = getBlockedIps().map((e) => ({ ...e, source: "ddos" as const }));
  const intrusion = getIntrusionBlockedIps().map((ip) => ({ ip, source: "intrusion" as const }));
  res.json({ blocked: [...ddos, ...intrusion] });
});

// ── Summary ───────────────────────────────────────────────────────────────────
app.get("/summary", async (_req, res) => {
  try {
    const [treasury, validators] = await Promise.allSettled([
      getTreasuryStatus(),
      monitorValidators(),
    ]);
    res.json({
      threats:    getThreatSummary(),
      contracts:  getAuditSummary(),
      network:    getNetworkStatus(),
      intrusion:  { blocked: getIntrusionBlockedIps().length, recentAttempts: getIntrusionAttempts().length },
      treasury:   treasury.status   === "fulfilled" ? treasury.value   : null,
      validators: validators.status === "fulfilled" ? getValidatorSummary(validators.value) : null,
      timestamp:  new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Autonomous cron jobs ──────────────────────────────────────────────────────

// Threat detection — every 10 s
cron.schedule("*/10 * * * * *", async () => {
  try { await detectThreats(); } catch (e) { logger.error("[CRON] threatDetect:", e); }
});

// Validator protection — every 30 s
cron.schedule("*/30 * * * * *", async () => {
  try { await monitorValidators(); } catch (e) { logger.error("[CRON] validators:", e); }
});

// Treasury guard — every 1 min
cron.schedule("*/1 * * * *", async () => {
  try { await monitorTreasury(); } catch (e) { logger.error("[CRON] treasury:", e); }
});

// DDoS check — every 5 s (lightweight, in-memory only)
cron.schedule("*/5 * * * * *", () => {
  try { checkDDoS(); } catch (e) { logger.error("[CRON] ddos:", e); }
});

// Intrusion detection — every 5 min (parses auth.log)
cron.schedule("*/5 * * * *", async () => {
  try { await detectIntrusion(); } catch (e) { logger.error("[CRON] intrusion:", e); }
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🛡  Ghost Autonomous Security Engine (ASE) running on port ${PORT}`);
  logger.info(`    Iptables: ${process.env.ASE_ENABLE_IPTABLES === "true" ? "LIVE" : "dry-run"}`);
  logger.info(`    Treasury pause: ${process.env.ASE_ENABLE_TREASURY_PAUSE === "true" ? "LIVE" : "dry-run"}`);
});
