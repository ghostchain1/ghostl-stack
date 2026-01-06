import { ReleasePlanner } from '../../src/modules/devops/components/ReleasePlanner';
import { ForkScheduler } from '../../src/modules/devops/components/ForkScheduler';
import { FeatureFlagsPanel } from '../../src/modules/devops/components/FeatureFlagsPanel';
import { UpgradeJobs } from '../../src/modules/devops/components/UpgradeJobs';
import { RollbackHistory } from '../../src/modules/devops/components/RollbackHistory';
import { apiFetch } from '../../src/lib/api';
import type { Release, ForkEvent } from '@ghostl/types/devops';

async function loadDevOps() {
  const releases = await apiFetch<Release[]>('/devops/releases', { fallback: [] }).catch(() => []);
  const forks = await apiFetch<ForkEvent[]>('/devops/forks', { fallback: [] }).catch(() => []);
  return { releases, forks };
}

export default async function DevOpsPage() {
  const { releases, forks } = await loadDevOps();
  const flags = [
    { name: 'ai.beta', enabled: true },
    { name: 'bridge.pause', enabled: false }
  ];
  const jobs = [{ id: 'job-1', target: 'op-node', status: 'planned' as const, startedAt: '' }];
  const rollbacks = [{ id: 'rb-1', version: 'v0.1.0', reason: 'bad deploy', time: new Date().toISOString() }];
  return (
    <div className="content">
      <div className="card-grid">
        <ReleasePlanner releases={releases} />
        <ForkScheduler forks={forks} />
        <FeatureFlagsPanel flags={flags} />
        <UpgradeJobs jobs={jobs} />
        <RollbackHistory rollbacks={rollbacks} />
      </div>
    </div>
  );
}
