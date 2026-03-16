#!/usr/bin/env node
/**
 * ghost-web-orchestrator
 * Monitors all GhostChain public web apps and restarts unhealthy services
 * via docker compose.
 */
"use strict";

import fetch from "node-fetch";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const COMPOSE_FILE = "/home/ghost/ghostl-stack/docker-compose.web.yml";
const CHECK_INTERVAL_MS = 30_000; // 30 seconds
const RESTART_COOLDOWN_MS = 120_000; // 2 minutes between restarts

const SERVICES = [
  { name: "web-main",       port: 3010, domain: "ghostchain.cloud" },
  { name: "web-investor",   port: 3011, domain: "investor.ghostchain.cloud" },
  { name: "web-dev",        port: 3012, domain: "dev.ghostchain.cloud" },
  { name: "web-apps",       port: 3013, domain: "apps.ghostchain.cloud" },
  { name: "web-explorer",   port: 3014, domain: "explorer.ghostchain.cloud" },
  { name: "web-governance", port: 3015, domain: "governance.ghostchain.cloud" },
  { name: "web-nodes",      port: 3016, domain: "nodes.ghostchain.cloud" },
  { name: "web-exchange",   port: 3017, domain: "exchange.ghostchain.cloud" },
  { name: "web-company",    port: 3018, domain: "company.ghostchain.cloud" },
  { name: "web-status",     port: 3019, domain: "status.ghostchain.cloud" },
  { name: "web-portal",     port: 3020, domain: "portal.ghostchain.cloud" },
  { name: "web-wallet",     port: 3021, domain: "wallet.ghostchain.cloud" },
  { name: "web-bridge",     port: 3022, domain: "bridge.ghostchain.cloud" },
  { name: "web-docs",       port: 3023, domain: "docs.ghostchain.cloud" },
  { name: "web-live",       port: 3024, domain: "ghostchain.live" },
  { name: "web-ai",         port: 3025, domain: "ai.ghostchain.cloud" },
  { name: "web-rpc-portal", port: 3026, domain: "rpc.ghostchain.cloud" },
];

const lastRestart = new Map();

async function checkService(svc) {
  const url = `http://127.0.0.1:${svc.port}/`;
  try {
    const res = await fetch(url, { timeout: 5000 });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function restartService(svc) {
  const now = Date.now();
  const last = lastRestart.get(svc.name) ?? 0;
  if (now - last < RESTART_COOLDOWN_MS) {
    console.log(`[orchestrator] ${svc.name}: cooldown active, skipping restart`);
    return;
  }
  lastRestart.set(svc.name, now);
  const cmd = `docker compose -f ${COMPOSE_FILE} restart ${svc.name}`;
  console.log(`[orchestrator] Restarting ${svc.name} via: ${cmd}`);
  try {
    const { stdout, stderr } = await execAsync(cmd);
    if (stdout) console.log(stdout.trim());
    if (stderr) console.error(stderr.trim());
  } catch (err) {
    console.error(`[orchestrator] Failed to restart ${svc.name}:`, err.message);
  }
}

async function runChecks() {
  const results = await Promise.all(
    SERVICES.map(async (svc) => {
      const healthy = await checkService(svc);
      return { svc, healthy };
    })
  );

  const ts = new Date().toISOString();
  const healthy = results.filter((r) => r.healthy).length;
  const total = results.length;
  console.log(`[orchestrator] ${ts} — ${healthy}/${total} services healthy`);

  for (const { svc, healthy } of results) {
    if (!healthy) {
      console.warn(`[orchestrator] ${svc.name} (port ${svc.port}) is DOWN`);
      await restartService(svc);
    }
  }
}

console.log("[orchestrator] Starting ghost-web-orchestrator");
console.log(`[orchestrator] Monitoring ${SERVICES.length} services every ${CHECK_INTERVAL_MS / 1000}s`);

// Initial check after 10s startup grace period
setTimeout(runChecks, 10_000);
setInterval(runChecks, CHECK_INTERVAL_MS);
