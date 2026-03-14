import Link from 'next/link';

export default function AdminGhostDnsPage() {
  return (
    <div className="content">
      <h2>GhostDNS admin</h2>
      <p className="muted">Use the Hyper Ghost DNS panel for reconcile, reload, and incident controls.</p>
      <Link className="button secondary" href="/ai/hyperghost/ghostdns">
        Open GhostDNS panel
      </Link>
    </div>
  );
}
