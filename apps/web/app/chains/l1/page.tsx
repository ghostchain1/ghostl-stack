import { ChainLayerDashboard } from '../../../src/modules/chain/components/ChainLayerDashboard';

export const metadata = { title: 'GhostChain L1 — GhostStack' };

export default function L1Page() {
  return <ChainLayerDashboard layer="l1" />;
}
