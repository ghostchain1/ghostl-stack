type PolicyBundle = {
  apiVersion: string;
  kind: string;
  metadata: { bundleId: string; version: string };
  defaults?: { conflictStrategy?: string; decisionTTLSeconds?: number };
  policies: Array<{
    id: string;
    priority: number;
    appliesTo: { actions: string[] };
    effect: unknown;
  }>;
};

export function PolicyBundleViewer({ bundle }: { bundle: PolicyBundle }) {
  const controlIds = new Set<string>();
  for (const policy of bundle.policies) {
    const effect = policy.effect as { require?: { controls?: string[] } } | undefined;
    effect?.require?.controls?.forEach((control) => controlIds.add(control));
  }

  return (
    <div className="card">
      <h3>Active policy bundle</h3>
      <div className="muted">{bundle.metadata.bundleId} · v{bundle.metadata.version}</div>
      <div className="filter-row" style={{ marginTop: 12 }}>
        <div className="badge">
          Conflict: {bundle.defaults?.conflictStrategy || 'most_restrictive'}
        </div>
        <div className="badge">Rules: {bundle.policies.length}</div>
        <div className="badge">Controls: {controlIds.size}</div>
      </div>
      <div style={{ marginTop: 16 }}>
        <h4>Rules</h4>
        <ul>
          {bundle.policies.map((policy) => (
            <li key={policy.id} className="muted">
              {policy.id} · priority {policy.priority} · actions {policy.appliesTo.actions.join(', ')}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
