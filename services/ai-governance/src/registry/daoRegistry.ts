/**
 * daoRegistry.ts — Registry of Ghost DAO entities
 *
 * Maintains the canonical list of DAOs in the Ghost ecosystem,
 * their governance parameters, member counts, and treasury balances.
 * Designed to grow: new DAOs can be registered at runtime.
 */

import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DAOStatus = "active" | "inactive" | "bootstrapping" | "deprecated";

export interface DAO {
  id:                string;
  name:              string;
  description:       string;
  status:            DAOStatus;
  created:           number;
  updatedAt:         number;

  // Governance config
  quorumThreshold:   number;   // fraction 0-1, e.g. 0.20
  passThreshold:     number;   // fraction 0-1, e.g. 0.51
  votingPeriodDays:  number;
  timelockDays:      number;   // delay after approval before execution

  // Members
  memberCount:       number;
  validatorCount:    number;

  // Treasury
  treasuryUSD:       number;
  treasuryToken:     number;   // GHOST tokens

  // Proposals
  totalProposals:    number;
  activeProposals:   number;
  executedProposals: number;

  tags:              string[];
  contractAddress:   string | null;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const daos = new Map<string, DAO>();

// ── Helpers ───────────────────────────────────────────────────────────────────

export function registerDAO(
  name:        string,
  description: string,
  opts?: Partial<Pick<DAO, "status" | "quorumThreshold" | "passThreshold" | "votingPeriodDays" | "timelockDays" | "memberCount" | "validatorCount" | "treasuryUSD" | "treasuryToken" | "contractAddress" | "tags">>,
): DAO {
  // Idempotent by name
  const existing = [...daos.values()].find((d) => d.name === name);
  if (existing) {
    logger.info(`[DAORegistry] DAO "${name}" already registered — returning existing`);
    return existing;
  }

  const now = Date.now();
  const dao: DAO = {
    id:                uuidv4(),
    name,
    description,
    status:            opts?.status            ?? "active",
    created:           now,
    updatedAt:         now,
    quorumThreshold:   opts?.quorumThreshold   ?? 0.20,
    passThreshold:     opts?.passThreshold      ?? 0.51,
    votingPeriodDays:  opts?.votingPeriodDays  ?? 7,
    timelockDays:      opts?.timelockDays       ?? 2,
    memberCount:       opts?.memberCount        ?? 0,
    validatorCount:    opts?.validatorCount     ?? 0,
    treasuryUSD:       opts?.treasuryUSD        ?? 0,
    treasuryToken:     opts?.treasuryToken      ?? 0,
    totalProposals:    0,
    activeProposals:   0,
    executedProposals: 0,
    tags:              opts?.tags               ?? [],
    contractAddress:   opts?.contractAddress    ?? null,
  };

  daos.set(dao.id, dao);
  logger.info(`[DAORegistry] Registered DAO: "${name}" (${dao.id})`);
  return dao;
}

// ── Seed canonical Ghost DAOs ─────────────────────────────────────────────────

export function seedRegistry(): void {
  if (daos.size > 0) { logger.info("[DAORegistry] Already seeded — skipping"); return; }

  registerDAO(
    "Ghost Treasury DAO",
    "Controls the primary GhostChain treasury, token burn parameters, and core economic policies.",
    { memberCount: 1_850, validatorCount: 48, treasuryUSD: 12_400_000, treasuryToken: 45_000_000, quorumThreshold: 0.25, timelockDays: 3, tags: ["treasury", "economics", "tokenomics"] },
  );

  registerDAO(
    "Ghost Infrastructure DAO",
    "Governs deployment decisions for GhostChain, GhostL2, GhostL3 infrastructure, bridges, and smart contracts.",
    { memberCount: 620, validatorCount: 48, treasuryUSD: 3_800_000, treasuryToken: 12_000_000, quorumThreshold: 0.20, timelockDays: 2, tags: ["infrastructure", "validators", "bridge", "l2", "l3"] },
  );

  registerDAO(
    "Ghost Ecosystem DAO",
    "Manages grants, developer relations, marketing, and ecosystem expansion programmes.",
    { memberCount: 4_200, validatorCount: 20, treasuryUSD: 5_600_000, treasuryToken: 28_000_000, quorumThreshold: 0.15, timelockDays: 1, tags: ["grants", "developers", "marketing", "expansion"] },
  );

  registerDAO(
    "Ghost Governance DAO",
    "Meta-governance: manages the rules of governance itself, DAO parameters, and upgrade procedures.",
    { memberCount: 980, validatorCount: 48, treasuryUSD: 1_200_000, treasuryToken: 8_000_000, quorumThreshold: 0.30, passThreshold: 0.60, timelockDays: 5, tags: ["meta-governance", "parameters", "upgrades"] },
  );

  // Update proposal counters with realistic seed data
  const all = [...daos.values()];
  const counts = [{ t: 34, a: 3, e: 28 }, { t: 18, a: 2, e: 14 }, { t: 51, a: 5, e: 42 }, { t: 12, a: 1, e: 9 }];
  for (let i = 0; i < all.length; i++) {
    all[i].totalProposals    = counts[i].t;
    all[i].activeProposals   = counts[i].a;
    all[i].executedProposals = counts[i].e;
    all[i].updatedAt = Date.now();
  }

  logger.info(`[DAORegistry] Seeded ${daos.size} canonical DAOs`);
}

// ── Update helpers ────────────────────────────────────────────────────────────

export function updateDAO(id: string, patch: Partial<DAO>): boolean {
  const dao = daos.get(id);
  if (!dao) return false;
  Object.assign(dao, patch, { updatedAt: Date.now() });
  return true;
}

export function incrementProposalCounts(daoName: string, delta: { active?: number; executed?: number; total?: number }): void {
  const dao = [...daos.values()].find((d) => d.name === daoName);
  if (!dao) return;
  if (delta.total   !== undefined) dao.totalProposals    += delta.total;
  if (delta.active  !== undefined) dao.activeProposals   += delta.active;
  if (delta.executed!== undefined) dao.executedProposals += delta.executed;
  dao.updatedAt = Date.now();
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getDAO(id: string):            DAO | undefined { return daos.get(id); }
export function getDAOByName(name: string):    DAO | undefined { return [...daos.values()].find((d) => d.name === name); }
export function getAllDAOs():                   DAO[]           { return [...daos.values()]; }

export function getRegistryStats() {
  const all = getAllDAOs();
  return {
    totalDAOs:           all.length,
    activeDAOs:          all.filter((d) => d.status === "active").length,
    totalMembers:        all.reduce((s, d) => s + d.memberCount, 0),
    totalTreasuryUSD:    all.reduce((s, d) => s + d.treasuryUSD, 0),
    totalTreasuryToken:  all.reduce((s, d) => s + d.treasuryToken, 0),
    totalProposals:      all.reduce((s, d) => s + d.totalProposals, 0),
    activeProposals:     all.reduce((s, d) => s + d.activeProposals, 0),
    executedProposals:   all.reduce((s, d) => s + d.executedProposals, 0),
  };
}
