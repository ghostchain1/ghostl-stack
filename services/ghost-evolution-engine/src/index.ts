/**
 * GhostStack Evolution Engine — Entry Point
 * Periodic ecosystem scanner + autonomous upgrade planner (dry-run by default)
 */

import { buildApp }      from "./app.js";
import { scanEcosystem } from "./scanner.js";
import { buildPlan }     from "./planner.js";

const PORT     = Number(process.env["EVOLUTION_ENGINE_PORT"] ?? 7975);
const HOST     = process.env["EVOLUTION_ENGINE_HOST"] ?? "0.0.0.0";
const INTERVAL = Number(process.env["EVOLUTION_INTERVAL_MS"] ?? 300_000); // 5 min default

async function main(): Promise<void> {
  const app = buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`[evolution-engine] Listening on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Kick off first scan immediately
  void periodicScan();

  // Schedule periodic scans
  const timer = setInterval(() => void periodicScan(), INTERVAL);
  timer.unref();

  const shutdown = async (): Promise<void> => {
    console.log("[evolution-engine] Shutting down...");
    clearInterval(timer);
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT",  shutdown);
}

async function periodicScan(): Promise<void> {
  try {
    console.log("[evolution-engine] Running ecosystem scan...");
    const scan = await scanEcosystem();
    const plan = buildPlan(scan, true); // always dry-run in scheduler
    console.log(
      `[evolution-engine] Scan complete: coverage=${scan.coveragePct}%, ` +
      `gaps=${scan.gaps.length}, high-priority=${plan.highPriority}, source=${scan.source}`
    );
  } catch (err) {
    console.error("[evolution-engine] Scan error:", err);
  }
}

main().catch(err => {
  console.error("[evolution-engine] Fatal:", err);
  process.exit(1);
});
