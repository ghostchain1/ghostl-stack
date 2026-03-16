import { ValidatorsTable } from '../../src/modules/validators/components/ValidatorsTable';
import { ValidatorHeatMap } from '../../src/modules/validators/components/ValidatorHeatMap';
import { ValidatorDetailCard } from '../../src/modules/validators/components/ValidatorDetailCard';
import { VotingPowerChart } from '../../src/modules/validators/components/VotingPowerChart';
import { ParticipationPanel } from '../../src/modules/validators/components/ParticipationPanel';
import type { Validator, SlashEvent } from '@ghostchain/types/validators';
import type { ApiError } from '../../src/lib/api';
import { serverApiRequest } from '../../src/lib/server-api';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';

type RawValidator = Partial<Validator> & {
  proposerIndex?: number | string;
  byzantine?: number | string;
};

async function loadValidators(): Promise<{
  validators: Validator[];
  metrics: { missedBlocks?: number; participationRate?: number; lastProposer?: string } | null;
  errors: Array<{ title: string; error: ApiError }>;
}> {
  const [validatorsRes, metricsRes] = await Promise.all([
    serverApiRequest<{ validators?: RawValidator[] }>('/api/validators', { init: { cache: 'no-store' } }),
    serverApiRequest<{ metrics?: { missedBlocks?: number; participationRate?: number; lastProposer?: string } }>(
      '/api/validators/metrics',
      { init: { cache: 'no-store' } }
    )
  ]);
  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!validatorsRes.ok) errors.push({ title: 'Validators list', error: validatorsRes.error });
  if (!metricsRes.ok) errors.push({ title: 'Validator metrics', error: metricsRes.error });

  const list = validatorsRes.ok ? validatorsRes.data.validators || [] : [];
  const validators = list.map((v) => {
    const powerSource = v.byzantine ?? v.proposerIndex ?? v.power ?? 0;
    return {
      id: v.id || v.address || 'unknown',
      address: v.id || v.address || '0x0',
      status: v.status || 'active',
      stake: v.stake || '?',
      commission: Number(v.commission || 0),
      power: typeof powerSource === 'string' ? Number(powerSource) || 0 : Number(powerSource || 0)
    };
  });
  const metrics = metricsRes.ok ? metricsRes.data.metrics || null : null;
  return { validators, metrics, errors };
}

export default async function ValidatorsPage() {
  const { validators, metrics, errors } = await loadValidators();
  const target = validators[0];
  const slashes: SlashEvent[] = [];
  const participation = metrics?.participationRate !== undefined ? `${Math.round(metrics.participationRate * 100)}%` : 'n/a';
  const proposer = metrics?.lastProposer || 'n/a';
  const panelMetrics = { finality: 'n/a', participation, proposer };

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        {errors.find((e) => e.title === 'Validators list') ? null : <ValidatorsTable validators={validators} />}
        {errors.find((e) => e.title === 'Validator metrics') || !target ? null : (
          <ValidatorDetailCard validator={target} missedBlocks={metrics?.missedBlocks} slashes={slashes} />
        )}
        {errors.find((e) => e.title === 'Validators list') ? null : <VotingPowerChart validators={validators} />}
        {errors.find((e) => e.title === 'Validator metrics') ? null : <ParticipationPanel metrics={panelMetrics} />}
        <ValidatorHeatMap />
      </div>
    </div>
  );
}
