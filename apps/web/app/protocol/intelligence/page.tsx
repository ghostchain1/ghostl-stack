import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import { CopyButton } from '../../../src/components/CopyButton';
import type { ApiError } from '../../../src/lib/api';
import { fetchPil, chainsResponseSchema, ingestStatusSchema, metricsSummarySchema } from '../../../src/lib/pil-client';

export default async function ProtocolIntelligencePage() {
  const [chainsRes, ingestRes, metricsRes] = await Promise.all([
    fetchPil('/v1/chains', chainsResponseSchema),
    fetchPil('/v1/ingest/status', ingestStatusSchema),
    fetchPil('/v1/metrics/summary', metricsSummarySchema)
  ]);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!chainsRes.ok) errors.push({ title: 'Chains', error: { ...chainsRes.error, endpoint: '/v1/chains', method: 'GET' } });
  if (!ingestRes.ok) errors.push({ title: 'Ingest status', error: { ...ingestRes.error, endpoint: '/v1/ingest/status', method: 'GET' } });
  if (!metricsRes.ok) errors.push({ title: 'Metrics', error: { ...metricsRes.error, endpoint: '/v1/metrics/summary', method: 'GET' } });
  const formatAddress = (value?: string) => {
    if (!value) return 'n/a';
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
  };

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        <div className="card">
          <h2>Protocol Intelligence Overview</h2>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div className="badge">Blocks: {metricsRes.ok ? metricsRes.data.totals.blocks : '0'}</div>
            <div className="badge">Txs: {metricsRes.ok ? metricsRes.data.totals.txs : '0'}</div>
            <div className="badge">Receipts: {metricsRes.ok ? metricsRes.data.totals.receipts : '0'}</div>
            <div className="badge">Traces: {metricsRes.ok ? metricsRes.data.totals.traces : '0'}</div>
            <div className="badge">Decisions: {metricsRes.ok ? metricsRes.data.totals.complianceDecisions : '0'}</div>
            <div className="badge">Attestations: {metricsRes.ok ? metricsRes.data.totals.attestations ?? '0' : '0'}</div>
          </div>
        </div>
        <div className="card">
          <h3>Chain Status</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Chain</th>
                  <th>Type</th>
                  <th>Gas Token</th>
                  <th>Gas Token Address</th>
                  <th>Last Block</th>
                  <th>Last Ingest</th>
                </tr>
              </thead>
              <tbody>
                {chainsRes.ok && chainsRes.data.chains.length > 0 ? (
                  chainsRes.data.chains.map((chain) => (
                    <tr key={chain.chainId}>
                      <td>{chain.name}</td>
                      <td>{chain.type}</td>
                      <td>{chain.gasTokenSymbol}</td>
                      <td className="mono" title={chain.gasTokenAddress || ''}>
                        <span className="row" style={{ alignItems: 'center', gap: 8 }}>
                          <span>{formatAddress(chain.gasTokenAddress)}</span>
                          {chain.gasTokenAddress && <CopyButton value={chain.gasTokenAddress} />}
                        </span>
                      </td>
                      <td className="mono">{chain.lastBlockNumber || 'n/a'}</td>
                      <td>{chain.lastIngestedAt ? new Date(chain.lastIngestedAt).toLocaleString() : 'n/a'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="muted">No chain data ingested yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>Ingest Configuration</h3>
          <div className="stack" style={{ gap: 6 }}>
            <div className="muted">Enabled: {ingestRes.ok ? String(ingestRes.data.ingestEnabled) : 'unknown'}</div>
            <div className="muted">Interval (s): {ingestRes.ok ? ingestRes.data.intervalSeconds : 'n/a'}</div>
            <div className="muted">Max blocks/tick: {ingestRes.ok ? ingestRes.data.maxBlocksPerTick : 'n/a'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
