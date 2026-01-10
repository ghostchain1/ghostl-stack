import { BlocksTable } from '../../../src/modules/explorer/components/BlocksTable';
import { TransactionsTable } from '../../../src/modules/explorer/components/TransactionsTable';
import { MempoolPanel } from '../../../src/modules/explorer/components/MempoolPanel';
import type { Block, Tx } from '@ghostl/types/explorer';
import { apiFetch } from '../../../src/lib/api';

export default async function ExplorerTxsPage() {
  const blocks = await apiFetch<{ blocks?: Block[] }>('/explorer/blocks', { fallback: { blocks: [] } });
  const txs = await apiFetch<{ txs?: Tx[] }>('/explorer/txs', { fallback: { txs: [] } });

  return (
    <div className="content">
      <div className="card-grid">
        <BlocksTable blocks={blocks.blocks || []} />
        <TransactionsTable txs={txs.txs || []} />
        <MempoolPanel />
      </div>
    </div>
  );
}
