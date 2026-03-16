/**
 * server.ts — GhostBrain Orchestrator HTTP server.
 *
 * Port 7895.  Express 4 + pino logger.
 *
 * HMAC auth (CONTROL_PLANE_HMAC_SECRET) guards all mutating endpoints.
 * Algorithm: HMAC-SHA256 over "${timestamp}:${rawBody}"
 * Headers:   X-HMAC-Timestamp (Unix ms), X-HMAC-Signature (hex)
 * Fail-closed: secret set + bad/missing headers → 401
 * Open-dev:   secret not set + NODE_ENV !== production → pass through (dev only)
 *
 * Routes:
 *   GET  /health          — liveness probe
 *   GET  /status          — full OrchestratorSnapshot
 *   GET  /nodes           — chain node health
 *   GET  /validators      — validator statuses
 *   GET  /containers      — container list
 *   GET  /anomalies       — unresolved anomaly events
 *   POST /scan            — trigger orchestration tick (HMAC)
 *   POST /repair/:name    — restart a container (HMAC)
 *   POST /scale           — submit scaling proposal to relay (HMAC)
 *   POST /patch/:name     — pull latest image + restart (HMAC)
 */

import express, { type Request, type Response, type NextFunction } from "express";
import { createHmac, timingSafeEqual }  from "node:crypto";
import { createServer }                  from "node:http";
import pino                              from "pino";

import {
  HMAC_SECRET,
  LOG_LEVEL,
  PORT,
  SERVICE,
  NODE_CHECK_INTERVAL_MS,
  INFRA_SCAN_INTERVAL_MS,
  AI_ANALYSIS_INTERVAL_MS,
} from "./config.js";

import { runOrchestratorTick, getSnapshot } from "./orchestrator/infrastructureManager.js";
import { runAnomalyDetection }              from "./ai/anomalyDetector.js";
import { evaluateScaling }                   from "./ai/predictiveScaling.js";
import { restartNode }                       from "./actions/restartNode.js";
import { scaleValidators }                   from "./actions/scaleValidators.js";
import { patchContainer }                    from "./actions/patchContainer.js";

// ── Logger ────────────────────────────────────────────────────────────────────

const log = pino({ name: SERVICE, level: LOG_LEVEL });

// ── HMAC middleware ───────────────────────────────────────────────────────────

const SKEW_MS = 5 * 60_000;

function signHmac(body: string, ts: number): string {
  return createHmac("sha256", HMAC_SECRET).update(`${ts}:${body}`).digest("hex");
}

function verifyHmac(
  rawBody: string,
  sigHeader: string | undefined,
  tsHeader: string | undefined,
): { ok: boolean; reason?: string } {
  if (!HMAC_SECRET) {
    if (process.env["NODE_ENV"] === "production") {
      return { ok: false, reason: "hmac_secret_not_configured" };
    }
    log.debug("hmac: open-dev mode (no ORCHESTRATOR_HMAC_SECRET set)");
    return { ok: true };
  }
  if (!sigHeader || !tsHeader) return { ok: false, reason: "missing_hmac_headers" };

  const ts = parseInt(tsHeader, 10);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > SKEW_MS) {
    return { ok: false, reason: "timestamp_skew" };
  }

  const expected = signHmac(rawBody, ts);
  try {
    const ok = timingSafeEqual(
      Buffer.from(sigHeader.toLowerCase(), "hex"),
      Buffer.from(expected.toLowerCase(), "hex"),
    );
    return ok ? { ok: true } : { ok: false, reason: "signature_mismatch" };
  } catch {
    return { ok: false, reason: "signature_mismatch" };
  }
}

function hmacMiddleware(req: Request, res: Response, next: NextFunction): void {
  const { ok, reason } = verifyHmac(
    req.body ? JSON.stringify(req.body) : "",
    req.headers["x-hmac-signature"] as string | undefined,
    req.headers["x-hmac-timestamp"] as string | undefined,
  );
  if (!ok) {
    res.status(401).json({ error: "Unauthorized", reason });
    return;
  }
  next();
}

// ── App setup ─────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "64kb" }));

// Remove server fingerprint
app.disable("x-powered-by");

// ── Health / read-only routes ─────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: SERVICE, ts: Date.now() });
});

app.get("/status", (_req: Request, res: Response) => {
  res.json(getSnapshot());
});

app.get("/nodes", (_req: Request, res: Response) => {
  const snap = getSnapshot();
  res.json({ nodes: snap.nodes, chains: snap.chains });
});

app.get("/validators", (_req: Request, res: Response) => {
  res.json({ validators: getSnapshot().validators });
});

app.get("/containers", (_req: Request, res: Response) => {
  res.json({ infra: getSnapshot().infra });
});

app.get("/anomalies", (_req: Request, res: Response) => {
  res.json({ anomalies: getSnapshot().anomalies });
});

// ── Mutating routes (HMAC-guarded) ───────────────────────────────────────────

app.post("/scan", hmacMiddleware, async (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    const snap     = await runOrchestratorTick();
    const detected = runAnomalyDetection(snap);
    const proposal = await evaluateScaling(snap, detected);
    res.json({
      ok:         true,
      tick:       snap.tick,
      anomalies:  detected.length,
      proposal:   proposal ?? null,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    log.error(err, "scan failed");
    res.status(500).json({ ok: false, error: "scan_failed" });
  }
});

app.post("/repair/:name", hmacMiddleware, async (req: Request, res: Response) => {
  const name = req.params["name"] ?? "";
  const start = Date.now();
  try {
    const result = await restartNode(name);
    res.status(result.ok ? 200 : 500).json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, message: msg, durationMs: Date.now() - start, timestamp: Date.now() });
  }
});

app.post("/scale", hmacMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await scaleValidators(req.body as { reason?: string; targetCount?: number });
    res.json(result);
  } catch (err) {
    log.error(err, "scale failed");
    res.status(500).json({ ok: false, message: "scale_failed" });
  }
});

app.post("/patch/:name", hmacMiddleware, async (req: Request, res: Response) => {
  const name = req.params["name"] ?? "";
  const start = Date.now();
  try {
    const result = await patchContainer(name);
    res.status(result.ok ? 200 : 500).json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, message: msg, durationMs: Date.now() - start, timestamp: Date.now() });
  }
});

// ── Background loops ──────────────────────────────────────────────────────────

async function startBackgroundLoops(): Promise<void> {
  // Initial sync tick on startup
  try {
    const snap = await runOrchestratorTick();
    log.info({ tick: snap.tick, nodes: snap.nodes.length }, "initial orchestration tick complete");
  } catch (err) {
    log.warn(err, "initial tick failed — will retry on interval");
  }

  // Node + chain health check loop
  setInterval(async () => {
    try {
      const snap = await runOrchestratorTick();
      log.debug({ tick: snap.tick }, "orchestration tick");
    } catch (err) {
      log.error(err, "orchestration tick failed");
    }
  }, NODE_CHECK_INTERVAL_MS);

  // Anomaly detection loop (offset from health check to avoid spiky CPU)
  setTimeout(() => {
    setInterval(() => {
      try {
        const snap = getSnapshot();
        const events = runAnomalyDetection(snap);
        if (events.length > 0) {
          log.warn({ count: events.length, types: events.map((e) => e.type) }, "anomalies detected");
        }
      } catch (err) {
        log.error(err, "anomaly detection failed");
      }
    }, AI_ANALYSIS_INTERVAL_MS);
  }, 5_000);

  // Predictive scaling loop
  setTimeout(() => {
    setInterval(async () => {
      try {
        const snap     = getSnapshot();
        const proposal = await evaluateScaling(snap, snap.anomalies);
        if (proposal) {
          log.info({ proposal: proposal.id, action: proposal.action }, "scaling proposal submitted");
        }
      } catch (err) {
        log.error(err, "predictive scaling eval failed");
      }
    }, INFRA_SCAN_INTERVAL_MS);
  }, 10_000);
}

// ── Server startup ────────────────────────────────────────────────────────────

const server = createServer(app);

server.listen(PORT, "0.0.0.0", () => {
  log.info({ port: PORT, service: SERVICE }, "GhostBrain Orchestrator listening");
  void startBackgroundLoops();
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  log.info({ signal }, "shutdown signal received");
  server.close(() => {
    log.info("server closed");
    process.exit(0);
  });
  // Force-exit after 10 s
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException",  (err) => { log.fatal(err, "uncaught exception"); process.exit(1); });
process.on("unhandledRejection", (err) => { log.error(err, "unhandled rejection"); });
