import { ValidatorsTable } from '../../src/modules/validators/components/ValidatorsTable';
import { ValidatorDetailCard } from '../../src/modules/validators/components/ValidatorDetailCard';
import { VotingPowerChart } from '../../src/modules/validators/components/VotingPowerChart';
import { ParticipationPanel } from '../../src/modules/validators/components/ParticipationPanel';
import type { Validator, SlashEvent } from '@ghostl/types/validators';
import { apiFetch } from '../../src/lib/api';

type RawValidator = Partial<Validator> & {
  proposerIndex?: number | string;
  byzantine?: number | string;
};

async function loadValidators(): Promise<Validator[]> {
  const data = await apiFetch<{ validators?: RawValidator[] }>('/api/validators', {
    fallback: { validators: [] }
  });
  return (data.validators || []).map((v) => {
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
}

const mockParticipation = { finality: 'safe', participation: '95%', proposer: 'rotating' };

export default async function ValidatorsPage() {
  const validators = await loadValidators();
  const target = validators[0];
  const slashes: SlashEvent[] = [];

  return (
    <div className="content">
      <div className="card-grid">
        <ValidatorsTable validators={validators} />
        {target && <ValidatorDetailCard validator={target} missedBlocks={0} rewards="—" slashes={slashes} />}
        <VotingPowerChart validators={validators} />
        <ParticipationPanel metrics={mockParticipation} />
      </div>
    </div>
  );
}
