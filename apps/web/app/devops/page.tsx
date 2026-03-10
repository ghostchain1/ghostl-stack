import { HypervisorPanel } from '../../src/modules/devops/components/HypervisorPanel';
import { ReleasePlanner } from '../../src/modules/devops/components/ReleasePlanner';
import { ForkScheduler } from '../../src/modules/devops/components/ForkScheduler';
import { FeatureFlagsPanel } from '../../src/modules/devops/components/FeatureFlagsPanel';
import { UpgradeJobs } from '../../src/modules/devops/components/UpgradeJobs';
import { RollbackHistory } from '../../src/modules/devops/components/RollbackHistory';
import type { ApiError } from '../../src/lib/api';
import { serverApiRequest } from '../../src/lib/server-api';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';
import type { Release, ForkEvent } from '@ghostl/types/devops';
import { UpgradePlans } from '../../src/modules/devops/components/UpgradePlans';

type UpgradeJob = { id: string; target: string; status: 'planned' | 'running' | 'failed' | 'done'; startedAt?: string };

async function loadDevOps() {
  const [releasesRes, forksRes, flagsRes, upgradesRes, plansRes] = await Promise.all([
    serverApiRequest<Release[]>('/devops/releases', { init: { cache: 'no-store' } }),
    serverApiRequest<ForkEvent[]>('/devops/forks', { init: { cache: 'no-store' } }),
    serverApiRequest<Array<{ key?: string; name?: string; enabled?: boolean; description?: string }>>(
      '/app-shell/feature-flags',
      { init: { cache: 'no-store' } }
    ),
    serverApiRequest<Array<{ id?: string; target?: string; status?: string; startedAt?: string }>>('/devops/upgrades', {
      init: { cache: 'no-store' }
    }),
    serverApiRequest<Array<{ id: string; name: string; createdAt: string; updatedAt: string; rollbackOf?: string }>>(
      '/devops/upgrade-plans',
      { init: { cache: 'no-store' } }
    )
  ]);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!releasesRes.ok) errors.push({ title: 'DevOps releases', error: releasesRes.error });
  if (!forksRes.ok) errors.push({ title: 'DevOps forks', error: forksRes.error });
  if (!flagsRes.ok) errors.push({ title: 'Feature flags', error: flagsRes.error });
  if (!upgradesRes.ok) errors.push({ title: 'Upgrade jobs', error: upgradesRes.error });
  if (!plansRes.ok) errors.push({ title: 'Upgrade plans', error: plansRes.error });

  const releases = releasesRes.ok ? releasesRes.data : [];
  const forks = forksRes.ok ? forksRes.data : [];
  const flags = flagsRes.ok
    ? flagsRes.data.map((flag, index) => ({
        name: flag.name || flag.key || `flag-${index + 1}`,
        enabled: Boolean(flag.enabled),
        description: flag.description
      }))
    : [];
  const jobs: UpgradeJob[] = upgradesRes.ok
    ? upgradesRes.data.map((job, index) => {
        const status: UpgradeJob['status'] =
          job.status === 'running' || job.status === 'failed' || job.status === 'done' ? job.status : 'planned';
        return {
          id: job.id || job.target || `upgrade-${index + 1}`,
          target: job.target || 'unknown',
          status,
          startedAt: job.startedAt
        };
      })
    : [];
  const rollbacks = plansRes.ok
    ? plansRes.data
        .filter((plan) => plan.rollbackOf)
        .map((plan) => ({
          id: plan.id,
          version: plan.name,
          reason: `rollback of ${plan.rollbackOf}`,
          time: plan.updatedAt || plan.createdAt
        }))
    : [];

  return {
    releases,
    forks,
    flags,
    jobs,
    rollbacks,
    errors,
    ok: {
      releases: releasesRes.ok,
      forks: forksRes.ok,
      flags: flagsRes.ok,
      jobs: upgradesRes.ok,
      plans: plansRes.ok
    }
  };
}

export default async function DevOpsPage() {
  const { releases, forks, flags, jobs, rollbacks, errors, ok } = await loadDevOps();
  return (
    <div className="content">
      <div style={{ padding: '0 0 20px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>DevOps Control</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-muted,#9ca3af)' }}>
          Containers · VMs · Releases · Feature Flags · Upgrade Pipeline
        </p>
      </div>
      {/* Hypervisor — container/VM live control */}
      <div style={{ marginBottom: 24 }}>
        <HypervisorPanel />
      </div>
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        {ok.releases && <ReleasePlanner releases={releases} />}
        {ok.forks && <ForkScheduler forks={forks} />}
        {ok.flags && <FeatureFlagsPanel flags={flags} />}
        {ok.jobs && <UpgradeJobs jobs={jobs} />}
        {ok.plans && <RollbackHistory rollbacks={rollbacks} />}
        <UpgradePlans />
      </div>
    </div>
  );
}
