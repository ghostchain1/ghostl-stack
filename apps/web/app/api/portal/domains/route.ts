import { resolve4, resolve6, resolveNs } from "node:dns/promises";
import { GHOST_DNS_ZONES, GHOST_SERVICES } from "@ghostchain/config";
import { type NextRequest, NextResponse } from "next/server";

type DomainZone = {
  domain: string;
  status: "healthy" | "degraded" | "offline";
  recordCount?: number;
  lastChecked?: string;
  ttl?: number;
  gnsEnabled?: boolean;
};

type GhostDnsRecord = {
  domain: string;
  ttl: number;
  updatedAt: string;
};

type GhostDnsResponse = {
  records?: GhostDnsRecord[];
};

const DNS_URL =
  process.env.GHOST_DNS_INTERNAL_URL ||
  process.env.GHOST_DNS_URL ||
  GHOST_SERVICES.dnsIndexer.internalUrl ||
  GHOST_SERVICES.dnsIndexer.localUrl;

const FALLBACK_ZONES: DomainZone[] = GHOST_DNS_ZONES.map((zone) => ({
  domain: zone.domain,
  status: zone.status as DomainZone["status"],
  gnsEnabled: zone.gnsEnabled,
  recordCount: zone.recordCount,
  ttl: zone.ttl,
}));

const PROBE_CACHE_TTL_MS = 60_000;

let cachedProbeAt = 0;
let cachedProbeZones: DomainZone[] | null = null;

const toZoneMap = () =>
  new Map(
    FALLBACK_ZONES.map((zone) => [
      zone.domain,
      {
        ...zone,
      },
    ])
  );

async function probePublicZone(zone: DomainZone): Promise<DomainZone> {
  const [ipv4, ipv6, nameservers] = await Promise.all([
    resolve4(zone.domain).catch(() => [] as string[]),
    resolve6(zone.domain).catch(() => [] as string[]),
    resolveNs(zone.domain).catch(() => [] as string[]),
  ]);

  let httpStatus: number | null = null;
  try {
    const res = await fetch(`https://${zone.domain}`, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    httpStatus = res.status;
  } catch {
    httpStatus = null;
  }

  const addressCount = ipv4.length + ipv6.length;
  const nameserverCount = nameservers.length;
  const inferredRecordCount = Math.max(Number(zone.recordCount || 0), addressCount + nameserverCount);

  let status: DomainZone["status"] = "offline";
  if (addressCount > 0 || nameserverCount > 0) {
    status = "degraded";
  }
  if (httpStatus !== null && httpStatus < 500) {
    status = "healthy";
  } else if (httpStatus !== null && httpStatus >= 500 && (addressCount > 0 || nameserverCount > 0)) {
    status = "degraded";
  }

  return {
    ...zone,
    status,
    recordCount: inferredRecordCount,
    lastChecked: new Date().toISOString(),
  };
}

async function getPublicProbeZones(): Promise<DomainZone[]> {
  const now = Date.now();
  if (cachedProbeZones && now - cachedProbeAt < PROBE_CACHE_TTL_MS) {
    return cachedProbeZones;
  }

  const zones = await Promise.all(FALLBACK_ZONES.map((zone) => probePublicZone(zone)));
  cachedProbeZones = zones.sort((left, right) => left.domain.localeCompare(right.domain));
  cachedProbeAt = now;
  return cachedProbeZones;
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const res = await fetch(`${DNS_URL}/v1/records`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return NextResponse.json({ zones: await getPublicProbeZones() }, { status: 200 });
    }

    const data = (await res.json()) as GhostDnsResponse;
    const zones = toZoneMap();

    for (const record of data.records || []) {
      const domain = String(record.domain || "").trim().toLowerCase();
      if (!domain) continue;
      const current =
        zones.get(domain) || {
          domain,
          status: "healthy" as const,
          gnsEnabled: domain.endsWith(".ghost") || domain.endsWith(".ghostchain"),
          recordCount: 0,
          ttl: 300,
        };
      zones.set(domain, {
        ...current,
        status: "healthy",
        recordCount: Number(current.recordCount || 0) + 1,
        ttl: Number(record.ttl || current.ttl || 300),
        lastChecked: record.updatedAt || current.lastChecked,
      });
    }

    return NextResponse.json(
      {
        zones: Array.from(zones.values()).sort((left, right) => left.domain.localeCompare(right.domain)),
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ zones: await getPublicProbeZones() }, { status: 200 });
  }
}
