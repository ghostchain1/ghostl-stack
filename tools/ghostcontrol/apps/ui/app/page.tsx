import { apiBaseUrl, extractNetworkErrorCode, fetchWithRetry } from "./lib/api-client";

async function getStatus() {
  const url = `${apiBaseUrl().replace(/\/+$/, "")}/status`;
  try {
    const res = await fetchWithRetry(url, { cache: "no-store" });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return (await res.json()) as any;
  } catch (error) {
    const code = extractNetworkErrorCode(error);
    return {
      ok: false,
      error: code ? `NETWORK_${code}` : "NETWORK_FETCH_FAILED",
    };
  }
}

export default async function Page() {
  const status = await getStatus();
  const lockContention = (status as any)?.lockContention as
    | {
      latest?: {
        iteration?: number;
        status?: string;
        openBefore?: number;
        mitigatedCount?: number;
        openAfter?: number;
        generatedAtUtc?: string | null;
      } | null;
      totals?: {
        samples?: number;
        runsWithOpen?: number;
        totalOpenBefore?: number;
        totalMitigated?: number;
        maxOpenBefore?: number;
      };
      recent?: Array<{
        iteration?: number;
        openBefore?: number;
        mitigatedCount?: number;
        openAfter?: number;
        generatedAtUtc?: string | null;
      }>;
    }
    | null;
  const rpcPreflight = (status as any)?.rpcPreflight as
    | {
      latest?: {
        status?: string;
        trigger?: string;
        openBefore?: number;
        mitigatedCount?: number;
        openAfter?: number;
        generatedAtUtc?: string | null;
      } | null;
      totals?: {
        samples?: number;
        runsWithOpen?: number;
        totalOpenBefore?: number;
        totalMitigated?: number;
        maxOpenBefore?: number;
      };
      recent?: Array<{
        status?: string;
        trigger?: string;
        openBefore?: number;
        mitigatedCount?: number;
        openAfter?: number;
        generatedAtUtc?: string | null;
      }>;
    }
    | null;
  const latest = lockContention?.latest ?? null;
  const totals = lockContention?.totals ?? null;
  const recent = Array.isArray(lockContention?.recent) ? lockContention?.recent.slice(0, 8) : [];
  const latestBadgeClass = latest && Number(latest.openBefore ?? 0) > 0 ? "warn" : "good";
  const latestBadgeText = latest
    ? Number(latest.openBefore ?? 0) > 0
      ? "recent-contention"
      : "stable"
    : "no-data";
  const rpcLatest = rpcPreflight?.latest ?? null;
  const rpcTotals = rpcPreflight?.totals ?? null;
  const rpcRecent = Array.isArray(rpcPreflight?.recent) ? rpcPreflight?.recent.slice(0, 8) : [];
  const rpcLatestBadgeClass = rpcLatest && Number(rpcLatest.openBefore ?? 0) > 0 ? "warn" : "good";
  const rpcLatestBadgeText = rpcLatest
    ? Number(rpcLatest.openBefore ?? 0) > 0
      ? "mitigated-open-batch"
      : "stable"
    : "no-data";

  return (
    <div className="grid">
      <div className="card">
        <h2>Lock Contention Governance</h2>
        <p className="muted">
          Auto-mitigation trend from iteration lock-contention artifacts.
        </p>
        {!lockContention ? (
          <p className="muted">Lock-contention metrics unavailable.</p>
        ) : (
          <>
            <p style={{ marginTop: 8 }}>
              <span className={`badge ${latestBadgeClass}`}>{latestBadgeText}</span>
            </p>
            <table>
              <tbody>
                <tr>
                  <th>Latest Iteration</th>
                  <td>{latest?.iteration ?? "n/a"}</td>
                </tr>
                <tr>
                  <th>Latest Open Before</th>
                  <td>{latest?.openBefore ?? "n/a"}</td>
                </tr>
                <tr>
                  <th>Latest Mitigated</th>
                  <td>{latest?.mitigatedCount ?? "n/a"}</td>
                </tr>
                <tr>
                  <th>Samples</th>
                  <td>{totals?.samples ?? "n/a"}</td>
                </tr>
                <tr>
                  <th>Runs With Open</th>
                  <td>{totals?.runsWithOpen ?? "n/a"}</td>
                </tr>
                <tr>
                  <th>Total Mitigated</th>
                  <td>{totals?.totalMitigated ?? "n/a"}</td>
                </tr>
                <tr>
                  <th>Max Open Before</th>
                  <td>{totals?.maxOpenBefore ?? "n/a"}</td>
                </tr>
              </tbody>
            </table>
            {recent.length > 0 ? (
              <>
                <p className="muted" style={{ marginTop: 12 }}>
                  Recent iterations:
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Iteration</th>
                      <th>Open Before</th>
                      <th>Mitigated</th>
                      <th>Open After</th>
                      <th>Generated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((row) => (
                      <tr key={`${row.iteration ?? "na"}-${row.generatedAtUtc ?? "na"}`}>
                        <td>{row.iteration ?? "n/a"}</td>
                        <td>{row.openBefore ?? "n/a"}</td>
                        <td>{row.mitigatedCount ?? "n/a"}</td>
                        <td>{row.openAfter ?? "n/a"}</td>
                        <td className="muted">{row.generatedAtUtc ?? "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
          </>
        )}
      </div>
      <div className="card">
        <h2>RPC Preflight Governance</h2>
        <p className="muted">
          Auto-mitigation trend from RPC preflight recovery artifacts.
        </p>
        {!rpcPreflight ? (
          <p className="muted">RPC-preflight mitigation metrics unavailable.</p>
        ) : (
          <>
            <p style={{ marginTop: 8 }}>
              <span className={`badge ${rpcLatestBadgeClass}`}>{rpcLatestBadgeText}</span>
            </p>
            <table>
              <tbody>
                <tr>
                  <th>Latest Trigger</th>
                  <td>{rpcLatest?.trigger ?? "n/a"}</td>
                </tr>
                <tr>
                  <th>Latest Open Before</th>
                  <td>{rpcLatest?.openBefore ?? "n/a"}</td>
                </tr>
                <tr>
                  <th>Latest Mitigated</th>
                  <td>{rpcLatest?.mitigatedCount ?? "n/a"}</td>
                </tr>
                <tr>
                  <th>Samples</th>
                  <td>{rpcTotals?.samples ?? "n/a"}</td>
                </tr>
                <tr>
                  <th>Runs With Open</th>
                  <td>{rpcTotals?.runsWithOpen ?? "n/a"}</td>
                </tr>
                <tr>
                  <th>Total Mitigated</th>
                  <td>{rpcTotals?.totalMitigated ?? "n/a"}</td>
                </tr>
                <tr>
                  <th>Max Open Before</th>
                  <td>{rpcTotals?.maxOpenBefore ?? "n/a"}</td>
                </tr>
              </tbody>
            </table>
            {rpcRecent.length > 0 ? (
              <>
                <p className="muted" style={{ marginTop: 12 }}>
                  Recent mitigation runs:
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Trigger</th>
                      <th>Open Before</th>
                      <th>Mitigated</th>
                      <th>Open After</th>
                      <th>Generated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rpcRecent.map((row) => (
                      <tr key={`${row.trigger ?? "na"}-${row.generatedAtUtc ?? "na"}`}>
                        <td>{row.trigger ?? "n/a"}</td>
                        <td>{row.openBefore ?? "n/a"}</td>
                        <td>{row.mitigatedCount ?? "n/a"}</td>
                        <td>{row.openAfter ?? "n/a"}</td>
                        <td className="muted">{row.generatedAtUtc ?? "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
          </>
        )}
      </div>
      <div className="card">
        <h2>GhostControl Status</h2>
        <p className="muted">
          Control plane snapshot. Use Incidents/Actions to drive heal loops.
        </p>
        <pre style={{ margin: 0, overflowX: "auto" }}>
          <code>{JSON.stringify(status, null, 2)}</code>
        </pre>
      </div>
    </div>
  );
}
