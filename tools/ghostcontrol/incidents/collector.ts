import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { openIncidentDb } from "./db.ts";

export type IncidentSeverity = "info" | "warn" | "error" | "critical";

export interface IncidentSignal {
  service: string;
  severity: IncidentSeverity;
  summary: string;
  symptoms: string[];
  logsRef?: string;
}

export interface CollectorResult {
  inserted: number;
  deduped: number;
  touchedIncidentIds: number[];
}

function severityToNumber(severity: IncidentSeverity): number {
  if (severity === "critical") return 4;
  if (severity === "error") return 3;
  if (severity === "warn") return 2;
  return 1;
}

export function signatureForSignal(signal: IncidentSignal): string {
  const normalizedSymptoms = [...signal.symptoms].map((v) => v.trim()).sort();
  const payload = JSON.stringify({
    service: signal.service.trim().toLowerCase(),
    summary: signal.summary.trim().toLowerCase(),
    symptoms: normalizedSymptoms,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function parseLogLine(line: string, logsRef?: string): IncidentSignal | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const bracketPattern =
    /^\[(?<service>[^\]]+)\]\s+(?<severity>INFO|WARN|ERROR|CRITICAL)\s+(?<summary>.+)$/i;
  const bracketMatch = trimmed.match(bracketPattern);
  if (bracketMatch?.groups) {
    return {
      service: bracketMatch.groups.service.toLowerCase(),
      severity: bracketMatch.groups.severity.toLowerCase() as IncidentSeverity,
      summary: bracketMatch.groups.summary,
      symptoms: [trimmed],
      logsRef,
    };
  }

  const colonPattern =
    /^(?<service>[a-zA-Z0-9._-]+):\s*(?<severity>info|warn|error|critical)\s*-\s*(?<summary>.+)$/i;
  const colonMatch = trimmed.match(colonPattern);
  if (colonMatch?.groups) {
    return {
      service: colonMatch.groups.service.toLowerCase(),
      severity: colonMatch.groups.severity.toLowerCase() as IncidentSeverity,
      summary: colonMatch.groups.summary,
      symptoms: [trimmed],
      logsRef,
    };
  }

  return null;
}

export async function parseSignalsFromLogFiles(logFiles: string[]): Promise<IncidentSignal[]> {
  const signals: IncidentSignal[] = [];
  for (const file of logFiles) {
    let contents = "";
    try {
      contents = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const line of contents.split(/\r?\n/)) {
      const parsed = parseLogLine(line, file);
      if (parsed) signals.push(parsed);
    }
  }
  return signals;
}

export function collectIncidents(params: {
  dbPath?: string;
  signals: IncidentSignal[];
}): CollectorResult {
  const db = openIncidentDb(params.dbPath);
  try {
    const findExisting = db.prepare(
      `
        SELECT id
        FROM incidents
        WHERE service = ?
          AND signature = ?
          AND status = 'open'
        ORDER BY created_at DESC
        LIMIT 1
      `,
    );
    const insertIncident = db.prepare(
      `
        INSERT INTO incidents (severity, service, summary, symptoms, logs_ref, signature, status)
        VALUES (?, ?, ?, ?, ?, ?, 'open')
      `,
    );

    let inserted = 0;
    let deduped = 0;
    const touchedIncidentIds: number[] = [];

    for (const signal of params.signals) {
      const signature = signatureForSignal(signal);
      const existing = findExisting.get(signal.service, signature) as
        | { id: number }
        | undefined;
      if (existing) {
        deduped += 1;
        touchedIncidentIds.push(existing.id);
        continue;
      }

      const result = insertIncident.run(
        severityToNumber(signal.severity),
        signal.service,
        signal.summary,
        JSON.stringify(signal.symptoms),
        signal.logsRef ?? null,
        signature,
      );
      inserted += 1;
      touchedIncidentIds.push(Number(result.lastInsertRowid));
    }

    return { inserted, deduped, touchedIncidentIds };
  } finally {
    db.close();
  }
}

export async function collectFromLogFiles(params: {
  dbPath?: string;
  logFiles: string[];
}): Promise<CollectorResult> {
  const signals = await parseSignalsFromLogFiles(params.logFiles);
  return collectIncidents({ dbPath: params.dbPath, signals });
}

function parseCliArgs(argv: string[]): { dbPath?: string; logFiles: string[] } {
  const logFiles: string[] = [];
  let dbPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--db" && argv[i + 1]) {
      dbPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--log" && argv[i + 1]) {
      logFiles.push(argv[i + 1]);
      i += 1;
    }
  }

  return { dbPath, logFiles };
}

async function cliMain() {
  const args = parseCliArgs(process.argv.slice(2));
  const result = await collectFromLogFiles({
    dbPath: args.dbPath,
    logFiles: args.logFiles,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  cliMain().catch((error) => {
    process.stderr.write(`collector_failed: ${String(error)}\n`);
    process.exit(1);
  });
}
