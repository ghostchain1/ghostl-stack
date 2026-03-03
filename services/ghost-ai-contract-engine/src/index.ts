// SPDX-License-Identifier: MIT
// GhostChain · GhostBrain AI Contract Engine — Main Entry Point
//
// Exposes an HTTP API on PORT (default 7611) and runs an autonomous
// scan → fix → brand → compile loop every SCAN_INTERVAL_MS.

import express, { Request, Response, NextFunction } from "express";
import { register as promRegister } from "prom-client";
import { randomUUID }           from "node:crypto";
import { scanAll }              from "./scanner.js";
import { fixErrors }            from "./fixer.js";
import { brandAll }             from "./brander.js";
import { compile }              from "./compiler.js";
import { publishCycle, registerWithGhostBrain, closeBridge } from "./ghostbrain-bridge.js";
import { log }                  from "./logger.js";
import { SCAN_INTERVAL_MS }     from "./config.js";
import type { EngineCycle }     from "./types.js";

const PORT = Number(process.env["PORT"] ?? 7611);
const app  = express();
app.use(express.json({ limit: "1mb" }));

// ─── State ────────────────────────────────────────────────────────────────────

const cycles: EngineCycle[] = [];
let   running  = false;
let   tickTimer: ReturnType<typeof setInterval> | null = null;

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "ghost-ai-contract-engine", uptime: process.uptime() });
});

app.get("/metrics", async (_req: Request, res: Response) => {
  res.set("Content-Type", promRegister.contentType);
  res.end(await promRegister.metrics());
});

app.get("/cycles", (_req: Request, res: Response) => {
  res.json({ total: cycles.length, recent: cycles.slice(-10) });
});

app.post("/scan", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await scanAll();
    res.json(result);
  } catch (err) { next(err); }
});

app.post("/fix", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Accept an optional body { errors: SolError[] }; if absent, do a fresh scan first
    const errors = req.body?.errors ?? (await scanAll()).errors;
    const result = await fixErrors(errors);
    res.json({ fixed: result.length, results: result });
  } catch (err) { next(err); }
});

app.post("/brand", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await brandAll();
    res.json({ branded: result.length, results: result });
  } catch (err) { next(err); }
});

app.post("/compile", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await compile();
    res.json(result);
  } catch (err) { next(err); }
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error("HTTP error", { msg: err.message, stack: err.stack?.slice(0, 400) });
  res.status(500).json({ error: err.message });
});

// ─── Autonomous Loop ──────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  if (running) {
    log.warn("Previous tick still running — skipping");
    return;
  }
  running = true;
  const startedAt = new Date().toISOString();
  log.info("Engine tick started");

  try {
    const scan    = await scanAll();
    const fixes   = await fixErrors(scan.errors);
    const brands  = await brandAll();
    const comp    = await compile();

    const cycle: EngineCycle = {
      cycleId:    randomUUID(),
      startedAt,
      finishedAt: new Date().toISOString(),
      scan,
      fixes,
      brands,
      compile: comp,
    };

    cycles.push(cycle);
    if (cycles.length > 200) cycles.splice(0, cycles.length - 200);  // trim

    await publishCycle(cycle);

    log.info("Engine tick done", {
      errors:   scan.errors.length,
      warnings: scan.warnings.length,
      fixes:    fixes.length,
      brands:   brands.length,
      compile:  comp.status,
    });
  } catch (err) {
    log.error("Engine tick error", { err: String(err) });
  } finally {
    running = false;
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  log.info("HTTP server listening", { port: PORT });
});

// Register with GhostBrain (fire-and-forget; non-fatal)
registerWithGhostBrain().catch(() => undefined);

// Run first tick immediately, then on schedule
tick().catch(err => log.error("Initial tick failed", { err: String(err) }));
tickTimer = setInterval(() => {
  tick().catch(err => log.error("Scheduled tick failed", { err: String(err) }));
}, SCAN_INTERVAL_MS);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  log.info("Shutting down", { signal });
  if (tickTimer) clearInterval(tickTimer);
  await closeBridge();
  server.close(() => {
    log.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT",  () => shutdown("SIGINT"));
