/**
 * scan.ts — GET /api/v1/scan
 *
 * Scans contracts/src/ for existing protocol coverage and returns a gap report.
 */

import type { FastifyInstance } from "fastify";
import { resolve } from "node:path";
import { scanContracts } from "../scanner.js";

export async function scanRoutes(app: FastifyInstance) {
  app.get("/api/v1/scan", async (_req, reply) => {
    const contractsDir = resolve(
      process.env.CONTRACTS_DIR ?? process.cwd(),
      "contracts/src",
    );

    const report = scanContracts(contractsDir);

    return reply.code(200).send({ ok: true, report });
  });
}
