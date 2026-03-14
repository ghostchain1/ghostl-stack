/**
 * Ghost Interplanetary Network Engine (INE)
 * Port: 9985
 *
 * Extends the GhostStack beyond terrestrial infrastructure:
 *  • satellite relay nodes
 *  • orbital validators
 *  • deep-space comms
 *  • interplanetary routing
 *  • space infrastructure monitoring
 */
import express from "express";
import cors    from "cors";
import cron    from "node-cron";
import { logger } from "./utils/logger";

// Modules
import {
  deploySatelliteRelay,
  getRelays,
  getRelayStats,
  triggerRelayAction,
  getRelayActions,
} from "./satellites/satelliteRelay";

import {
  deployOrbitalValidator,
  getValidators,
  getValidatorStats,
  scheduleUpgrade,
  getUpgrades,
} from "./orbit/orbitalValidator";

import {
  routeInterplanetary,
  getRoutes,
  getDecisions,
  getFailovers,
  getRoutingStats,
} from "./routing/interplanetaryRouting";

import {
  syncPlanetaryNodes,
  getLinks,
  getSyncSessions,
  getCommsStats,
  getBlackouts,
} from "./communication/deepSpaceComms";

import {
  monitorSpaceNodes,
  getHealthHistory,
  getLatestSnapshot,
  getIncidents,
  resolveIncident,
  getGlobalSpaceStats,
} from "./monitoring/spaceMonitor";

// ── App ───────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = Number(process.env.PORT ?? 9985);

app.use(cors());
app.use(express.json());

// ── Loop state ────────────────────────────────────────────────────────────────
const loopState = {
  running:    false,
  cycleCount: 0,
  lastRun:    null as number | null,
  lastError:  null as string | null,
  phaseLog:   [] as string[],
};

async function runInterplanetaryLoop(): Promise<void> {
  if (loopState.running) return;
  loopState.running  = true;
  loopState.phaseLog = [];
  const log = (msg: string) => { loopState.phaseLog.push(msg); logger.info(msg); };

  try {
    // Phase 1 — Monitor space infrastructure
    log("Phase 1 — Monitor space infrastructure");
    const snapshot = await monitorSpaceNodes();
    log(`Phase 1 — health=${snapshot.networkHealth} score=${snapshot.healthScore}`);

    // Phase 2 — Satellite health check
    log("Phase 2 — Satellite relay health sweep");
    const degradedRelays = getRelays({ status: "degraded" });
    if (degradedRelays.length > 0) {
      const relay = degradedRelays[0];
      await triggerRelayAction(relay.id, "reroute", "INE loop: recovered degraded relay");
      log(`Phase 2 — Rerouted degraded relay: ${relay.name}`);
    } else {
      log("Phase 2 — All satellite relays nominal");
    }

    // Phase 3 — Orbital validator sync
    log("Phase 3 — Orbital validator deep-space sync");
    const sessions = await syncPlanetaryNodes("GhostChain");
    log(`Phase 3 — Initiated ${sessions.length} sync sessions`);

    // Phase 4 — Interplanetary routing update
    log("Phase 4 — Interplanetary routing mesh update");
    const relays = getRelays({ status: "active" });
    if (relays.length >= 2) {
      await routeInterplanetary("us-east", "ap-east", { type: "ping", cycle: loopState.cycleCount }, "grpc");
      await routeInterplanetary("eu-west", "af-south", { type: "ping", cycle: loopState.cycleCount }, "dtls");
      log("Phase 4 — Routing mesh updated via active satellite relays");
    } else {
      log("Phase 4 — Routing mesh stable (no active relays available for update)");
    }

    // Phase 5 — Comms link health
    log("Phase 5 — Deep-space comms link audit");
    const commsStats = getCommsStats();
    if (commsStats.blackout > 0) {
      log(`Phase 5 — ${commsStats.blackout} link(s) in blackout — monitoring for recovery`);
    } else {
      log(`Phase 5 — All ${commsStats.active} comm links active`);
    }

    loopState.cycleCount++;
    loopState.lastRun   = Date.now();
    loopState.lastError = null;
    log(`INE loop cycle ${loopState.cycleCount} complete`);
  } catch (err) {
    loopState.lastError = String(err);
    logger.error(`[INE loop] error: ${err}`);
  } finally {
    loopState.running = false;
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health
app.get("/health", (_req, res) => {
  const stats  = getGlobalSpaceStats();
  const uptime = Math.floor(process.uptime());
  res.json({
    status:       "ok",
    service:      "GhostInterplanetaryNetworkEngine",
    port:         PORT,
    version:      "1.0.0",
    uptime,
    loop:         loopState,
    networkHealth: stats.networkHealth,
    healthScore:  stats.healthScore,
    assets: {
      satellites:         stats.satellites.total,
      activeSatellites:   stats.satellites.active,
      orbitalValidators:  stats.validators.total,
      activeValidators:   stats.validators.active,
      commLinks:          stats.comms.total,
      activeLinks:        stats.comms.active,
    },
  });
});

// Summary
app.get("/summary", (_req, res) => res.json(getGlobalSpaceStats()));

// ── Loop ──────────────────────────────────────────────────────────────────────
app.get ("/loop/status", (_req, res) => res.json(loopState));
app.post("/loop/run",    async (_req, res) => {
  runInterplanetaryLoop().catch(err => logger.error(err));
  res.json({ queued: true, loop: loopState });
});

// ── Satellites ────────────────────────────────────────────────────────────────
app.get("/satellites", (req, res) => {
  const { network, status, constellation } = req.query as Record<string, string>;
  res.json(getRelays({ network: network as any, status: status as any, constellation: constellation as any }));
});

app.get("/satellites/stats", (_req, res) => res.json(getRelayStats()));

app.get("/satellites/actions", (_req, res) => res.json(getRelayActions()));

app.post("/satellites/deploy", async (req, res) => {
  try {
    const { name, constellation, network, role } = req.body as {
      name: string; constellation?: string; network?: string; role?: string;
    };
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const relay = await deploySatelliteRelay(name, constellation as any, network as any, role as any);
    res.json(relay);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.post("/satellites/:id/action", async (req, res) => {
  try {
    const { action, reason } = req.body as { action: string; reason: string };
    const result = await triggerRelayAction(req.params.id, action as any, reason ?? "manual");
    res.json(result);
  } catch (err) { res.status(404).json({ error: String(err) }); }
});

// ── Orbital Validators ────────────────────────────────────────────────────────
app.get("/validators", (req, res) => {
  const { network, status, orbit } = req.query as Record<string, string>;
  res.json(getValidators({ network: network as any, status: status as any, orbit: orbit as any }));
});

app.get("/validators/stats", (_req, res) => res.json(getValidatorStats()));

app.get("/validators/upgrades", (_req, res) => res.json(getUpgrades()));

app.post("/validators/deploy", async (req, res) => {
  try {
    const { name, orbit, network, role } = req.body as {
      name: string; orbit?: string; network?: string; role?: string;
    };
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const v = await deployOrbitalValidator(name, orbit as any, network as any, role as any);
    res.json(v);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.post("/validators/:id/upgrade", async (req, res) => {
  try {
    const { upgradeType, reason } = req.body as { upgradeType: string; reason: string };
    const result = await scheduleUpgrade(req.params.id, upgradeType as any, reason ?? "manual");
    res.json(result);
  } catch (err) { res.status(404).json({ error: String(err) }); }
});

// ── Routing ───────────────────────────────────────────────────────────────────
app.get("/routing/routes", (req, res) => {
  const { mode, status } = req.query as Record<string, string>;
  res.json(getRoutes({ mode: mode as any, status: status as any }));
});

app.get("/routing/stats",     (_req, res) => res.json(getRoutingStats()));
app.get("/routing/decisions", (req, res)  => res.json(getDecisions(Number(req.query.limit ?? 50))));
app.get("/routing/failovers", (_req, res) => res.json(getFailovers()));

app.post("/routing/route", async (req, res) => {
  try {
    const { fromRegion, toRegion, payload, protocol } = req.body as {
      fromRegion: string; toRegion: string; payload?: unknown; protocol?: string;
    };
    if (!fromRegion || !toRegion) { res.status(400).json({ error: "fromRegion and toRegion required" }); return; }
    const result = await routeInterplanetary(fromRegion, toRegion, payload ?? {}, protocol as any);
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Comms ─────────────────────────────────────────────────────────────────────
app.get("/comms/links", (req, res) => {
  const { fromCategory, toCategory, status } = req.query as Record<string, string>;
  res.json(getLinks({ fromCategory: fromCategory as any, toCategory: toCategory as any, status: status as any }));
});

app.get("/comms/stats",     (_req, res) => res.json(getCommsStats()));
app.get("/comms/sessions",  (_req, res) => res.json(getSyncSessions()));
app.get("/comms/blackouts", (_req, res) => res.json(getBlackouts()));

app.post("/comms/sync", async (req, res) => {
  try {
    const { network } = req.body as { network?: string };
    const sessions = await syncPlanetaryNodes(network as any);
    res.json(sessions);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Monitoring ────────────────────────────────────────────────────────────────
app.get("/monitoring/health", async (_req, res) => {
  try { res.json(await monitorSpaceNodes()); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get("/monitoring/latest",    (_req, res) => res.json(getLatestSnapshot()));
app.get("/monitoring/history",   (req, res)  => res.json(getHealthHistory(Number(req.query.limit ?? 48))));
app.get("/monitoring/incidents", (req, res)  => res.json(getIncidents(req.query.status as any)));

app.post("/monitoring/incidents/:id/resolve", async (req, res) => {
  try { res.json(await resolveIncident(req.params.id)); }
  catch (err) { res.status(404).json({ error: String(err) }); }
});

// ── Cron ──────────────────────────────────────────────────────────────────────
// Full interplanetary loop every 5 minutes
cron.schedule("*/5 * * * *", () => {
  logger.info("[INE cron] running interplanetary loop");
  runInterplanetaryLoop().catch(err => logger.error(err));
});

// Heartbeat every minute
cron.schedule("* * * * *", () => {
  logger.info(`[INE heartbeat] uptime=${Math.floor(process.uptime())}s cycles=${loopState.cycleCount}`);
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Ghost Interplanetary Network Engine running on port ${PORT}`);
  // Run initial loop
  runInterplanetaryLoop().catch(err => logger.error(err));
});
