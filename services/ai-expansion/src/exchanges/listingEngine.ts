/**
 * ListingEngine — autonomously submits and tracks GST listing applications.
 */

import { Exchange, getExchanges } from "./exchangeScanner";
import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface ListingApplication {
  exchangeId: string;
  exchange:   string;
  proposal:   string;
  status:     "submitted" | "pending" | "listed" | "rejected";
  submittedAt: string;
}

const applications: ListingApplication[] = [];

async function buildProposal(exchange: Exchange): Promise<string> {
  if (openai) {
    try {
      const comp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write professional cryptocurrency exchange listing proposals." },
          { role: "user", content: `Write a GST token listing proposal for ${exchange.name} (Tier ${exchange.tier} exchange, $${(exchange.volume24h / 1e9).toFixed(1)}B daily volume). Highlight GhostChain technology, GST utility, market demand. Max 200 words.` },
        ],
        max_tokens: 250, temperature: 0.7,
      });
      return comp.choices[0]?.message?.content?.trim() ?? fallbackProposal(exchange);
    } catch { /* fall through */ }
  }
  return fallbackProposal(exchange);
}

function fallbackProposal(exchange: Exchange): string {
  return `Dear ${exchange.name} Listing Team,

We are requesting the listing of GST (GhostChain Gas Token) on ${exchange.name}.

Token: GST
Network: GhostChain (EVM-compatible L1 + L2 + L3)
Use case: Gas token for all GhostChain transactions. Deflationary mechanics, governance rights, staking yield.
Market cap: $85M
Daily volume: $2.5M
Holders: 42,000+

GhostChain offers sub-second finality and near-zero fees, attracting a rapidly growing developer and user base. Listing GST would give ${exchange.name} users early access to the Ghost ecosystem.

We are happy to provide liquidity support and co-marketing.

— GhostChain Exchange Relations Team`;
}

export async function submitListing(exchange: Exchange): Promise<ListingApplication> {
  const proposal = await buildProposal(exchange);

  const app: ListingApplication = {
    exchangeId:  exchange.id,
    exchange:    exchange.name,
    proposal,
    status:      "submitted",
    submittedAt: new Date().toISOString(),
  };

  exchange.status   = "applied";
  exchange.appliedAt = app.submittedAt;
  applications.unshift(app);
  if (applications.length > 100) applications.pop();
  logger.info(`ListingEngine: [DRY-RUN] submitted listing to ${exchange.name}`);
  return app;
}

export async function runListingCycle(): Promise<ListingApplication[]> {
  const exchanges = getExchanges().filter(e => e.status === "identified").slice(0, 2);
  return Promise.all(exchanges.map(submitListing));
}

export function getApplications(): ListingApplication[] {
  return applications;
}
