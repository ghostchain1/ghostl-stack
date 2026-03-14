'use client';

import dynamic from 'next/dynamic';

const NetworkTopology3D = dynamic(
  () => import('../../src/modules/network/components/NetworkTopology3D'),
  { ssr: false, loading: () => <div style={{ color: '#6b7280', padding: 24 }}>Loading topology…</div> },
);

export default function NetworkTopology3DClient() {
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <NetworkTopology3D />
    </div>
  );
}
