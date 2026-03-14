/**
 * Economy Agent — tokenomics tuning, token burns, liquidity rebalancing, treasury management.
 * Linked to: Adaptive Economy Engine (AEE) port 9974
 */

import logger from "../utils/logger";
import { updateAgentStatus, recordDecision } from "../registry/agentRegistry";
import { sendMessage } from "../communication/agentBus";

const ID   = "economy-agent";
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const flt  = (a: number, b: number) => +(Math.random() * (b - a) + a).toFixed(4);
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

let gstPrice          = 0.0245;
let circulatingSupply = 999_656_000;
let treasuryUSD       = 3_840_000;
let totalBurned       = 18_200_000;
let emissionDailyRate = 42_000;   // GST per day

function computeBurnRequired(): number {
  const threshold = 0.031;
  if (gstPrice > threshold) return rand(50_000, 400_000);
  return 0;
}

type EconDecision = { action: string; reasoning: string; impact: "low" | "medium" | "high" | "critical"; outcome: string; notify?: { to: string; subject: string; content: string } };

function decide(): EconDecision {
  const roll        = Math.random();
  const burnAmt     = computeBurnRequired();
  const priceJitter = flt(-0.0005, 0.0010);
  gstPrice = Math.max(0.008, gstPrice + priceJitter);

  if (roll < 0.20 && burnAmt > 0) {
    circulatingSupply -= burnAmt;
    totalBurned       += burnAmt;
    return {
      action:    `Execute token burn: ${burnAmt.toLocaleString()} GST`,
      reasoning: `Price at $${gstPrice.toFixed(4)} exceeded burn trigger; circulating supply contraction required to stabilise market`,
      impact:    "critical",
      outcome:   `${burnAmt.toLocaleString()} GST removed from circulation; total burned: ${totalBurned.toLocaleString()} GST; new circulating: ${circulatingSupply.toLocaleString()} GST`,
      notify:    {
        to:      "governance-agent",
        subject: "Token burn event executed",
        content: `${burnAmt.toLocaleString()} GST burned on-chain. Circulating supply now ${circulatingSupply.toLocaleString()} GST. Update GIP-burn-tracker and publish to governance dashboard.`,
      },
    };
  }
  if (roll < 0.36) {
    const pool    = pick(["GST/ETH", "GST/USDC", "GST/wBTC", "wGST/MATIC", "GST/OP"]);
    const deltaUSD = rand(20_000, 120_000);
    const direction = Math.random() < 0.65 ? "added" : "removed";
    if (direction === "added") treasuryUSD -= deltaUSD * 0.3;
    return {
      action:    `Rebalance ${pool} liquidity pool`,
      reasoning: `${pool} pool depth ${direction === "added" ? "below" : "above"} efficient threshold; slippage outside 0.3% target`,
      impact:    "medium",
      outcome:   `$${deltaUSD.toLocaleString()} ${direction} to ${pool}; slippage reduced to ${flt(0.05, 0.28).toFixed(2)}%; treasury: $${treasuryUSD.toLocaleString()}`,
    };
  }
  if (roll < 0.50) {
    const delta = rand(-5_000, 8_000);
    emissionDailyRate = Math.max(10_000, emissionDailyRate + delta);
    const direction = delta > 0 ? "increased" : "decreased";
    return {
      action:    `Adjust daily emission schedule (${direction})`,
      reasoning: `Validator participation at ${rand(78, 97)}%; inflation model suggests emission ${direction}`,
      impact:    "medium",
      outcome:   `Daily emission ${direction} by ${Math.abs(delta).toLocaleString()} GST → ${emissionDailyRate.toLocaleString()} GST/day; APR impact: ±${flt(0.2, 1.4).toFixed(2)}%`,
    };
  }
  if (roll < 0.60) {
    const asset = pick(["USDC", "ETH", "BTC", "stGST"]);
    const divAmt = rand(50_000, 200_000);
    treasuryUSD += divAmt * 0.05;
    return {
      action:    `Treasury diversification: allocate to ${asset}`,
      reasoning: `Treasury ${asset} position below minimum 15%; risk rebalancing required`,
      impact:    "medium",
      outcome:   `$${divAmt.toLocaleString()} USDC converted to ${asset}; treasury now $${treasuryUSD.toLocaleString()} (diversification score +${rand(2, 7)})`,
    };
  }
  return {
    action:    "Tokenomics health report",
    reasoning: "Continuous monitoring keeps economic parameters within target ranges",
    impact:    "low",
    outcome:   `GST: $${gstPrice.toFixed(4)} | Circulating: ${circulatingSupply.toLocaleString()} | Burned: ${totalBurned.toLocaleString()} | Daily emission: ${emissionDailyRate.toLocaleString()} | Treasury: $${treasuryUSD.toLocaleString()}`,
  };
}

export function runEconomyAgent(): void {
  updateAgentStatus(ID, "running", "Evaluating tokenomics state");
  try {
    const decision = decide();
    recordDecision(ID, decision.action, decision.reasoning, decision.impact, decision.outcome);

    if (decision.notify) {
      sendMessage(ID, decision.notify.to, "info", decision.notify.subject, decision.notify.content);
    }

    logger.info(`[EconomyAgent] ${decision.action}`);
  } catch (err) {
    logger.error(`[EconomyAgent] Error: ${String(err)}`);
    updateAgentStatus(ID, "error");
    return;
  }
  updateAgentStatus(ID, "idle");
}
