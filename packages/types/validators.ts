export type ValidatorStatus = 'active' | 'jailed' | 'slashed' | 'inactive';

export interface Validator {
  id: string;
  address: string;
  status: ValidatorStatus;
  stake: string;
  commission: number;
  power: number;
}

export interface SlashEvent {
  validatorId: string;
  reason: string;
  amount: string;
  time: string;
}
