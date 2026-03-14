/**
 * InstitutionalOutreach — targets banks, fintechs, governments, and hedge funds.
 */

import logger from "../utils/logger";

export interface Institution {
  id:       string;
  name:     string;
  type:     "bank" | "fintech" | "government" | "fund" | "enterprise";
  region:   string;
  aumUsd:   number; // assets under management / annual revenue
  score:    number;
  status:   "discovered" | "outreached" | "interested" | "piloting";
}

export interface InstitutionalProposal {
  institutionId: string;
  name:          string;
  message:       string;
  sentAt:        string;
}

const INSTITUTIONS: Institution[] = [
  { id: "ins-001", name: "Deutsche Bank",          type: "bank",       region: "EU",    aumUsd: 1_300_000_000_000, score: 92, status: "discovered" },
  { id: "ins-002", name: "Franklin Templeton",     type: "fund",       region: "US",    aumUsd: 1_500_000_000_000, score: 89, status: "discovered" },
  { id: "ins-003", name: "Stripe",                 type: "fintech",    region: "US",    aumUsd: 50_000_000_000,    score: 95, status: "outreached" },
  { id: "ins-004", name: "UAE DIFC",               type: "government", region: "MENA",  aumUsd: 0,                 score: 80, status: "discovered" },
  { id: "ins-005", name: "Standard Chartered",     type: "bank",       region: "APAC",  aumUsd: 800_000_000_000,   score: 85, status: "discovered" },
  { id: "ins-006", name: "Andreessen Horowitz a16z",type: "fund",      region: "US",    aumUsd: 35_000_000_000,    score: 98, status: "outreached" },
];

const proposals: InstitutionalProposal[] = [];

export async function institutionalCampaign(): Promise<InstitutionalProposal[]> {
  logger.info("InstitutionalOutreach: running institution campaign");

  const targets = INSTITUTIONS.filter(i => i.status === "discovered").slice(0, 3);
  const sent: InstitutionalProposal[] = [];

  targets.forEach(inst => {
    const message = buildProposal(inst);
    const p: InstitutionalProposal = { institutionId: inst.id, name: inst.name, message, sentAt: new Date().toISOString() };
    inst.status = "outreached";
    proposals.unshift(p);
    sent.push(p);
    logger.info(`InstitutionalOutreach: [DRY-RUN] sent proposal to ${inst.name}`);
  });

  if (proposals.length > 200) proposals.splice(200);
  return sent;
}

function buildProposal(inst: Institution): string {
  return `Dear ${inst.name} Team,

GhostChain is a next-generation blockchain infrastructure stack (L1→L2→L3) designed for enterprise-grade financial applications.

We invite ${inst.name} to explore:
• Tokenised asset issuance on GhostChain L1
• High-frequency settlement on GhostL2 (<1s finality)
• Private app-chains on GhostL3
• GST-powered transaction fee model

We offer a dedicated pilot programme with full technical support. Happy to arrange a call at your convenience.

— GhostChain Institutional Relations`;
}

export function getInstitutions(): Institution[] {
  return INSTITUTIONS;
}

export function getProposals(): InstitutionalProposal[] {
  return proposals;
}
