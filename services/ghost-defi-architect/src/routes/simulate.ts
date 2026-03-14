/**
 * simulate.ts — POST /api/v1/simulate
 *
 * Runs DeFi math simulations (AMM swap, bonding curves, reward projections,
 * tokenomics, bridge) without generating any files or touching the filesystem.
 */

import { type FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getAmountOut,
  getAmountIn,
  priceImpactPct,
  spotPrice,
  optimalLiquidityAmounts,
  liquidityMinted,
  simulateMultiHop,
  type PoolState,
} from "../math/amm-math.js";
import {
  priceAt,
  collateralRequired,
  collateralReturned,
  supplyForCollateral,
  sampleCurve,
  type BondingCurveParams,
} from "../math/bonding-curves.js";
import {
  aprFromRate,
  apyFromApr,
  apyContinuous,
  updateAccumulator,
  pendingRewards,
  vestedAmount,
  splitFee,
  simulateSupply,
  type AccumulatorState,
  type UserAccumulatorState,
} from "../math/reward-curves.js";
import { designTokenomics } from "../modules/tokenomics-engine.js";
import { designBridge }     from "../modules/bridge-engine.js";

// ── Schema ────────────────────────────────────────────────────────────────────

const HopSpecSchema = z.object({
  reserveIn:  z.string().regex(/^\d+$/),
  reserveOut: z.string().regex(/^\d+$/),
  feeBps:     z.number().int().min(0).max(10000),
});

const BondingCurveSchema: z.ZodType<BondingCurveParams> = z.discriminatedUnion("type", [
  z.object({
    type:         z.literal("linear"),
    initialPrice: z.number(),
    slope:        z.number(),
  }),
  z.object({
    type:         z.literal("exponential"),
    initialPrice: z.number(),
    growthRate:   z.number(),
  }),
  z.object({
    type:         z.literal("logarithmic"),
    initialPrice: z.number(),
    scale:        z.number(),
  }),
  z.object({
    type:         z.literal("sigmoid"),
    maxPrice:     z.number(),
    midpoint:     z.number(),
    steepness:    z.number(),
  }),
]);

const SimulateRequestSchema = z.object({
  /** AMM single-hop swap simulation */
  ammSwap: z.object({
    amountIn:   z.string().regex(/^\d+$/),
    reserveIn:  z.string().regex(/^\d+$/),
    reserveOut: z.string().regex(/^\d+$/),
    feeBps:     z.number().int().min(0).max(10000),
  }).optional(),

  /** AMM multi-hop simulation */
  ammMultiHop: z.object({
    amountIn: z.string().regex(/^\d+$/),
    hops:     z.array(HopSpecSchema).min(2).max(5),
  }).optional(),

  /** Bonding curve price/collateral simulation */
  bondingCurve: z.object({
    curve:       BondingCurveSchema,
    supplyFrom:  z.number().nonnegative(),
    supplyTo:    z.number().positive(),
    samplePoints: z.number().int().min(10).max(500).optional(),
  }).optional(),

  /** Reward accumulator simulation */
  rewardAccumulator: z.object({
    totalStaked:          z.string().regex(/^\d+$/),
    userStake:            z.string().regex(/^\d+$/),
    rewardRatePerSecond:  z.string().regex(/^\d+$/),
    elapsedSeconds:       z.number().int().nonnegative(),
  }).optional(),

  /** APY calculation */
  apy: z.object({
    aprPct:               z.number().nonnegative(),
    compoundingsPerYear:  z.number().int().positive().optional(),
  }).optional(),

  /** Vesting schedule simulation */
  vesting: z.object({
    startTimestamp:  z.number().int().nonnegative(),
    cliffSeconds:    z.number().int().nonnegative(),
    durationSeconds: z.number().int().positive(),
    totalAmount:     z.string().regex(/^\d+$/),
    checkTimestamp:  z.number().int().nonnegative(),
  }).optional(),

  /** Fee split simulation */
  feeSplit: z.object({
    feeAmount:        z.number().nonnegative(),
    lpFraction:       z.number().min(0).max(1).optional(),
    treasuryFraction: z.number().min(0).max(1).optional(),
    buybackFraction:  z.number().min(0).max(1).optional(),
    stakerFraction:   z.number().min(0).max(1).optional(),
    protocolFraction: z.number().min(0).max(1).optional(),
  }).optional(),

  /** Full tokenomics projection */
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

  /** Bridge liquidity simulation */
  bridge: z.object({
    dailyVolume:           z.string().regex(/^\d+$/),
    fastPathTargetSeconds: z.number().int().positive().optional(),
    bufferMultiplier:      z.number().positive().optional(),
  }).optional(),
});

type SimulateRequest = z.infer<typeof SimulateRequestSchema>;

// ── Route ─────────────────────────────────────────────────────────────────────

export async function simulateRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SimulateRequest }>("/simulate", {
    schema: { body: SimulateRequestSchema },
  }, async (req, reply) => {
    const body = req.body;
    const results: Record<string, unknown> = {};

    // ── AMM single-hop ────────────────────────────────────────────────────
    if (body.ammSwap) {
      const { amountIn, reserveIn, reserveOut, feeBps } = body.ammSwap;
      const amtIn   = BigInt(amountIn);
      const resIn   = BigInt(reserveIn);
      const resOut  = BigInt(reserveOut);
      const amtOut  = getAmountOut(amtIn, resIn, resOut, feeBps);
      const amtInQ  = getAmountIn(amtOut, resIn, resOut, feeBps);
      const impact  = priceImpactPct(amtIn, resIn);
      const price   = spotPrice(resIn, resOut, 18, 18);

      results.ammSwap = {
        amountOut:      amtOut.toString(),
        quoteAmountIn:  amtInQ.toString(),
        priceImpactPct: impact.toFixed(6),
        spotPrice:      price.toFixed(18),
      };
    }

    // ── AMM multi-hop ─────────────────────────────────────────────────────
    if (body.ammMultiHop) {
      const amtIn = BigInt(body.ammMultiHop.amountIn);
      const hops: PoolState[]  = body.ammMultiHop.hops.map((h: { reserveIn: string; reserveOut: string; feeBps: number }) => ({
        reserve0: BigInt(h.reserveIn),
        reserve1: BigInt(h.reserveOut),
        feeBps:   h.feeBps,
      }));
      const { amountOut } = simulateMultiHop(amtIn, hops);
      results.ammMultiHop = {
        amountIn:  amtIn.toString(),
        amountOut: amountOut.toString(),
        hops:      hops.length,
      };
    }

    // ── Bonding curve ─────────────────────────────────────────────────────
    if (body.bondingCurve) {
      const { curve, supplyFrom, supplyTo, samplePoints = 100 } = body.bondingCurve;
      const priceAtFrom      = priceAt(supplyFrom, curve);
      const priceAtTo        = priceAt(supplyTo,   curve);
      const collateralBuy    = collateralRequired(supplyFrom, supplyTo, curve);
      const collateralSell   = collateralReturned(supplyFrom, supplyTo, curve);
      const supplyFromColl   = supplyForCollateral(supplyFrom, collateralBuy, curve);
      const curveSample      = sampleCurve(curve, supplyTo * 1.2, samplePoints);

      results.bondingCurve = {
        priceAtFrom,
        priceAtTo,
        collateralToBuy: collateralBuy,
        collateralOnSell: collateralSell,
        supplyFromCollateral: supplyFromColl,
        curveSample,
      };
    }

    // ── Reward accumulator ────────────────────────────────────────────────
    if (body.rewardAccumulator) {
      const { totalStaked, userStake, rewardRatePerSecond, elapsedSeconds } = body.rewardAccumulator;
      const startTs = 1_700_000_000;
      const endTs   = startTs + elapsedSeconds;

      const globalState: AccumulatorState = {
        rewardPerTokenStored: 0,
        lastUpdateTime:       startTs,
        rewardRate:           Number(rewardRatePerSecond) / 1e18,
        totalStaked:          Number(totalStaked) / 1e18,
      };
      const userState: UserAccumulatorState = {
        stakedBalance:          Number(userStake) / 1e18,
        userRewardPerTokenPaid: 0,
        rewards:                0,
      };

      const updated = updateAccumulator(globalState, endTs);
      const earned  = pendingRewards(updated, userState, endTs);

      results.rewardAccumulator = {
        earned:               (earned * 1e18).toFixed(0),
        rewardPerToken:       (updated.rewardPerTokenStored * 1e18).toFixed(0),
        elapsedSeconds,
      };
    }

    // ── APY ───────────────────────────────────────────────────────────────
    if (body.apy) {
      const { aprPct, compoundingsPerYear = 365 } = body.apy;
      const apy          = apyFromApr(aprPct, compoundingsPerYear);
      const apyCont      = apyContinuous(aprPct);

      results.apy = {
        aprPct,
        apyPct:           apy.toFixed(4),
        apyContinuousPct: apyCont.toFixed(4),
        compoundingsPerYear,
      };
    }

    // ── Vesting ───────────────────────────────────────────────────────────
    if (body.vesting) {
      const { startTimestamp, cliffSeconds, durationSeconds, totalAmount, checkTimestamp } = body.vesting;
      const totalNum = Number(totalAmount) / 1e18;
      const vested = vestedAmount(
        checkTimestamp,
        startTimestamp,
        startTimestamp + cliffSeconds,
        startTimestamp + durationSeconds,
        totalNum,
      );
      const vestingPct = totalNum > 0 ? (vested / totalNum * 100) : 0;

      results.vesting = {
        vestedAmount: (vested * 1e18).toFixed(0),
        vestedPct:    vestingPct.toFixed(4),
        locked:       ((totalNum - vested) * 1e18).toFixed(0),
      };
    }

    // ── Fee split ─────────────────────────────────────────────────────────
    if (body.feeSplit) {
      const { feeAmount, lpFraction, treasuryFraction, buybackFraction, stakerFraction, protocolFraction } = body.feeSplit;
      const split = splitFee(feeAmount, { lpFraction, treasuryFraction, buybackFraction, stakerFraction, protocolFraction });
      results.feeSplit = {
        toLPs:       split.toLPs,
        toTreasury:  split.toTreasury,
        toBuyback:   split.toBuyback,
        toStakers:   split.toStakers,
        toProtocol:  split.toProtocol,
      };
    }

    // ── Tokenomics projection ─────────────────────────────────────────────
    if (body.tokenomics) {
      const design = designTokenomics({
        ...body.tokenomics,
        maxSupply:           BigInt(body.tokenomics.maxSupply),
        initialSupply:       BigInt(body.tokenomics.initialSupply),
        initialEmissionRate: BigInt(body.tokenomics.initialEmissionRate),
        burnModel:           body.tokenomics.burnModel,
      });
      results.tokenomics = {
        summary:     design.summary,
        schedule:    design.schedule.slice(0, 20), // trim for response size
        supplyProjection: design.supplyProjection.slice(0, 52), // ~1yr weekly
      };
    }

    // ── Bridge simulation ─────────────────────────────────────────────────
    if (body.bridge) {
      const out = designBridge({
        projectName: "SimBridge",
        dailyVolume:           BigInt(body.bridge.dailyVolume),
        fastPathTargetSeconds: body.bridge.fastPathTargetSeconds,
        bufferMultiplier:      body.bridge.bufferMultiplier,
      });
      results.bridge = {
        simulation:   {
          estimatedDailyFee:   out.simulation.estimatedDailyFee.toString(),
          l3ToL2FastPath:      out.simulation.l3ToL2FastPath,
          l2ToL1Settlement:    out.simulation.l2ToL1Settlement,
          crossLayerSlippage:  out.simulation.crossLayerSlippage,
        },
        routingConfig: {
          chains: {
            L1: { ...out.routingConfig.chains.L1, recommendedLiquidity: out.routingConfig.chains.L1.recommendedLiquidity.toString() },
            L2: { ...out.routingConfig.chains.L2, recommendedLiquidity: out.routingConfig.chains.L2.recommendedLiquidity.toString() },
            L3: { ...out.routingConfig.chains.L3, recommendedLiquidity: out.routingConfig.chains.L3.recommendedLiquidity.toString() },
          },
        },
      };
    }

    return reply.status(200).send({ results });
  });
}
