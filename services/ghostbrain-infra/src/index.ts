/**
 * GhostBrain Infra — Entry Point
 *
 * Multi-hypervisor infrastructure controller.
 *
 * Default port : 7904  (INFRA_PORT env)
 * Default bind : 127.0.0.1 (INFRA_BIND env — set 0.0.0.0 in Docker)
 *
 * Env:
 *   HYPERVISOR_URLS  — comma-separated libvirt REST URLs
 *   DOCKER_HOSTS     — comma-separated Docker host URLs
 *   AGENT_URLS       — comma-separated ghostbrain-agent URLs (for network queries)
 */

import { buildApp }           from "./app.js";
import { pollAllHypervisors } from "./hypervisor_controller.js";

const PORT = Number(process.env.INFRA_PORT ?? "7904");
const BIND = process.env.INFRA_BIND ?? "127.0.0.1";

// Poll interval for hypervisor health
const POLL_INTERVAL_MS = Number(process.env.INFRA_POLL_INTERVAL_MS ?? "60000");

let _pollTimer: ReturnType<typeof setInterval> | null = null;

const app = buildApp();

// Initial hypervisor poll (non-blocking)
void pollAllHypervisors();

try {
  await app.listen({ port: PORT, host: BIND });

  // Schedule periodic hypervisor polling
  _pollTimer = setInterval(() => {
    void pollAllHypervisors().catch(() => { /* silent — logged at poll level */ });
  }, POLL_INTERVAL_MS);

  app.log.info({ bind: BIND, port: PORT }, "ghostbrain-infra started");
} catch (err) {
  app.log.error(err, "ghostbrain-infra failed to start");
  process.exit(1);
}

process.on("SIGTERM", async () => {
  app.log.info("SIGTERM — shutting down ghostbrain-infra");
  if (_pollTimer) clearInterval(_pollTimer);
  await app.close();
  process.exit(0);
});
