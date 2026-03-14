import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import { CopyButton } from '../../../src/components/CopyButton';
import type { ApiError } from '../../../src/lib/api';
import { fetchPil, chainsResponseSchema, metricsSummarySchema, validatorScoresResponseSchema } from '../../../src/lib/pil-client';

export default async function ProtocolEconomicsPage() {
  const [chainsRes, metricsRes, validatorsRes] = await Promise.all([
    fetchPil('/v1/chains', chainsResponseSchema),
    fetchPil('/v1/metrics/summary', metricsSummarySchema),
    fetchPil('/v1/validators/scores', validatorScoresResponseSchema)
  ]);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!chainsRes.ok) {
    errors.push({ title: 'Chains', error: { ...chainsRes.error, endpoint: '/v1/chains', method: 'GET' } });
  }
  if (!metricsRes.ok) {
    errors.push({ title: 'Metrics', error: { ...metricsRes.error, endpoint: '/v1/metrics/summary', method: 'GET' } });
  }
  if (!validatorsRes.ok) {
    errors.push({ title: 'Validator scores', error: { ...validatorsRes.error, endpoint: '/v1/validators/scores', method: 'GET' } });
  }
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
          <h2>Economic Signals</h2>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div className="badge">Blocks tracked: {metricsRes.ok ? metricsRes.data.totals.blocks : '0'}</div>
            <div className="badge">Transactions tracked: {metricsRes.ok ? metricsRes.data.totals.txs : '0'}</div>
          </div>
        </div>
        <div className="card">
          <h3>Gas Tokens</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Chain</th>
                  <th>Type</th>
                  <th>Gas Token</th>
                  <th>Gas Token Address</th>
                  <th>Latest Block</th>
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
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="muted">No chain data available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>Validator Compliance</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Validator</th>
                  <th>Chain</th>
                  <th>Jurisdiction</th>
                  <th>Score</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {validatorsRes.ok && validatorsRes.data.validators.length > 0 ? (
                  validatorsRes.data.validators.map((validator) => (
                    <tr key={`${validator.validatorId}-${validator.chainId}`}>
                      <td className="mono">{validator.validatorId.slice(0, 10)}…</td>
                      <td>{validator.chainId}</td>
                      <td>{validator.jurisdictionCode}</td>
                      <td>{validator.score}</td>
                      <td>{validator.reason || 'n/a'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="muted">No validator compliance scores yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
