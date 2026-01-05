import { Card, Badge } from '@ghostl/ui';
import HeadFinalizedChart from '../../src/modules/chain/components/HeadFinalizedChart';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getChainStatus() {
  try {
    const res = await fetch(`${API_URL}/chain/status`, { next: { revalidate: 15 } });
    if (!res.ok) throw new Error('failed');
    return res.json();
  } catch {
    return null;
  }
}

async function getTelemetry() {
  try {
    const res = await fetch(`${API_URL}/chain/telemetry`, { next: { revalidate: 15 } });
    if (!res.ok) throw new Error('failed');
    return res.json();
  } catch {
    return null;
  }
}

type SeriesPoint = { t: number; value: number };
type PromRange = { values?: [number | string, string][] };

async function getHeadSeries() {
  const end = Date.now();
  const start = end - 10 * 60 * 1000;
  try {
    const [headRes, finalizedRes] = await Promise.all([
      fetch(`${API_URL}/observability/metrics?q=op_gate_head_block&rangeStart=${start}&rangeEnd=${end}&step=30`),
      fetch(`${API_URL}/observability/metrics?q=op_gate_finalized_block&rangeStart=${start}&rangeEnd=${end}&step=30`)
    ]);
    const headJson: { data?: { result?: PromRange[] } } | [] = headRes.ok ? await headRes.json() : [];
    const finalizedJson: { data?: { result?: PromRange[] } } | [] = finalizedRes.ok ? await finalizedRes.json() : [];
    const extractValues = (json: { data?: { result?: PromRange[] } } | []): [number | string, string][] => {
      if (Array.isArray(json)) {
        const first = (json as { values?: [number | string, string][] }[])[0];
        return first?.values || [];
      }
      const result = json?.data?.result?.[0]?.values;
      return (result as [number | string, string][]) || [];
    };
    const headValues = extractValues(headJson);
    const finalizedValues = extractValues(finalizedJson);
    const parseSeries = (values: [number | string, string][]): SeriesPoint[] =>
      values
        .map(([t, v]) => ({ t: Number(t) * 1000, value: Math.round(parseFloat(v)) }))
        .filter((v) => !Number.isNaN(v.value));
    return { head: parseSeries(headValues), finalized: parseSeries(finalizedValues) };
  } catch {
    return { head: [], finalized: [] };
  }
}

export default async function ChainPage() {
  const status = await getChainStatus();
  const telemetry = await getTelemetry();
  const series = await getHeadSeries();

  const latestHead = series.head.at(-1)?.value;
  const latestFinalized = series.finalized.at(-1)?.value;
  const lag = latestHead && latestFinalized ? latestHead - latestFinalized : status?.finalityLag;

  return (
    <div className="content">
      <div className="card-grid">
        <Card title="Chain" subtitle={status ? status.info.name : 'Unavailable'}>
          <div className="stack">
            <div className="spread">
              <span className="muted">Chain ID</span>
              <Badge>{status?.info.chainId || 'n/a'}</Badge>
            </div>
            <div className="spread">
              <span className="muted">Environment</span>
              <span>{status?.info.env || 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Consensus</span>
              <span>{status?.info.consensus || 'n/a'}</span>
            </div>
          </div>
        </Card>

        <Card title="Performance" subtitle="Block time / finality">
          <div className="stack">
            <div className="spread">
              <span className="muted">Block time</span>
              <span>{status ? `${Math.round(status.blockTimeMs)} ms` : 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Finality lag</span>
              <span>{lag !== undefined ? `${lag} blocks` : 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Epoch</span>
              <span>{status?.epoch?.epoch ?? 'n/a'}</span>
            </div>
          </div>
        </Card>

        <Card title="Head vs Finalized" subtitle="last 10m">
          <div className="stack" style={{ gap: 4 }}>
            <div className="muted">Head: {latestHead ?? 'n/a'}</div>
            <div className="muted">Finalized: {latestFinalized ?? 'n/a'}</div>
            <HeadFinalizedChart head={series.head} finalized={series.finalized} />
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              Lag derived from head - finalized (op_gate metrics)
            </div>
          </div>
        </Card>

        <Card title="Participation" subtitle="Consensus telemetry">
          <div className="stack">
            <div className="spread">
              <span className="muted">Participation rate</span>
              <span>{telemetry ? `${Math.round((telemetry.participation || 0) * 100)}%` : 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Latency p50</span>
              <span>{telemetry?.latency?.p50 ? `${telemetry.latency.p50} ms` : 'n/a'}</span>
            </div>
          </div>
        </Card>

        <Card title="Services" subtitle="Guard / Relayer / Jobs">
          <div className="stack">
            {Array.isArray(telemetry?.health?.services) && telemetry.health.services.length > 0 ? (
              telemetry.health.services.map((s: { job?: string; instance?: string; up?: boolean }) => (
                <div key={`${s.job}-${s.instance}`} className="spread">
                  <span className="muted">{s.job}</span>
                  <Badge tone={s.up ? 'success' : 'critical'}>{s.up ? 'up' : 'down'}</Badge>
                </div>
              ))
            ) : (
              <span className="muted">No data</span>
            )}
            <div className="spread">
              <span className="muted">Guard deposits</span>
              <span>{telemetry?.health?.guard?.deposits ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Guard alerts</span>
              <span>{telemetry?.health?.guard?.alerts ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Relayer finalized</span>
              <span>{telemetry?.health?.relayer?.finalized ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Relayer errors</span>
              <span>{telemetry?.health?.relayer?.errors ?? 'n/a'}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
