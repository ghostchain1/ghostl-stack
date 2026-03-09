/**
 * build.ts — POST /api/v1/build
 *
 * Accepts a DeFiSystemConfig, orchestrates all enabled modules via architect-engine,
 * writes generated files to the workspace, and optionally triggers a forge build.
 *
 * ALLOW_FORGE_EXEC=true is required for forge build — default is file-write only.
 */

import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildDeFiSystem, type DeFiSystemConfig } from "../architect-engine.js";

// ── Schema ────────────────────────────────────────────────────────────────────

const BuildRequestSchema = z.object({
  projectName: z.string().min(2).regex(/^[A-Z][A-Za-z0-9]*$/, "Must be PascalCase"),
  emitDeploy:  z.boolean().optional(),
  emitSdk:     z.boolean().optional(),
  /** Set true to run `forge build` after writing files (requires ALLOW_FORGE_EXEC=true env) */
  forgeBuild:  z.boolean().optional(),
  amm: z.object({
    feeBps: z.number().int().min(1).max(1000).optional(),
  }).optional(),
  liquidity: z.object({
    targetPrice:          z.number().positive(),
    token0Budget:         z.string().regex(/^\d+$/, "Must be bigint string"),
    decimals0:            z.number().int().min(0).max(18).optional(),
    decimals1:            z.number().int().min(0).max(18).optional(),
    annualRewardBudget:   z.string().regex(/^\d+$/).optional(),
    generateYieldFarm:    z.boolean().optional(),
  }).optional(),
  staking: z.object({
    annualRewardBudget:   z.string().regex(/^\d+$/),
    expectedTotalStaked:  z.string().regex(/^\d+$/),
    tokenPriceRatio:      z.number().positive().optional(),
  }).optional(),
  yield: z.object({
    annualRewardBudget:    z.string().regex(/^\d+$/),
    expectedTotalLpStaked: z.string().regex(/^\d+$/),
    tokenPriceRatio:       z.number().positive().optional(),
  }).optional(),
  treasury: z.object({
    monthlyRevenue:      z.string().regex(/^\d+$/),
    poolReserveRevenue:  z.string().regex(/^\d+$/),
    poolReserveTarget:   z.string().regex(/^\d+$/),
    poolFeeBps:          z.number().int().min(1).max(1000).optional(),
    buybackThreshold:    z.string().regex(/^\d+$/).optional(),
  }).optional(),
  tokenomics: z.object({
    maxSupply:           z.string().regex(/^\d+$/),
    initialSupply:       z.string().regex(/^\d+$/),
    startBlock:          z.number().int().nonnegative(),
    emissionSchedule:    z.enum(["halving", "decay", "linear", "fixed"]),
    initialEmissionRate: z.string().regex(/^\d+$/),
    halvingInterval:     z.number().int().positive().optional(),
    decayRate:           z.number().nonnegative().optional(),
    burnModel:           z.enum(["none", "flat-fee", "transaction-fee", "buyback-burn"]),
    burnBps:             z.number().int().min(0).max(10000).optional(),
    projectionBlocks:    z.number().int().positive().optional(),
  }).optional(),
  bridge: z.object({
    dailyVolume:             z.string().regex(/^\d+$/),
    fastPathTargetSeconds:   z.number().int().positive().optional(),
    bufferMultiplier:        z.number().positive().optional(),
  }).optional(),
});

type BuildRequest = z.infer<typeof BuildRequestSchema>;

// ── Route ─────────────────────────────────────────────────────────────────────

export async function buildRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: BuildRequest }>("/build", {
    schema: { body: BuildRequestSchema },
  }, async (req, reply) => {
    const body = req.body;

    // ── Build DeFi system config ──────────────────────────────────────────
    const config: DeFiSystemConfig = {
      projectName: body.projectName,
      emitDeploy:  body.emitDeploy,
      emitSdk:     body.emitSdk,
    };

    if (body.amm) {
      config.amm = { feeBps: body.amm.feeBps };
    }

    if (body.liquidity) {
      config.liquidity = {
        targetPrice:        body.liquidity.targetPrice,
        token0Budget:       BigInt(body.liquidity.token0Budget),
        decimals0:          body.liquidity.decimals0,
        decimals1:          body.liquidity.decimals1,
        annualRewardBudget: body.liquidity.annualRewardBudget ? BigInt(body.liquidity.annualRewardBudget) : undefined,
        generateYieldFarm:  body.liquidity.generateYieldFarm,
      };
    }

    if (body.staking) {
      config.staking = {
        annualRewardBudget:  BigInt(body.staking.annualRewardBudget),
        expectedTotalStaked: BigInt(body.staking.expectedTotalStaked),
        tokenPriceRatio:     body.staking.tokenPriceRatio,
      };
    }

    if (body.yield) {
      config.yield = {
        annualRewardBudget:    BigInt(body.yield.annualRewardBudget),
        expectedTotalLpStaked: BigInt(body.yield.expectedTotalLpStaked),
        tokenPriceRatio:       body.yield.tokenPriceRatio,
      };
    }

    if (body.treasury) {
      config.treasury = {
        monthlyRevenue:     BigInt(body.treasury.monthlyRevenue),
        poolReserveRevenue: BigInt(body.treasury.poolReserveRevenue),
        poolReserveTarget:  BigInt(body.treasury.poolReserveTarget),
        poolFeeBps:         body.treasury.poolFeeBps,
        buybackThreshold:   body.treasury.buybackThreshold,
      };
    }

    if (body.tokenomics) {
      config.tokenomics = {
        maxSupply:           BigInt(body.tokenomics.maxSupply),
        initialSupply:       BigInt(body.tokenomics.initialSupply),
        startBlock:          body.tokenomics.startBlock,
        emissionSchedule:    body.tokenomics.emissionSchedule,
        initialEmissionRate: BigInt(body.tokenomics.initialEmissionRate),
        halvingInterval:     body.tokenomics.halvingInterval,
        decayRate:           body.tokenomics.decayRate,
        burnModel:           body.tokenomics.burnModel,
        burnBps:             body.tokenomics.burnBps,
        projectionBlocks:    body.tokenomics.projectionBlocks,
      };
    }

    if (body.bridge) {
      config.bridge = {
        dailyVolume:           BigInt(body.bridge.dailyVolume),
        fastPathTargetSeconds: body.bridge.fastPathTargetSeconds,
        bufferMultiplier:      body.bridge.bufferMultiplier,
      };
    }

    // ── Run architect engine ─────────────────────────────────────────────
    const output = buildDeFiSystem(config);

    // ── Write files ───────────────────────────────────────────────────────
    const workspaceRoot = process.env.WORKSPACE_ROOT ?? resolve(process.cwd(), "../..");
    const writtenPaths: string[] = [];

    for (const file of output.files) {
      const absPath = resolve(workspaceRoot, file.path);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, file.content, "utf8");
      writtenPaths.push(file.path);
    }

    // ── Optional: forge build ─────────────────────────────────────────────
    let forgeResult: { success: boolean; stdout?: string; stderr?: string } | undefined;

    if (body.forgeBuild) {
      if (process.env.ALLOW_FORGE_EXEC !== "true") {
        return reply.status(403).send({
          error: "ForgeForbidden",
          message: "Set ALLOW_FORGE_EXEC=true to enable forge build execution.",
        });
      }

      const result = spawnSync("forge", ["build", "--skip", "test"], {
        cwd:      resolve(workspaceRoot, "contracts"),
        encoding: "utf8",
        timeout:  120_000,
      });

      forgeResult = {
        success: result.status === 0,
        stdout:  result.stdout?.slice(0, 4096),
        stderr:  result.stderr?.slice(0, 4096),
      };

      if (!forgeResult.success) {
        return reply.status(500).send({
          error:       "ForgeBuildFailed",
          message:     "forge build exited non-zero",
          forgeResult,
          files:       writtenPaths,
          stats:       output.stats,
        });
      }
    }

    return reply.status(200).send({
      success:     true,
      files:       writtenPaths,
      stats:       output.stats,
      modules:     sanitizeModules(output.modules),
      forgeResult,
    });
  });
}

// ── Sanitize BigInt fields for JSON serialization ─────────────────────────────

function sanitizeModules(modules: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(modules, (_key, value) => {
    if (typeof value === "bigint") return value.toString();
    return value as unknown;
  }));
}
