/**
 * generate.ts — POST /api/v1/generate
 *
 * Generate a single contract by type and write it to disk.
 *
 * Body:
 *   {
 *     type:   "token" | "nft" | "staking" | "dao" | "dex" | "vault" | "vesting"
 *     name:   string   // PascalCase
 *     outDir?: string
 *     options?: Record<string, unknown>
 *     emitDeployScript?: boolean  // default true
 *     emitSdkWrapper?:  boolean   // default false
 *   }
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generateContract, GenerateInputSchema } from "@ghostchain/ghost-contract-factory";

export async function generateRoutes(app: FastifyInstance) {
  app.post("/api/v1/generate", async (req, reply) => {
    const parseResult = GenerateInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({ ok: false, error: parseResult.error.flatten() });
    }

    const output = generateContract(parseResult.data);
    const cwd    = process.cwd();

    const written: { path: string; bytes: number }[] = [];

    const writeFile = (path: string, content: string) => {
      const abs = resolve(cwd, path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
      written.push({ path, bytes: content.length });
    };

    // Write Solidity (single file or bundle)
    if (Array.isArray(output.solidity)) {
      for (const f of output.solidity) writeFile(f.path, f.content);
    } else {
      writeFile(output.solidity.path, output.solidity.content);
    }

    if (output.deployScript) writeFile(output.deployScript.path, output.deployScript.content);
    if (output.sdkWrapper)   writeFile(output.sdkWrapper.path,   output.sdkWrapper.content);

    app.log.info({ type: parseResult.data.type, name: parseResult.data.name, files: written.length }, "Contract generated");

    return reply.code(200).send({ ok: true, files: written });
  });
}
