/**
 * EcosystemAlliance — proposes bridge integrations and ecosystem treaties with
 * major L1/L2 chains so GhostChain becomes an interoperability hub.
 */

import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface ChainAlliance {
  id:           string;
  chain:        string;
  ecosystem:    string;
  bridgeType:   "native" | "canonical" | "third-party";
  tvlTarget:    string;
  status:       "identified" | "proposed" | "building" | "live";
  proposal:     string;
  proposedAt?:  string;
}

export const ALLIANCES: ChainAlliance[] = [
  { id: "a1", chain: "Ethereum",   ecosystem: "Ethereum L1", bridgeType: "canonical",   tvlTarget: "$50M",  status: "building",    proposal: "" },
  { id: "a2", chain: "Arbitrum",   ecosystem: "Ethereum L2", bridgeType: "native",      tvlTarget: "$20M",  status: "proposed",    proposal: "" },
  { id: "a3", chain: "Optimism",   ecosystem: "Ethereum L2", bridgeType: "native",      tvlTarget: "$15M",  status: "proposed",    proposal: "" },
  { id: "a4", chain: "Polygon",    ecosystem: "Ethereum L2", bridgeType: "canonical",   tvlTarget: "$25M",  status: "identified",  proposal: "" },
  { id: "a5", chain: "Solana",     ecosystem: "Solana",      bridgeType: "third-party", tvlTarget: "$10M",  status: "identified",  proposal: "" },
  { id: "a6", chain: "Cosmos Hub", ecosystem: "Cosmos",      bridgeType: "native",      tvlTarget: "$8M",   status: "identified",  proposal: "" },
  { id: "a7", chain: "BNB Chain",  ecosystem: "BNB",         bridgeType: "canonical",   tvlTarget: "$30M",  status: "identified",  proposal: "" },
  { id: "a8", chain: "Avalanche",  ecosystem: "Avalanche",   bridgeType: "native",      tvlTarget: "$12M",  status: "identified",  proposal: "" },
];

async function generateBridgeProposal(alliance: ChainAlliance): Promise<string> {
  if (openai) {
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write concise technical blockchain bridge integration proposals (2 paragraphs)." },
          { role: "user",   content: `Write a bridge integration proposal from GhostChain to ${alliance.chain} (${alliance.ecosystem}). Bridge type: ${alliance.bridgeType}. Emphasise TVL growth target of ${alliance.tvlTarget}, security model, and mutual ecosystem benefits. Keep professional and technical.` },
        ],
        max_tokens: 300, temperature: 0.7,
      });
      return res.choices[0]?.message?.content?.trim() ?? fallbackProposal(alliance);
    } catch {
      return fallbackProposal(alliance);
    }
  }
  return fallbackProposal(alliance);
}

function fallbackProposal(a: ChainAlliance): string {
  return `GhostChain proposes a ${a.bridgeType} bridge integration with ${a.chain} targeting ${a.tvlTarget} in bridged TVL within 6 months. The integration would use a validator-signed message-passing protocol with 7-of-12 multi-sig security, enabling seamless GST and ERC-20 transfers between ecosystems.

Both ecosystems benefit from expanded liquidity, shared DeFi composability, and unified developer tooling. GhostChain commits to co-funding the bridge security audit and providing dedicated developer support for the ${a.chain} team during integration.`;
}

export async function buildAlliance(allianceId: string): Promise<ChainAlliance | null> {
  const alliance = ALLIANCES.find(a => a.id === allianceId);
  if (!alliance) return null;

  alliance.proposal   = await generateBridgeProposal(alliance);
  alliance.status     = "proposed";
  alliance.proposedAt = new Date().toISOString();
  logger.info(`EcosystemAlliance: bridge proposal generated for ${alliance.chain}`);
  return alliance;
}

export async function runAllianceCycle(limit = 3): Promise<ChainAlliance[]> {
  const targets = ALLIANCES.filter(a => a.status === "identified").slice(0, limit);
  const results: ChainAlliance[] = [];
  for (const a of targets) {
    const result = await buildAlliance(a.id);
    if (result) results.push(result);
  }
  logger.info(`EcosystemAlliance: cycle complete — ${results.length} proposals generated`);
  return results;
}

export function getAlliances(): ChainAlliance[] { return ALLIANCES; }
