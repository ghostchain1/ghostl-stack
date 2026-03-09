/**
 * designEngine.ts — Maps natural-language intent to protocol suite parameters.
 *
 * The design engine's job: given a human or AI intent string (e.g. "governance
 * token with staking and DEX"), derive the correct ProtocolSuiteOptions.
 *
 * Phase-3: deterministic keyword mapping (fast, zero external deps).
 * Phase-4: routes to GhostBrain AI for complex multi-step protocol design.
 */

import type { ProtocolSuiteOptions, SuiteRole } from "@ghostchain/ghost-contract-factory";

// ── Intent → role mapping ─────────────────────────────────────────────────────

interface IntentMapping {
  keywords: string[];
  roles: SuiteRole[];
}

const INTENT_MAPS: IntentMapping[] = [
  {
    keywords: ["token", "grc20", "grc-20", "erc20", "fungible"],
    roles: ["token"],
  },
  {
    keywords: ["staking", "stake", "yield", "rewards", "farm", "farming"],
    roles: ["staking"],
  },
  {
    keywords: ["dao", "governance", "vote", "voting", "proposal", "governor"],
    roles: ["dao"],
  },
  {
    keywords: ["vault", "strategy", "auto-compound", "autocompound"],
    roles: ["vault"],
  },
  {
    keywords: ["vesting", "lockup", "cliff", "team", "investor"],
    roles: ["vesting"],
  },
  {
    keywords: ["dex", "swap", "amm", "exchange", "pair", "liquidity pool", "router"],
    roles: ["dex-pair", "dex-factory", "dex-router"],
  },
  {
    keywords: ["full", "complete", "all", "everything", "suite", "protocol"],
    roles: ["token", "staking", "dao", "vault", "vesting", "dex-pair", "dex-factory", "dex-router"],
  },
  {
    keywords: ["defi", "de-fi"],
    roles: ["token", "staking", "vault", "dex-pair", "dex-factory", "dex-router"],
  },
];

// ── Default fallback suite ────────────────────────────────────────────────────

const DEFAULT_ROLES: SuiteRole[] = ["token", "staking", "dao"];

// ── Risk classification ───────────────────────────────────────────────────────

export type ProtocolRisk = "low" | "medium" | "high";

/**
 * Estimate risk level of a proposed protocol suite.
 * More components = higher complexity = higher risk.
 */
function estimateRisk(roles: SuiteRole[]): ProtocolRisk {
  if (roles.length <= 2) return "low";
  if (roles.length <= 5) return "medium";
  return "high";
}

// ── Design result ─────────────────────────────────────────────────────────────

export interface DesignResult {
  /** Resolved PascalCase protocol name */
  name: string;
  /** Resolved suite options */
  suiteOptions: ProtocolSuiteOptions;
  /** Which roles will be generated */
  roles: SuiteRole[];
  /** Estimated risk level */
  risk: ProtocolRisk;
  /** Human-readable explanation of what will be generated */
  explanation: string;
  /** Whether human ratification is recommended before deployment */
  requiresRatification: boolean;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Translate a human/AI intent string into a `ProtocolSuiteOptions` plan.
 *
 * @param intent   Natural language or keyword intent, e.g. "defi with staking and dao"
 * @param name     Desired PascalCase protocol name, e.g. "GhostDeFi"
 * @param outDir   Optional output directory override
 */
export function designProtocol(
  intent: string,
  name: string,
  outDir?: string,
): DesignResult {
  const lower = intent.toLowerCase();
  const resolvedRoles = new Set<SuiteRole>();

  for (const mapping of INTENT_MAPS) {
    if (mapping.keywords.some((kw) => lower.includes(kw))) {
      for (const role of mapping.roles) resolvedRoles.add(role);
    }
  }

  const roles: SuiteRole[] = resolvedRoles.size > 0
    ? [...resolvedRoles]
    : DEFAULT_ROLES;

  const risk = estimateRisk(roles);

  // DEX needs pair + factory + router together (or none)
  const hasDexPart = roles.some((r) => r.startsWith("dex-"));
  if (hasDexPart) {
    for (const r of ["dex-pair", "dex-factory", "dex-router"] as SuiteRole[]) {
      resolvedRoles.add(r);
    }
  }

  const finalRoles = [...new Set([...roles, ...(hasDexPart ? ["dex-pair", "dex-factory", "dex-router"] as SuiteRole[] : [])])];

  const suiteOptions: ProtocolSuiteOptions = {
    name,
    outDir: outDir ?? "contracts/src/generated",
    include: finalRoles,
  };

  const explanation = [
    `Protocol "${name}" designed from intent: "${intent}".`,
    `Will generate ${finalRoles.length} contract(s): ${finalRoles.join(", ")}.`,
    risk === "high"
      ? "HIGH complexity suite — human ratification recommended before deployment."
      : risk === "medium"
        ? "MEDIUM complexity suite — review generated contracts before deploying."
        : "LOW complexity suite — safe for autonomous generation.",
  ].join(" ");

  return {
    name,
    suiteOptions,
    roles: finalRoles,
    risk,
    explanation,
    requiresRatification: risk === "high",
  };
}
