/**
 * ghost-evolution — Autonomous Ecosystem Scanner & Upgrade Engine
 *
 * Responsibilities:
 *   • Scan the GhostStack ecosystem for missing features / offline services
 *   • Generate human-ratifiable governance upgrade proposals
 *   • Integrate with GhostBrain AI for proposal rationale generation
 *   • Schedule periodic background scans
 *
 * AI governance model: ghost-evolution WRITES proposals; humans RATIFY them.
 * No autonomous on-chain execution without governance quorum.
 *
 * Port : 7962  (EVOLUTION_PORT env to override)
 * Bind : 127.0.0.1 (EVOLUTION_BIND env — set 0.0.0.0 in Docker)
 */

import { buildApp }           from "./app.js";
import { runScan }            from "./scanner.js";
import { EVOLUTION_PORT, EVOLUTION_BIND, SCAN_INTERVAL_MS } from "./config.js";

const app = buildApp();

try {
  await app.listen({ port: EVOLUTION_PORT, host: EVOLUTION_BIND });
  app.log.info({ bind: EVOLUTION_BIND, port: EVOLUTION_PORT }, "ghost-evolution started");

  // Initial scan on startup
  void runScan().then(r =>
    app.log.info({ coverage: r.coveragePct, missing: r.missing }, "Initial ecosystem scan complete")
  );

  // Schedule periodic scans
  setInterval(() => {
    void runScan().then(r =>
      app.log.info({ coverage: r.coveragePct, missing: r.missing }, "Periodic ecosystem scan complete")
    );
  }, SCAN_INTERVAL_MS);

} catch (err) {
  app.log.error(err, "ghost-evolution failed to start");
  process.exit(1);
}

process.on("SIGTERM", async () => {
  app.log.info("SIGTERM received — shutting down ghost-evolution");
  await app.close();
  process.exit(0);
});
