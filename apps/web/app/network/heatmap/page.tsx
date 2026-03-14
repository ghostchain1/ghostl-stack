import type { Metadata } from 'next';
import NodeHeatmapClient from './NodeHeatmapClient';

export const metadata: Metadata = {
  title: 'Node Heatmap — GhostStack',
  description: 'Global validator CPU/memory load heatmap across all GhostChain nodes',
};

export default function NodeHeatmapPage() {
  return <NodeHeatmapClient />;
}
