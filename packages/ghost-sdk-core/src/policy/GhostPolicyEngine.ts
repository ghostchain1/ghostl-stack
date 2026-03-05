// ─────────────────────────────────────────────────────────────────────────────
// GhostPolicyEngine – Pre-flight transaction policy enforcement
// ─────────────────────────────────────────────────────────────────────────────
import { GhostPolicyViolationError } from "../errors";
import type { GhostPolicyRule, GhostTransactionRequest } from "../types";

export class GhostPolicyEngine {
  private rules: GhostPolicyRule[] = [];

  /** Register a policy rule. Rules run in registration order. */
  addRule(rule: GhostPolicyRule): this {
    this.rules.push(rule);
    return this;
  }

  removeRule(id: string): this {
    this.rules = this.rules.filter((r) => r.id !== id);
    return this;
  }

  /** Run all policy rules against a transaction. Throws on first violation. */
  async enforce(tx: GhostTransactionRequest): Promise<void> {
    for (const rule of this.rules) {
      const passed = await rule.check(tx);
      if (!passed) {
        throw new GhostPolicyViolationError(
          `Policy violation [${rule.id}]: ${rule.description}`,
          rule.id
        );
      }
    }
  }

  /** Run all rules and return a report (no throws). */
  async audit(tx: GhostTransactionRequest): Promise<{ ruleId: string; passed: boolean }[]> {
    return Promise.all(
      this.rules.map(async (rule) => ({
        ruleId: rule.id,
        passed: await Promise.resolve(rule.check(tx)).catch(() => false)
      }))
    );
  }
}

// ─── Built-in common rules ──────────────────────────────────────────────────

export const maxValueRule = (maxWei: bigint): GhostPolicyRule => ({
  id: "max-value",
  description: `Transaction value must not exceed ${maxWei} wei`,
  check: (tx) => (tx.value ?? 0n) <= maxWei
});

export const allowlistRule = (allowed: string[]): GhostPolicyRule => {
  const set = new Set(allowed.map((a) => a.toLowerCase()));
  return {
    id: "allowlist",
    description: "Recipient address must be on the allowlist",
    check: (tx) => !tx.to || set.has(tx.to.toLowerCase())
  };
};

export const noContractCallRule = (): GhostPolicyRule => ({
  id: "no-contract-call",
  description: "Transaction must not include calldata",
  check: (tx) => !tx.data || tx.data === "0x"
});
