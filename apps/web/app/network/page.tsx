import type { Metadata } from 'next';
import NetworkTopology3DClient from './NetworkTopology3DClient';

export const metadata: Metadata = {
  title: 'Network Topology — GhostStack',
  description: 'Live 3D topology of GhostChain L1, GhostL2, GhostL3, validators and bridges',
};

export default function NetworkPage() {
  return <NetworkTopology3DClient />;
}
