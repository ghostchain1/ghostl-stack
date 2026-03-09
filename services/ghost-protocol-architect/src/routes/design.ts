/**
 * design.ts — POST /api/v1/design
 *
 * Full pipeline: intent → design plan → generate suite → write files → (optional) forge build.
 *
 * Body:
 *   {
 *     intent: string          // natural language: "defi with staking and governance"
 *     name:   string          // PascalCase protocol name: "GhostDeFi"
 *     outDir?: string         // optional output directory override
 *     build?: boolean         // whether to trigger forge build (requires ALLOW_FORGE_EXEC=true)
 *   }
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generateProtocolSuite } from "@ghostchain/ghost-contract-factory";
import { designProtocol } from "../designEngine.js";
import { runForgeBuild  } from "../forgeRunner.js";

const DesignBodySchema = z.object({
  intent: z.string().min(1),
  name:   z.string().min(2).regex(/^[A-Z][A-Za-z0-9]*$/, "Must be PascalCase"),
  outDir: z.string().optional(),
  build:  z.boolean().optional(),
});

export async function designRoutes(app: FastifyInstance) {
  app.post("/api/v1/design", async (req, reply) => {
    const parseResult = DesignBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({ ok: false, error: parseResult.error.flatten() });
    }

    const { intent, name, outDir, build } = parseResult.data;

    // 1. Design plan
    const design = designProtocol(intent, name, outDir);

    // 2. Generate all Solidity files
    const suite = generateProtocolSuite(design.suiteOptions);

    // 3. Write files to disk
    const cwd = process.cwd();
    for (const file of suite.files) {
      const abs = resolve(cwd, file.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.content, "utf8");
    }

    app.log.info({ name, roles: design.roles, files: suite.stats.totalFiles }, "Protocol suite generated");

    // 4. Optional forge build
    let forgeResult: ReturnType<typeof runForgeBuild> | undefined;
    if (build) {
      try {
        const contractsDir = resolve(cwd, "contracts");
        forgeResult = runForgeBuild(contractsDir);
      } catch (err: unknown) {
        app.log.warn({ err: String(err) }, "forge build skipped");
      }
    }

    return reply.code(200).send({
      ok: true,
      design: {
        name: design.name,
        roles: design.roles,
        risk: design.risk,
        explanation: design.explanation,
        requiresRatification: design.requiresRatification,
      },
      suite: {
        generatedAt: suite.generatedAt,
        totalFiles: suite.stats.totalFiles,
        files: suite.files.map((f) => ({ path: f.path, role: f.role, bytes: f.content.length })),
      },
      forge: forgeResult
        ? { ok: forgeResult.ok, exitCode: forgeResult.exitCode, durationMs: forgeResult.durationMs }
        : null,
    });
  });
}
