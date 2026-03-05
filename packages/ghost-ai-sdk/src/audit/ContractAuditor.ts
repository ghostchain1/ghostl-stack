import { Interface, isAddress, ZeroAddress, keccak256 } from "ethers";
import type { AuditFinding, AuditResult } from "./Types.js";

// Known high-impact function selectors (can be extended via GhostBrain config)
const SUSPICIOUS_SELECTORS = new Set([
  "0x095ea7b3", // approve(address,uint256)
  "0x23b872dd", // transferFrom(address,address,uint256)
  "0x3659cfe6", // upgradeTo(address) — UUPS proxy
  "0x2e1a7d4d", // withdraw(uint256) — WETH / common pattern
  "0xa9059cbb", // transfer(address,uint256)
]);

export class ContractAuditor {
  /**
   * Quick static audit: address sanity, selector reputation, calldata patterns.
   *
   * For deeper analysis wire GhostBrain + external scanners — this is the
   * synchronous gating layer that should always run before any tx is sent.
   */
  auditTx(params: {
    to:    string;
    data?: string;
    abi?:  string[];
  }): AuditResult {
    const findings: AuditFinding[] = [];
    let risk = 0.1;

    // ── Address validation ───────────────────────────────────────────────────
    if (!isAddress(params.to)) {
      return {
        riskScore: 1,
        findings: [{ level: "high", code: "INVALID_TO", message: "Invalid recipient address" }],
        summary:  "Blocked: invalid address",
      };
    }

    if (params.to === ZeroAddress) {
      findings.push({ level: "high", code: "ZERO_ADDRESS", message: "Recipient is zero address" });
      risk = Math.max(risk, 0.95);
    }

    // ── Calldata analysis ────────────────────────────────────────────────────
    const data = params.data ?? "0x";

    if (data === "0x") {
      findings.push({ level: "info", code: "NO_CALLDATA", message: "No calldata — EOA-style transfer" });
      return { riskScore: Math.max(risk, 0.05), findings, summary: "EOA-style transfer" };
    }

    const selector = data.slice(0, 10).toLowerCase();
    const dataHash = keccak256(data);

    if (SUSPICIOUS_SELECTORS.has(selector)) {
      findings.push({
        level: "warn", code: "SUSPICIOUS_SELECTOR",
        message: `High-impact method selector: ${selector}`,
        meta:    { selector, dataHash },
      });
      risk = Math.max(risk, 0.45);
    }

    // Suspiciously large calldata
    if (data.length > 10_000) {
      findings.push({ level: "warn", code: "LARGE_CALLDATA", message: `Calldata length ${data.length} bytes exceeds threshold` });
      risk = Math.max(risk, 0.3);
    }

    // ── ABI decoding (optional) ──────────────────────────────────────────────
    if (params.abi?.length) {
      try {
        const iface  = new Interface(params.abi);
        const parsed = iface.parseTransaction({ data });
        findings.push({
          level: "info", code: "DECODED",
          message: `Decoded method: ${parsed?.name ?? "unknown"}`,
          meta:    { name: parsed?.name, args: parsed?.args?.map(String) },
        });
      } catch {
        findings.push({
          level: "warn", code: "DECODE_FAIL",
          message: "Unable to decode calldata with provided ABI",
          meta:    { selector },
        });
        risk = Math.max(risk, 0.25);
      }
    }

    return {
      riskScore: Math.min(1, risk),
      findings,
      summary:   `Audit completed. selector=${selector}`,
    };
  }
}
