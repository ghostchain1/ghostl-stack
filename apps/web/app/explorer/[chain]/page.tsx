import Link from 'next/link';
import { notFound } from 'next/navigation';

type ChainKey = 'l1' | 'l2' | 'l3';

const chains: Record<ChainKey, { label: string; url?: string; env: string }> = {
  l1: { label: 'GhostChain (L1)', url: process.env.NEXT_PUBLIC_GHOSTSCOUT_L1_URL, env: 'NEXT_PUBLIC_GHOSTSCOUT_L1_URL' },
  l2: { label: 'GhostL2', url: process.env.NEXT_PUBLIC_GHOSTSCOUT_L2_URL, env: 'NEXT_PUBLIC_GHOSTSCOUT_L2_URL' },
  l3: { label: 'GhostL3', url: process.env.NEXT_PUBLIC_GHOSTSCOUT_L3_URL, env: 'NEXT_PUBLIC_GHOSTSCOUT_L3_URL' }
};

const chainLinks: Array<{ key: ChainKey; label: string }> = [
  { key: 'l1', label: 'L1' },
  { key: 'l2', label: 'L2' },
  { key: 'l3', label: 'L3' }
];

export default function ExplorerChainPage({ params }: { params: { chain: string } }) {
  const chainKey = params.chain as ChainKey;
  const config = chains[chainKey];
  if (!config) {
    notFound();
  }
  const url = config.url ? config.url.replace(/\/+$/, '') : '';

  if (!url) {
    return (
      <div className="content">
        <div className="card">
          <div style={{ fontWeight: 700 }}>Explorer unavailable</div>
          <div className="muted">Set {config.env} to enable the embedded explorer.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="content" style={{ flex: 1 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{config.label}</div>
          <div className="muted">Embedded GhostScout explorer</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {chainLinks.map((item) => (
            <Link key={item.key} className="button secondary" href={`/explorer/${item.key}`}>
              {item.label}
            </Link>
          ))}
          <a className="button secondary" href={url} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
        </div>
      </div>
      <div className="card" style={{ flex: 1, minHeight: '70vh', padding: 0, overflow: 'hidden' }}>
        <iframe title={`${config.label} Explorer`} src={url} style={{ width: '100%', height: '100%', border: 0 }} />
      </div>
    </div>
  );
}
