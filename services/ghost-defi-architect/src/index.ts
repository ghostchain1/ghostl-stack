/**
 * index.ts — GhostChain Ghost DeFi Architect service entry point.
 *
 * Port: 7920 (default; override via DEFI_ARCHITECT_PORT env)
 * Provides autonomous DeFi system design: AMM, liquidity, staking, yield, treasury, tokenomics, bridge.
 */

import { buildApp } from "./app.js";

const PORT = Number(process.env.DEFI_ARCHITECT_PORT ?? 7920);
const HOST = process.env.DEFI_ARCHITECT_HOST ?? "0.0.0.0";

const app = await buildApp();

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`ghost-defi-architect listening on ${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
