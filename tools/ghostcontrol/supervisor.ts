#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateInvariants,
  loadInvariantConfig,
  mergeRuntimeContainerStates,
  runtimeInspectionWarningsToViolations,
  type InvariantViolation,
} from "./guards/invariants.ts";
import { inspectRuntimeContainers } from "./guards/runtime_inspector.ts";
import { openIncidentDb, listOpenIncidents } from "./incidents/db.ts";
import { renderPrometheus, type MetricSample } from "./metrics.ts";
import {
  rankIncidentRecommendations,
  summarizeIncidentsBySeverity,
} from "./ranking-engine.ts";
import { runShellCommand } from "./deploy/docker_access.ts";

type Severity = 1 | 2 | 3 | 4;
type RiskBudget = "LOW" | "MED" | "HIGH";
type FailLevel = "critical" | "high";

interface Finding {
  detector: string;
  severity: Severity;
  service: string;
  summary: string;
  details: Record<string, unknown>;
}

interface ParsedArgs {
  dbPath: string;
  summaryOut: string;
  metricsOut: string;
  riskBudget: RiskBudget;
  failOn: FailLevel;
  noDocker: boolean;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const stackRoot = path.resolve(scriptDir, "..", "..");
const defaultDbPath = path.join(stackRoot, "tools/ghostcontrol/incident-db.sqlite");
const defaultSummaryOut = path.join(
  stackRoot,
  "tools/ghostcontrol/evidence/logs/supervisor-summary.json",
);
const defaultMetricsOut = path.join(
  stackRoot,
  "tools/ghostcontrol/evidence/logs/supervisor-metrics.prom",
);
const invariantsPath = path.join(
  stackRoot,
  "tools/ghostcontrol/guards/config/network-rules.json",
);

const usage = (): void => {
  process.stdout.write(`usage: node --experimental-strip-types tools/ghostcontrol/supervisor.ts [options]

options:
  --db-path <path>       sqlite file path (default: tools/ghostcontrol/incident-db.sqlite)
  --summary-out <path>   summary json output
  --metrics-out <path>   prometheus metrics output
  --risk <LOW|MED|HIGH>  risk budget for ranked fixes (default: MED)
  --fail-on <critical|high>
  --no-docker            skip docker runtime inspection
`);
};

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2);
  const parsed: ParsedArgs = {
    dbPath: defaultDbPath,
    summaryOut: defaultSummaryOut,
    metricsOut: defaultMetricsOut,
    riskBudget: "MED",
    failOn: "critical",
    noDocker: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--db-path" && args[i + 1]) {
      parsed.dbPath = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--summary-out" && args[i + 1]) {
      parsed.summaryOut = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--metrics-out" && args[i + 1]) {
      parsed.metricsOut = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--risk" && args[i + 1]) {
      const value = String(args[i + 1]).toUpperCase();
      if (value === "LOW" || value === "MED" || value === "HIGH") {
        parsed.riskBudget = value;
      }
      i += 1;
      continue;
    }
    if (token === "--fail-on" && args[i + 1]) {
      const value = String(args[i + 1]).toLowerCase();
      if (value === "critical" || value === "high") {
        parsed.failOn = value;
      }
      i += 1;
      continue;
    }
    if (token === "--no-docker") {
      parsed.noDocker = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      usage();
      process.exit(0);
    }
  }

  return parsed;
};

const severityFromInvariant = (value: InvariantViolation["severity"]): Severity => {
  if (value === "critical") return 4;
  if (value === "high") return 3;
  return 2;
};

const addFinding = (
  list: Finding[],
  finding: Omit<Finding, "details"> & { details?: Record<string, unknown> },
): void => {
  list.push({
    ...finding,
    details: finding.details ?? {},
  });
};

const rgFiles = (patternGlobs: string[]): string[] => {
  const command = `cd "${stackRoot}" && (rg --files --no-messages ${patternGlobs.join(" ")} || true)`;
  const run = runShellCommand(command);
  if (!run.output) return [];
  return run.output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("rg: "))
    .filter((line) => !/command not found|no such file or directory/i.test(line))
    .map((line) => path.resolve(stackRoot, line))
    .filter((resolved) => existsSync(resolved));
};

const collectComposeFiles = (): string[] =>
  rgFiles([
    "-g '*compose*.yml'",
    "-g '*compose*.yaml'",
    "--glob '!**/rollback/**'",
    "--glob '!**/node_modules/**'",
    "--glob '!infra/opstack/optimism-upstream/**'",
  ]);

const collectEnvFiles = (): string[] =>
  rgFiles([
    "-g '**/.env'",
    "--glob '!**/rollback/**'",
    "--glob '!**/node_modules/**'",
    "--glob '!infra/opstack/optimism-upstream/**'",
  ]);

const isPinnedImage = (imageRef: string): boolean =>
  imageRef.includes("@sha256:") ||
  /^\$\{.+\}$/.test(imageRef) ||
  /ghostl\/.+:local$/i.test(imageRef);

const scanUnpinnedImages = async (findings: Finding[]): Promise<void> => {
  const composeFiles = collectComposeFiles();
  const unpinned: Array<{ file: string; line: number; image: string }> = [];

  for (const composeFile of composeFiles) {
    const raw = await readFile(composeFile, "utf8");
    const lines = raw.split("\n");
    for (let idx = 0; idx < lines.length; idx += 1) {
      const line = lines[idx];
      const match = line.match(/^\s*image:\s*([^\s#]+)\s*$/);
      if (!match) continue;
      const imageRef = match[1] ?? "";
      if (isPinnedImage(imageRef)) continue;
      unpinned.push({
        file: path.relative(stackRoot, composeFile),
        line: idx + 1,
        image: imageRef,
      });
    }
  }

  if (unpinned.length === 0) return;

  addFinding(findings, {
    detector: "unpinned_images",
    severity: 3,
    service: "compose",
    summary: `Found ${unpinned.length} unpinned image references`,
    details: { samples: unpinned.slice(0, 25) },
  });
};

const looksLikePlaceholder = (value: string): boolean => {
  const lowered = value.trim().toLowerCase();
  return (
    lowered.length === 0 ||
    lowered === "change-me" ||
    lowered === "changeme" ||
    lowered === "your-value" ||
    lowered === "your-secret" ||
    lowered === "your-token" ||
    lowered === "example" ||
    lowered.startsWith("your-")
  );
};

const scanSecretLikeEnvEntries = async (findings: Finding[]): Promise<void> => {
  const envFiles = collectEnvFiles();
  const secretKey = /(PRIVATE_KEY|MNEMONIC|SEED|TOKEN|SECRET|PASSWORD|API_KEY)/i;
  const hits: Array<{ file: string; line: number; key: string }> = [];

  for (const envFile of envFiles) {
    const raw = await readFile(envFile, "utf8");
    const lines = raw.split("\n");
    for (let idx = 0; idx < lines.length; idx += 1) {
      const line = lines[idx]?.trim() ?? "";
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const key = line.slice(0, line.indexOf("=")).trim();
      const value = line.slice(line.indexOf("=") + 1).trim();
      if (!secretKey.test(key)) continue;
      if (looksLikePlaceholder(value)) continue;
      hits.push({
        file: path.relative(stackRoot, envFile),
        line: idx + 1,
        key,
      });
    }
  }

  if (hits.length === 0) return;

  addFinding(findings, {
    detector: "secrets_in_env",
    severity: 3,
    service: "env",
    summary: `Found ${hits.length} secret-like values in committed .env files`,
    details: { samples: hits.slice(0, 30) },
  });
};

const scanRoutingAndRuntime = async (
  findings: Finding[],
  noDocker: boolean,
): Promise<void> => {
  const routingGate = runShellCommand(`cd "${stackRoot}" && bash scripts/verify-routing.sh`);
  if (!routingGate.ok) {
    addFinding(findings, {
      detector: "misrouting",
      severity: 4,
      service: "routing",
      summary: "scripts/verify-routing.sh failed",
      details: { output: routingGate.output },
    });
  }

  const invariantConfig = await loadInvariantConfig(invariantsPath);
  const runtime = noDocker
    ? { containers: [], warnings: ["runtime_inspection_skipped_by_flag"] }
    : await inspectRuntimeContainers({
      serviceNames: invariantConfig.containers.map((container) => container.name),
    });

  const mergedContainers = mergeRuntimeContainerStates(
    invariantConfig.containers,
    runtime.containers,
  );
  const invariantResult = evaluateInvariants({
    ...invariantConfig,
    containers: mergedContainers,
  });

  for (const violation of invariantResult.violations) {
    addFinding(findings, {
      detector: "misrouting",
      severity: severityFromInvariant(violation.severity),
      service: "routing",
      summary: `${violation.code}: ${violation.message}`,
      details: violation.context ?? {},
    });
  }

  const runtimeWarningViolations = runtimeInspectionWarningsToViolations(runtime.warnings);
  for (const violation of runtimeWarningViolations) {
    const warning = String((violation.context ?? {}).warning ?? "");
    if (warning === "runtime_inspection_skipped_by_flag") continue;
    addFinding(findings, {
      detector: "runtime_inspection",
      severity: severityFromInvariant(violation.severity),
      service: "runtime",
      summary: `${violation.code}: ${violation.message}`,
      details: violation.context ?? {},
    });
  }

  for (const warning of runtime.warnings) {
    if (/container_not_running|inspect failed/i.test(warning)) {
      addFinding(findings, {
        detector: "unhealthy_containers",
        severity: 3,
        service: "runtime",
        summary: `Runtime warning: ${warning}`,
      });
    }
    if (/docker_socket_permission_denied|docker_daemon_unreachable/i.test(warning)) {
      addFinding(findings, {
        detector: "runtime_inspection",
        severity: 2,
        service: "runtime",
        summary: `Runtime inspection degraded: ${warning}`,
      });
    }
  }
};

const signatureForFinding = (finding: Finding): string =>
  createHash("sha256")
    .update(
      [
        finding.detector,
        finding.service,
        finding.summary,
        JSON.stringify(finding.details ?? {}),
      ].join("|"),
    )
    .digest("hex");

const persistFindings = (dbPath: string, findings: Finding[]): void => {
  const db = openIncidentDb(dbPath);
  for (const finding of findings) {
    const signature = signatureForFinding(finding);
    const existing = db
      .prepare(
        "SELECT id FROM incidents WHERE service = ? AND signature = ? AND status = 'open' LIMIT 1",
      )
      .get(finding.service, signature) as { id: number } | undefined;
    if (existing?.id) continue;

    db.prepare(
      `INSERT INTO incidents (severity, service, summary, symptoms, logs_ref, signature, status)
       VALUES (?, ?, ?, ?, ?, ?, 'open')`,
    ).run(
      finding.severity,
      finding.service,
      finding.summary,
      JSON.stringify(finding.details ?? {}),
      null,
      signature,
    );
  }
};

const buildMetricSamples = (params: {
  findings: Finding[];
  openBySeverity: Record<string, number>;
  riskScore: number;
  recommendations: number;
}): MetricSample[] => {
  const byDetector = params.findings.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.detector] = (acc[finding.detector] ?? 0) + 1;
    return acc;
  }, {});

  const samples: MetricSample[] = [];
  for (const [detector, value] of Object.entries(byDetector)) {
    samples.push({
      name: "ghostcontrol_doctor_findings_total",
      help: "Doctor findings grouped by detector",
      type: "gauge",
      value,
      labels: { detector },
    });
  }

  for (const [severity, value] of Object.entries(params.openBySeverity)) {
    samples.push({
      name: "ghostcontrol_doctor_open_incidents_total",
      help: "Open incidents grouped by severity",
      type: "gauge",
      value,
      labels: { severity },
    });
  }

  samples.push({
    name: "ghostcontrol_doctor_risk_score",
    help: "Deterministic supervisor risk score (0-100)",
    type: "gauge",
    value: params.riskScore,
  });
  samples.push({
    name: "ghostcontrol_doctor_ranked_recommendations_total",
    help: "Number of ranked patch recommendations emitted by doctor",
    type: "gauge",
    value: params.recommendations,
  });

  return samples;
};

const deterministicRiskScore = (
  findings: Finding[],
  openBySeverity: Record<string, number>,
  recommendations: number,
): number => {
  const critical = findings.filter((finding) => finding.severity >= 4).length;
  const high = findings.filter((finding) => finding.severity === 3).length;
  const medium = findings.filter((finding) => finding.severity <= 2).length;
  const openCritical = Number(openBySeverity.critical ?? 0);
  const openError = Number(openBySeverity.error ?? 0);
  const score =
    critical * 18 +
    high * 10 +
    medium * 4 +
    openCritical * 6 +
    openError * 3 +
    Math.min(12, recommendations * 2);
  return Math.max(0, Math.min(100, score));
};

const shouldFail = (findings: Finding[], failOn: FailLevel): boolean => {
  if (failOn === "high") {
    return findings.some((finding) => finding.severity >= 3);
  }
  return findings.some((finding) => finding.severity >= 4);
};

async function main(): Promise<void> {
  const args = parseArgs();
  await mkdir(path.dirname(args.summaryOut), { recursive: true });
  await mkdir(path.dirname(args.metricsOut), { recursive: true });

  const findings: Finding[] = [];
  await scanRoutingAndRuntime(findings, args.noDocker);
  await scanUnpinnedImages(findings);
  await scanSecretLikeEnvEntries(findings);

  persistFindings(args.dbPath, findings);
  const db = openIncidentDb(args.dbPath);
  const openIncidents = listOpenIncidents(db, 400);
  const openBySeverity = summarizeIncidentsBySeverity(openIncidents);
  const recommendations = rankIncidentRecommendations({
    dbPath: args.dbPath,
    riskBudget: args.riskBudget,
    limit: 8,
  });
  const riskScore = deterministicRiskScore(findings, openBySeverity, recommendations.length);

  const summary = {
    ok: !shouldFail(findings, args.failOn),
    generatedAt: new Date().toISOString(),
    dbPath: args.dbPath,
    failOn: args.failOn,
    riskBudget: args.riskBudget,
    riskScore,
    detectors: {
      misrouting: findings.some((finding) => finding.detector === "misrouting"),
      unpinnedImages: findings.some((finding) => finding.detector === "unpinned_images"),
      secretsInEnv: findings.some((finding) => finding.detector === "secrets_in_env"),
      unhealthyContainers: findings.some(
        (finding) => finding.detector === "unhealthy_containers",
      ),
    },
    findings: findings.slice(0, 120),
    openIncidents: {
      total: openIncidents.length,
      bySeverity: openBySeverity,
    },
    recommendations,
  };

  const metrics = buildMetricSamples({
    findings,
    openBySeverity,
    riskScore,
    recommendations: recommendations.length,
  });

  await writeFile(args.summaryOut, JSON.stringify(summary, null, 2), "utf8");
  await writeFile(args.metricsOut, renderPrometheus(metrics), "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        ok: summary.ok,
        summaryOut: args.summaryOut,
        metricsOut: args.metricsOut,
        riskScore,
        findings: findings.length,
        recommendations: recommendations.length,
      },
      null,
      2,
    ) + "\n",
  );

  if (!summary.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`supervisor_failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
