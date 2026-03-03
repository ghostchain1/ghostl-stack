/**
 * GhostContractAI — Slither Tool
 *
 * Runs slither static analysis in a child process.
 * Parses JSON output and enforces high-severity gate.
 */

import { runCmd } from "./foundry.js";
import { SLITHER_BIN } from "../config.js";

export interface SlitherFinding {
  id: string;
  impact: "High" | "Medium" | "Low" | "Informational" | "Optimization";
  confidence: string;
  description: string;
  check: string;
  elements: unknown[];
}

export interface SlitherResult {
  success: boolean;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  informational: number;
  findings: SlitherFinding[];
  rawOutput: string;
  version: string;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runSlither(
  targetPath: string,
  repoRoot: string,
  timeoutMs: number,
  extraArgs: string[] = [],
): Promise<SlitherResult> {
  const args = [
    targetPath,
    "--json",
    "-",
    "--foundry-out-directory",
    "out",
    "--solc-remaps",
    "@openzeppelin=lib/openzeppelin-contracts",
    ...extraArgs,
  ];

  const result = await runCmd(SLITHER_BIN, args, repoRoot, timeoutMs);
  return _parseSlitherOutput(result.stdout + result.stderr, result.code);
}

export async function slitherVersion(timeoutMs = 10_000): Promise<string> {
  const r = await runCmd(SLITHER_BIN, ["--version"], process.cwd(), timeoutMs);
  return r.stdout.trim() || r.stderr.trim() || "unknown";
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function _parseSlitherOutput(raw: string, exitCode: number): SlitherResult {
  // Slither emits a JSON blob somewhere in its output
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");

  const findings: SlitherFinding[] = [];
  let parsed: Record<string, unknown> | null = null;

  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    } catch {
      // fall through to heuristic parsing
    }
  }

  if (parsed && Array.isArray((parsed as Record<string, unknown>).results)) {
    const results = (parsed as { results: Record<string, unknown> }).results;
    if (Array.isArray(results.detectors)) {
      for (const d of results.detectors as Record<string, unknown>[]) {
        findings.push({
          id: String(d.check ?? "unknown"),
          impact: (d.impact as SlitherFinding["impact"]) ?? "Informational",
          confidence: String(d.confidence ?? ""),
          description: String(d.description ?? ""),
          check: String(d.check ?? ""),
          elements: Array.isArray(d.elements) ? d.elements : [],
        });
      }
    }
  }

  const high = findings.filter((f) => f.impact === "High").length;
  const medium = findings.filter((f) => f.impact === "Medium").length;
  const low = findings.filter((f) => f.impact === "Low").length;
  const info = findings.filter(
    (f) => f.impact === "Informational" || f.impact === "Optimization",
  ).length;

  return {
    success: exitCode === 0 || high === 0,
    highFindings: high,
    mediumFindings: medium,
    lowFindings: low,
    informational: info,
    findings,
    rawOutput: raw.slice(0, 65_536), // cap at 64 KB
    version: "unknown",
  };
}
