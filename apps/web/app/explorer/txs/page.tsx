import { BlocksTable } from '../../../src/modules/explorer/components/BlocksTable';
import { TransactionsTable } from '../../../src/modules/explorer/components/TransactionsTable';
import { MempoolPanel } from '../../../src/modules/explorer/components/MempoolPanel';
import type { Block, Tx } from '@ghostl/types/explorer';
import { apiFetch } from '../../../src/lib/api';

const chains = [
  { key: 'l1', name: 'GhostL1' },
  { key: 'l2', name: 'GhostL2' },
  { key: 'l3', name: 'GhostL3' }
];

export default async function ExplorerTxsPage() {
  const data = await Promise.all(
    chains.map(async (chain) => {
      const [blocks, txs] = await Promise.all([
        apiFetch<{ blocks?: Block[] }>(`/explorer/blocks?chain=${chain.key}`, { fallback: { blocks: [] } }),
        apiFetch<{ txs?: Tx[] }>(`/explorer/txs?chain=${chain.key}`, { fallback: { txs: [] } })
      ]);
      return { chain, blocks: blocks.blocks || [], txs: txs.txs || [] };
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
            <BlocksTable blocks={entry.blocks} />
            <TransactionsTable txs={entry.txs} />
            <MempoolPanel chain={entry.chain.key} />
          </div>
        ))}
      </div>
    </div>
  );
}
