import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const RPC_PREFLIGHT_MITIGATION_FILE_PATTERN =
  /^(?:event-cycle|manual)-rpc-preflight-mitigation-(.+)\.json$/;

export interface RpcPreflightMitigationSnapshot {
  status: string;
  trigger: string;
  openBefore: number;
  mitigatedCount: number;
  openAfter: number;
  generatedAtUtc: string | null;
  uri: string;
}

export interface RpcPreflightMitigationSummary {
  logDir: string;
  latest: RpcPreflightMitigationSnapshot | null;
  recent: RpcPreflightMitigationSnapshot[];
  totals: {
    samples: number;
    runsWithOpen: number;
    totalOpenBefore: number;
    totalMitigated: number;
    maxOpenBefore: number;
    lastGeneratedAtUtc: string | null;
  };
}

interface ParsedRpcPreflightMitigationSnapshot extends RpcPreflightMitigationSnapshot {
  generatedAtMs: number | null;
}

function toFiniteNonNegativeInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

function parseGeneratedAtMs(generatedAtUtc: string | null): number | null {
  if (!generatedAtUtc) return null;
  const parsed = Date.parse(generatedAtUtc);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function compareSnapshots(
  a: ParsedRpcPreflightMitigationSnapshot,
  b: ParsedRpcPreflightMitigationSnapshot,
): number {
  if (a.generatedAtMs != null && b.generatedAtMs != null && a.generatedAtMs !== b.generatedAtMs) {
    return b.generatedAtMs - a.generatedAtMs;
  }
  if (a.generatedAtMs != null && b.generatedAtMs == null) return -1;
  if (a.generatedAtMs == null && b.generatedAtMs != null) return 1;
  return b.uri.localeCompare(a.uri);
}

function emptySummary(logDir: string): RpcPreflightMitigationSummary {
  return {
    logDir,
    latest: null,
    recent: [],
    totals: {
      samples: 0,
      runsWithOpen: 0,
      totalOpenBefore: 0,
      totalMitigated: 0,
      maxOpenBefore: 0,
      lastGeneratedAtUtc: null,
    },
  };
}

export async function readRpcPreflightMitigationSummary(params: {
  logDir: string;
  limit?: number;
}): Promise<RpcPreflightMitigationSummary> {
  const logDir = params.logDir;
  const limit = Math.max(1, Math.min(200, params.limit ?? 20));

  let entries: string[];
  try {
    entries = await readdir(logDir);
  } catch {
    return emptySummary(logDir);
  }

  const candidates = entries.filter((fileName) => RPC_PREFLIGHT_MITIGATION_FILE_PATTERN.test(fileName));

  const snapshots: ParsedRpcPreflightMitigationSnapshot[] = [];
  for (const fileName of candidates) {
    const uri = path.join(logDir, fileName);
    try {
      const parsed = JSON.parse(await readFile(uri, "utf8")) as Record<string, unknown>;
      const generatedAtUtc = typeof parsed.generatedAtUtc === "string" ? parsed.generatedAtUtc : null;
      snapshots.push({
        status: typeof parsed.status === "string" ? parsed.status : "unknown",
        trigger: typeof parsed.trigger === "string" ? parsed.trigger : "unknown",
        openBefore: toFiniteNonNegativeInt(parsed.openBefore),
        mitigatedCount: toFiniteNonNegativeInt(parsed.mitigatedCount),
        openAfter: toFiniteNonNegativeInt(parsed.openAfter),
        generatedAtUtc,
        generatedAtMs: parseGeneratedAtMs(generatedAtUtc),
        uri,
      });
    } catch {
      continue;
    }
  }

  snapshots.sort(compareSnapshots);

  const recent = snapshots.slice(0, limit).map<RpcPreflightMitigationSnapshot>((snapshot) => ({
    status: snapshot.status,
    trigger: snapshot.trigger,
    openBefore: snapshot.openBefore,
    mitigatedCount: snapshot.mitigatedCount,
    openAfter: snapshot.openAfter,
    generatedAtUtc: snapshot.generatedAtUtc,
    uri: snapshot.uri,
  }));

  let totalOpenBefore = 0;
  let totalMitigated = 0;
  let runsWithOpen = 0;
  let maxOpenBefore = 0;
  for (const item of recent) {
    totalOpenBefore += item.openBefore;
    totalMitigated += item.mitigatedCount;
    if (item.openBefore > 0) runsWithOpen += 1;
    if (item.openBefore > maxOpenBefore) maxOpenBefore = item.openBefore;
  }

  const latest = recent[0] ?? null;
  return {
    logDir,
    latest,
    recent,
    totals: {
      samples: recent.length,
      runsWithOpen,
      totalOpenBefore,
      totalMitigated,
      maxOpenBefore,
      lastGeneratedAtUtc: latest?.generatedAtUtc ?? null,
    },
  };
}
