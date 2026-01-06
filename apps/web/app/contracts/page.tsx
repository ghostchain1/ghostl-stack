import { ContractsRegistry } from '../../src/modules/contracts/components/ContractsRegistry';
import { ContractDetailCard } from '../../src/modules/contracts/components/ContractDetailCard';
import { AdminControls } from '../../src/modules/contracts/components/AdminControls';
import { ExecutionAnalytics } from '../../src/modules/contracts/components/ExecutionAnalytics';
import type { Contract, ContractCallStats } from '@ghostchain/types/contracts';
import { apiFetch } from '../../src/lib/api';

async function loadContracts(): Promise<Contract[]> {
  const data = await apiFetch<{ networks?: any[] }>('/api/contracts', { fallback: { networks: [] } });
  return (data.networks || []).map((n) => ({
    address: n.registry || '0x0',
    name: n.id || 'contract',
    abi: [],
    verified: true,
    proxyType: n.proxies || '',
    owner: n.ownership || ''
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
