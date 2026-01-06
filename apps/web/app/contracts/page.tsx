import { ContractsRegistry } from '../../src/modules/contracts/components/ContractsRegistry';
import { ContractDetailCard } from '../../src/modules/contracts/components/ContractDetailCard';
import { AdminControls } from '../../src/modules/contracts/components/AdminControls';
import { ExecutionAnalytics } from '../../src/modules/contracts/components/ExecutionAnalytics';
import type { Contract, ContractCallStats } from '@ghostl/types/contracts';
import { apiFetch } from '../../src/lib/api';

type RawContract = Partial<Contract> & {
  proxies?: string;
  ownership?: string;
  registry?: string;
  id?: string;
};

async function loadContracts(): Promise<Contract[]> {
  const data = await apiFetch<{ networks?: RawContract[] }>('/api/contracts', { fallback: { networks: [] } });
  return (data.networks || []).map((n) => ({
    address: n.registry || n.address || '0x0',
    name: n.id || n.name || 'contract',
    abi: n.abi || [],
    verified: Boolean(n.verified ?? true),
    proxyType: n.proxies || n.proxyType || '',
    owner: n.ownership || n.owner || ''
  }));
}

export default async function ContractsPage() {
  const contracts = await loadContracts();
  const detail = contracts[0];
  const stats: ContractCallStats = { calls: 0, avgGas: 0, reverts: 0, timeRange: '24h' };
  return (
    <div className="content">
      <div className="card-grid">
        <ContractsRegistry contracts={contracts} />
        {detail && <ContractDetailCard contract={detail} stats={stats} />}
        <AdminControls actions={[{ label: 'Pause', action: 'pause', enabled: true }]} />
        <ExecutionAnalytics stats={stats} />
      </div>
    </div>
  );
}
