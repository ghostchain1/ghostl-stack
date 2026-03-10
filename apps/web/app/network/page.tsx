import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = {
  title: 'Network Topology — GhostStack',
  description: 'Live 3D topology of GhostChain L1, GhostL2, GhostL3, validators and bridges',
};

// Dynamic import prevents SSR of the animation-heavy canvas component
const NetworkTopology3D = dynamic(
  () => import('../../src/modules/network/components/NetworkTopology3D'),
  { ssr: false, loading: () => <div style={{ color: '#6b7280', padding: 24 }}>Loading topology…</div> },
);

export default function NetworkPage() {
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <NetworkTopology3D />
    </div>
  );
}
