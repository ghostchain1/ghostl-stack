'use client';

import dynamic from 'next/dynamic';

const NodeHeatMap = dynamic(
  () => import('../../../src/modules/network/components/NodeHeatMap'),
  { ssr: false, loading: () => <div style={{ color: '#6b7280', padding: 24 }}>Loading heatmap…</div> },
);

export default function NodeHeatmapClient() {
  return (
    <div className="h-[calc(100vh-4rem)]">
      <NodeHeatMap />
    </div>
  );
}
