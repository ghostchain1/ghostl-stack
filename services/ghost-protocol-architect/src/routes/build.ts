/**
 * build.ts — POST /api/v1/build
 *
 * Triggers `forge build --skip test` in the contracts/ directory.
 * Requires ALLOW_FORGE_EXEC=true in the environment — fail-closed by default.
 *
 * Body: {} (no required fields)
 * Optional body: { contractsDir?: string }
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolve } from "node:path";
import { runForgeBuild } from "../forgeRunner.js";

const BuildBodySchema = z.object({
  contractsDir: z.string().optional(),
}).optional();

export async function buildRoutes(app: FastifyInstance) {
  app.post("/api/v1/build", async (req, reply) => {
    const parseResult = BuildBodySchema.safeParse(req.body);
    const contractsDir = resolve(
      parseResult.data?.contractsDir ?? process.cwd(),
      "contracts",
    );

    try {
      const result = runForgeBuild(contractsDir);
      app.log.info({ ok: result.ok, exitCode: result.exitCode, durationMs: result.durationMs }, "forge build completed");
      return reply.code(result.ok ? 200 : 422).send({
        ok: result.ok,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        // Truncate output to avoid overwhelming the response
        stdout: result.stdout.slice(-4096),
        stderr: result.stderr.slice(-4096),
      });
    } catch (err: unknown) {
      return reply.code(403).send({ ok: false, error: String(err) });
    }
  });
}
