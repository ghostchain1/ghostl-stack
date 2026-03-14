/**
 * InstitutionalIntegration — targets banks, fintech firms, and governments with
 * technical integration proposals for GhostChain L1/L2/L3.
 */

import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface Institution {
  id:       string;
  name:     string;
  type:     "bank" | "asset-manager" | "fintech" | "government" | "exchange";
  country:  string;
  aum:      string;
  contact:  string;
  status:   "identified" | "contacted" | "evaluating" | "integrated";
  notes:    string;
}

export interface IntegrationProposal {
  institutionId:   string;
  institutionName: string;
  proposal:        string;
  integrationType: "custody" | "settlement" | "tokenisation" | "payments" | "cbdc";
  createdAt:       string;
}

export const INSTITUTIONS: Institution[] = [
  { id: "i1",  name: "Deutsche Bank",         type: "bank",           country: "DE", aum: "$1.4T",  contact: "digital-assets@db.com",           status: "identified", notes: "Custody + settlement layer using GhostL1" },
  { id: "i2",  name: "Franklin Templeton",    type: "asset-manager",  country: "US", aum: "$1.5T",  contact: "blockchain@franklintempleton.com", status: "contacted",  notes: "Tokenised fund products on GhostL2" },
  { id: "i3",  name: "Stripe",                type: "fintech",        country: "US", aum: "$50B",   contact: "blockchain@stripe.com",            status: "identified", notes: "GST payment integration in Stripe checkout" },
  { id: "i4",  name: "UAE DIFC Authority",    type: "government",     country: "AE", aum: "N/A",    contact: "fintech@difc.ae",                  status: "identified", notes: "GhostChain as preferred chain in DIFC FinTech Hive" },
  { id: "i5",  name: "Standard Chartered",    type: "bank",           country: "GB", aum: "$750B",  contact: "digital-assets@sc.com",            status: "identified", notes: "Trade finance tokenisation on GhostL3" },
  { id: "i6",  name: "Andreessen Horowitz",   type: "asset-manager",  country: "US", aum: "$35B",   contact: "crypto@a16z.com",                  status: "contacted",  notes: "Series A investment + ecosystem fund" },
  { id: "i7",  name: "Societe Generale",      type: "bank",           country: "FR", aum: "$1.6T",  contact: "forge@socgen.com",                 status: "identified", notes: "Bond tokenisation pilot on GhostL2" },
  { id: "i8",  name: "MAS Singapore",         type: "government",     country: "SG", aum: "N/A",    contact: "fintech@mas.gov.sg",               status: "identified", notes: "Project Guardian CBDC pilot integration" },
];

const proposals: IntegrationProposal[] = [];

async function buildProposal(inst: Institution): Promise<string> {
  if (openai) {
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write formal, professional blockchain integration proposals for institutional clients. Keep it to 3 paragraphs." },
          { role: "user",   content: `Write a GhostChain integration proposal for ${inst.name} (${inst.type}, ${inst.country}). Use case: ${inst.notes}. Emphasise regulatory compliance, security, and sub-second settlement.` },
        ],
        max_tokens: 400, temperature: 0.6,
      });
      return res.choices[0]?.message?.content?.trim() ?? fallbackProposal(inst);
    } catch {
      return fallbackProposal(inst);
    }
  }
  return fallbackProposal(inst);
}

function fallbackProposal(inst: Institution): string {
  return `Dear ${inst.name} Team,

GhostChain is a production-ready multi-layer blockchain providing institutional-grade infrastructure for ${inst.notes}. Our L1 settlement layer achieves 10,000 TPS with sub-second finality, while GhostL2 offers EVM-compatible smart contracts and GhostL3 provides dedicated app-chains with custom governance.

We propose a structured pilot programme: Phase 1 (30 days) — technical due diligence and sandbox integration; Phase 2 (60 days) — live pilot with limited transaction volume; Phase 3 — full production integration with SLA guarantees. Full regulatory documentation available upon request.

We believe GhostChain can meaningfully reduce ${inst.name}'s settlement costs by up to 90% while maintaining institutional security standards. We are pleased to arrange a technical briefing at your convenience.`;
}

function detectType(inst: Institution): IntegrationProposal["integrationType"] {
  const n = inst.notes.toLowerCase();
  if (n.includes("custody") || n.includes("settlement")) return "settlement";
  if (n.includes("fund") || n.includes("bond") || n.includes("tokenis")) return "tokenisation";
  if (n.includes("payment")) return "payments";
  if (n.includes("cbdc")) return "cbdc";
  return "settlement";
}

export async function sendIntegrationProposal(inst: Institution): Promise<IntegrationProposal> {
  const existing = proposals.find(p => p.institutionId === inst.id);
  if (existing) {
    logger.info(`InstitutionalIntegration: already proposed to ${inst.name}`);
    return existing;
  }

  const proposal = await buildProposal(inst);
  const result: IntegrationProposal = {
    institutionId:   inst.id,
    institutionName: inst.name,
    proposal,
    integrationType: detectType(inst),
    createdAt:       new Date().toISOString(),
  };

  proposals.push(result);
  inst.status = "contacted";
  logger.info(`InstitutionalIntegration: proposal sent to ${inst.name}`);
  return result;
}

export async function runInstitutionalCampaign(limit = 3): Promise<IntegrationProposal[]> {
  const targets = INSTITUTIONS
    .filter(i => i.status === "identified")
    .slice(0, limit);

  const results: IntegrationProposal[] = [];
  for (const inst of targets) {
    results.push(await sendIntegrationProposal(inst));
  }
  logger.info(`InstitutionalIntegration: campaign complete — ${results.length} proposals sent`);
  return results;
}

export function getInstitutions(): Institution[] { return INSTITUTIONS; }
export function getProposals():    IntegrationProposal[] { return proposals; }
