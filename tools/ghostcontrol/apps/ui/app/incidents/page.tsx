import { apiBaseUrl, fetchWithRetry } from "../lib/api-client";

type StatusFilter = "all" | "open" | "mitigated" | "closed";
type SignalFilter = "all" | "lock-contention" | "rpc-preflight" | "disk-pressure";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

async function getIncidents() {
  const url = `${apiBaseUrl().replace(/\/+$/, "")}/incidents`;
  try {
    const res = await fetchWithRetry(url, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as Array<any>;
  } catch {
    return [];
  }
}

async function getEventCycleIncidents() {
  const url = `${apiBaseUrl().replace(/\/+$/, "")}/governance/event-cycle-incidents`;
  try {
    const res = await fetchWithRetry(url, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as any;
    return body?.eventCycleIncidents ?? null;
  } catch {
    return null;
  }
}

function severityClass(sev: string): string {
  if (sev === "critical" || sev === "error") return "bad";
  if (sev === "warn") return "warn";
  return "good";
}

function incidentStatusClass(status: string | null | undefined): string {
  if (status === "open") return "bad";
  if (status === "mitigated") return "warn";
  if (status === "closed") return "good";
  return "";
}

function firstSearchParamValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function statusFilterFromParam(value: string | undefined): StatusFilter {
  if (value === "open" || value === "mitigated" || value === "closed") return value;
  return "all";
}

function signalFilterFromParam(value: string | undefined): SignalFilter {
  if (value === "lock-contention" || value === "rpc-preflight" || value === "disk-pressure") {
    return value;
  }
  return "all";
}

function signalKeyForSummary(summary: string): SignalFilter {
  if (summary.includes("lock contention")) return "lock-contention";
  if (summary.includes("rpc preflight")) return "rpc-preflight";
  if (summary.includes("disk pressure")) return "disk-pressure";
  return "all";
}

function signalLabel(key: SignalFilter): string {
  if (key === "lock-contention") return "Lock Contention";
  if (key === "rpc-preflight") return "RPC Preflight";
  if (key === "disk-pressure") return "Disk Pressure";
  return "Unknown";
}

function buildFilterHref(status: StatusFilter, signal: SignalFilter): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (signal !== "all") params.set("signal", signal);
  const query = params.toString();
  return query ? `/incidents?${query}` : "/incidents";
}

const STATUS_FILTER_OPTIONS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All statuses" },
  { key: "open", label: "Open" },
  { key: "mitigated", label: "Mitigated" },
  { key: "closed", label: "Closed" },
];

const SIGNAL_FILTER_OPTIONS: ReadonlyArray<{ key: SignalFilter; label: string }> = [
  { key: "all", label: "All signals" },
  { key: "lock-contention", label: "Lock Contention" },
  { key: "rpc-preflight", label: "RPC Preflight" },
  { key: "disk-pressure", label: "Disk Pressure" },
];

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsRecord> | SearchParamsRecord;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const statusFilter = statusFilterFromParam(firstSearchParamValue(resolvedSearchParams.status));
  const signalFilter = signalFilterFromParam(firstSearchParamValue(resolvedSearchParams.signal));
  const [incidents, eventCycleIncidents] = await Promise.all([
    getIncidents(),
    getEventCycleIncidents(),
  ]);
  const eventCycleRecent = Array.isArray(eventCycleIncidents?.recent) ? eventCycleIncidents.recent : [];
  const filteredGovernanceRecent = eventCycleRecent
    .filter((item: any) => {
      const itemStatus = typeof item?.status === "string" ? item.status : "";
      const itemSummary = typeof item?.summary === "string" ? item.summary : "";
      const statusMatches = statusFilter === "all" || itemStatus === statusFilter;
      const signalMatches = signalFilter === "all" || signalKeyForSummary(itemSummary) === signalFilter;
      return statusMatches && signalMatches;
    })
    .slice(0, 10);
  const trackedRows = [
    {
      key: "lock-contention",
      name: "Lock Contention",
      bucket: eventCycleIncidents?.lockContention ?? null,
    },
    {
      key: "rpc-preflight",
      name: "RPC Preflight",
      bucket: eventCycleIncidents?.rpcPreflight ?? null,
    },
    {
      key: "disk-pressure",
      name: "Disk Pressure",
      bucket: eventCycleIncidents?.diskPressure ?? null,
    },
  ];
  const openIncidentCount = Number(
    eventCycleIncidents?.alert?.openIncidentCount ?? eventCycleIncidents?.totals?.open ?? 0,
  );
  const openWarnThreshold = Number(eventCycleIncidents?.alert?.openIncidentThreshold ?? 1);
  const alertState = eventCycleIncidents?.alert?.state === "warning" ? "warning" : "ok";
  const alertBadgeClass = alertState === "warning" ? "bad" : "good";
  const alertBadgeText = alertState === "warning" ? "threshold-breached" : "threshold-ok";
  const postureBadgeClass = openIncidentCount > 0 ? "bad" : "good";
  const postureBadgeText = openIncidentCount > 0
    ? "open-incidents"
    : "stable";

  return (
    <div className="grid">
      <div className="card">
        <h2>Event-Cycle Governance Posture</h2>
        <p className="muted">
          Governance-critical incidents tracked in the local event-cycle ledger.
        </p>
        {!eventCycleIncidents?.available ? (
          <p className="muted">Event-cycle incident ledger unavailable from API.</p>
        ) : (
          <>
            <p style={{ marginTop: 8 }}>
              <span className={`badge ${postureBadgeClass}`}>{postureBadgeText}</span>
            </p>
            <table>
              <tbody>
                <tr>
                  <th>Open</th>
                  <td>{eventCycleIncidents?.totals?.open ?? 0}</td>
                </tr>
                <tr>
                  <th>Open Threshold</th>
                  <td>{openWarnThreshold}</td>
                </tr>
                <tr>
                  <th>Alert State</th>
                  <td>
                    <span className={`badge ${alertBadgeClass}`}>{alertBadgeText}</span>
                  </td>
                </tr>
                <tr>
                  <th>Mitigated</th>
                  <td>{eventCycleIncidents?.totals?.mitigated ?? 0}</td>
                </tr>
                <tr>
                  <th>Closed</th>
                  <td>{eventCycleIncidents?.totals?.closed ?? 0}</td>
                </tr>
                <tr>
                  <th>Total</th>
                  <td>{eventCycleIncidents?.totals?.total ?? 0}</td>
                </tr>
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: 12 }}>
              Status filter:
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {STATUS_FILTER_OPTIONS.map((option) => (
                <a
                  key={`status-${option.key}`}
                  className={`pill ${statusFilter === option.key ? "active" : ""}`}
                  href={buildFilterHref(option.key, signalFilter)}
                >
                  {option.label}
                </a>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 12 }}>
              Signal filter:
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {SIGNAL_FILTER_OPTIONS.map((option) => (
                <a
                  key={`signal-${option.key}`}
                  className={`pill ${signalFilter === option.key ? "active" : ""}`}
                  href={buildFilterHref(statusFilter, option.key)}
                >
                  {option.label}
                </a>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 12 }}>
              Tracked governance summaries:
            </p>
            <table>
              <thead>
                <tr>
                  <th>Signal</th>
                  <th>Open</th>
                  <th>Mitigated</th>
                  <th>Closed</th>
                  <th>Latest</th>
                  <th>Generated</th>
                </tr>
              </thead>
              <tbody>
                {trackedRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.name}</td>
                    <td>{row.bucket?.open ?? 0}</td>
                    <td>{row.bucket?.mitigated ?? 0}</td>
                    <td>{row.bucket?.closed ?? 0}</td>
                    <td>
                      <span className={`badge ${incidentStatusClass(row.bucket?.latestStatus)}`}>
                        {row.bucket?.latestStatus ?? "n/a"}
                      </span>
                    </td>
                    <td className="muted">{row.bucket?.latestCreatedAtUtc ?? "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredGovernanceRecent.length > 0 ? (
              <>
                <p className="muted" style={{ marginTop: 12 }}>
                  Recent governance incidents:
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Severity</th>
                      <th>Signal</th>
                      <th>Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGovernanceRecent.map((item: any) => (
                      <tr key={`${item.id}-${item.createdAtUtc}`}>
                        <td className="muted">{item.createdAtUtc ?? "n/a"}</td>
                        <td>
                          <span className={`badge ${incidentStatusClass(item.status)}`}>
                            {item.status ?? "n/a"}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${severityClass(item.severityLabel)}`}>
                            {item.severityLabel ?? "n/a"}
                          </span>
                        </td>
                        <td>{signalLabel(signalKeyForSummary(item.summary ?? ""))}</td>
                        <td>{item.summary ?? "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="muted" style={{ marginTop: 12 }}>
                No governance incidents match current filters.
              </p>
            )}
          </>
        )}
      </div>
      <div className="card">
        <h2>Incidents</h2>
        <p className="muted">Latest 100 incidents from the audit DB.</p>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Severity</th>
              <th>Source</th>
              <th>Message</th>
              <th>Signature</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id}>
                <td className="muted">{i.createdAt}</td>
                <td>
                  <span className={`badge ${severityClass(i.severity)}`}>
                    {i.severity}
                  </span>
                </td>
                <td>
                  <code>{i.source}</code>
                </td>
                <td>{i.message}</td>
                <td>
                  <code>{i.signature}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
