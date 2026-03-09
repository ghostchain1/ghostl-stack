/**
 * validator-api.ts — Client-side helper for the validators endpoint.
 */

export interface ValidatorEntry {
  address: string;
  moniker: string;
  power: string;
  uptime: number;
  status: 'active' | 'jailed' | 'inactive';
}

export interface ValidatorList {
  validators: ValidatorEntry[];
  totalPower: string;
  activeCount: number;
}

export async function fetchValidators(): Promise<ValidatorList> {
  const res = await fetch('/api/command-center/validators', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ValidatorList>;
}
