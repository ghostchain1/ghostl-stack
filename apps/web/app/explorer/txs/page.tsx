import { BlocksTable } from '../../../src/modules/explorer/components/BlocksTable';
import { TransactionsTable } from '../../../src/modules/explorer/components/TransactionsTable';
import { MempoolPanel } from '../../../src/modules/explorer/components/MempoolPanel';
import { ExplorerSummarySchema, type ExplorerSummary } from '@ghostl/contract-schemas';
import type { Block, Tx } from '@ghostl/types/explorer';
import type { ApiError } from '../../../src/lib/api';
import { serverApiRequest } from '../../../src/lib/server-api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';

const chains = [
  { key: 'l1', name: 'GhostL1' },
  { key: 'l2', name: 'GhostL2' },
  { key: 'l3', name: 'GhostL3' }
];

export default async function ExplorerTxsPage() {
  const data = await Promise.all(
    chains.map(async (chain) => {
      const summaryRes = await serverApiRequest<ExplorerSummary>(`/explorer?chain=${chain.key}&blockLimit=10&txLimit=12`, {
        init: { cache: 'no-store' },
        schema: ExplorerSummarySchema
      });
      const errors: Array<{ title: string; error: ApiError }> = [];
      if (!summaryRes.ok) errors.push({ title: `${chain.name} explorer`, error: summaryRes.error });
      return {
        chain,
        blocks: summaryRes.ok ? (summaryRes.data.blocks as Block[]) : [],
        txs: summaryRes.ok ? (summaryRes.data.txs as Tx[]) : [],
        mempool: summaryRes.ok ? summaryRes.data.mempool : null,
        errors
      };
    })
  );

  return (
    <div className="content">
      <div className="card-grid">
        {data.map((entry) => (
          <div key={entry.chain.key} className="stack" style={{ gap: 12 }}>
            <div className="card">
              <div style={{ fontWeight: 800 }}>{entry.chain.name}</div>
              <div className="muted">Chain {entry.chain.key.toUpperCase()}</div>
            </div>
            {entry.errors.map((err, idx) => (
              <DataFetchErrorCard key={`${entry.chain.key}-${idx}`} title={err.title} error={err.error} />
            ))}
            {!entry.errors.length && <BlocksTable blocks={entry.blocks} />}
            {!entry.errors.length && <TransactionsTable txs={entry.txs} />}
            <MempoolPanel chain={entry.chain.key} mempool={entry.mempool || undefined} />
          </div>
        ))}
      </div>
    </div>
  );
}
