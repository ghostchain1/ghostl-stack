import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = {
  title: 'Node Heatmap — GhostStack',
  description: 'Global validator CPU/memory load heatmap across all GhostChain nodes',
};

const NodeHeatMap = dynamic(
  () => import('../../../src/modules/network/components/NodeHeatMap'),
  { ssr: false, loading: () => <div style={{ color: '#6b7280', padding: 24 }}>Loading heatmap…</div> },
);

export default function NodeHeatmapPage() {
  return (
    <div className="h-[calc(100vh-4rem)]">
      <NodeHeatMap />
    </div>
  );
}
