import { NetworkTopologyMap } from '../../src/modules/network-map/NetworkTopologyMap';

export const metadata = {
  title: 'Network Map',
  description: 'Interactive GhostChain L1 / GhostL2 / GhostL3 topology visualisation.',
};

export default function NetworkMapPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Network Topology Map</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--color-muted, #9ca3af)' }}>
          Live topology of GhostChain L1 → GhostL2 → GhostL3 nodes, bridges, and finality oracles.
          Green animated edges indicate active data flow.
        </p>
      </div>
      <NetworkTopologyMap />
    </div>
  );
}
