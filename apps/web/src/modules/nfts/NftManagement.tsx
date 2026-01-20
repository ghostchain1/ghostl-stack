'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@ghostl/ui';
import { jsonWithCsrf } from '../../lib/csrf';
import { resolveApiBase } from '../../lib/runtime';
import { normalizeRole, roleOrder } from '../identity-access/access-policy';
import { useSession } from '../identity-access/session';
import { fetchNftContracts, fetchNftTokens, type NftContract, type NftToken } from './services';
import type { WalletRecord } from '@ghostl/types';

const API_URL = resolveApiBase();

type ContractForm = {
  address: string;
  chainId: 'l1' | 'l2' | 'l3';
  name: string;
  symbol: string;
  metadataUri: string;
  rpc: string;
};

type MinterForm = {
  account: string;
  action: 'grant' | 'revoke';
  rpc: string;
};

type MintForm = {
  to: string;
  tokenId: string;
  tokenUri: string;
  rpc: string;
};

type TransferForm = {
  to: string;
  tokenId: string;
};

type BurnForm = {
  tokenId: string;
};

const defaultContractForm: ContractForm = {
  address: '',
  chainId: 'l2',
  name: '',
  symbol: '',
  metadataUri: '',
  rpc: ''
};

const defaultMinterForm: MinterForm = {
  account: '',
  action: 'grant',
  rpc: ''
};

const defaultMintForm: MintForm = {
  to: '',
  tokenId: '',
  tokenUri: '',
  rpc: ''
};

const defaultTransferForm: TransferForm = {
  to: '',
  tokenId: ''
};

const defaultBurnForm: BurnForm = {
  tokenId: ''
};

const chainLabel = (chainId?: string) => {
  if (!chainId) return 'unknown';
  if (chainId === 'l1') return 'GhostChain L1';
  if (chainId === 'l2') return 'Ghost L2';
  if (chainId === 'l3') return 'Ghost L3';
  return chainId;
};

export function NftManagement() {
  const { user } = useSession();
  const role = normalizeRole(user?.role);
  const isAdmin = roleOrder[role] >= roleOrder.ADMIN;
  const canOperate = roleOrder[role] >= roleOrder.OPERATOR;
  const [contracts, setContracts] = useState<NftContract[]>([]);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [tokens, setTokens] = useState<NftToken[]>([]);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [activeWalletId, setActiveWalletId] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [ownerQuery, setOwnerQuery] = useState('');
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [status, setStatus] = useState('');
  const [contractForm, setContractForm] = useState<ContractForm>(defaultContractForm);
  const [minterForm, setMinterForm] = useState<MinterForm>(defaultMinterForm);
  const [mintForm, setMintForm] = useState<MintForm>(defaultMintForm);
  const [transferForm, setTransferForm] = useState<TransferForm>(defaultTransferForm);
  const [burnForm, setBurnForm] = useState<BurnForm>(defaultBurnForm);

  const selectedContract = useMemo(
    () => contracts.find((contract) => contract.id === selectedContractId) || null,
    [contracts, selectedContractId]
  );

  const eligibleWallets = useMemo(() => {
    if (!selectedContract) return wallets;
    return wallets.filter((wallet) => wallet.chainId === selectedContract.chainId);
  }, [wallets, selectedContract]);

  const loadContracts = async () => {
    const res = await fetchNftContracts();
    if (res.ok) {
      const next = res.data.contracts || [];
      setContracts(next);
      if (!selectedContractId && next.length) {
        setSelectedContractId(next[0].id);
      }
    } else {
      setStatus(res.error.message || 'Failed to load contracts');
    }
  };

  const loadWallets = async () => {
    try {
      const res = await fetch(`${API_URL}/wallets`, { credentials: 'include' });
      if (!res.ok) throw new Error('wallets_failed');
      const data = (await res.json()) as WalletRecord[];
      setWallets(data);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load wallets');
    }
  };

  const loadTokens = async () => {
    if (!selectedContractId) {
      setTokens([]);
      return;
    }
    setLoadingTokens(true);
    const res = await fetchNftTokens(selectedContractId, ownerQuery || undefined);
    if (res.ok) {
      setTokens(res.data.tokens || []);
      setStatus('');
    } else {
      setStatus(res.error.message || 'Failed to load tokens');
    }
    setLoadingTokens(false);
  };

  useEffect(() => {
    loadContracts().catch(() => undefined);
    loadWallets().catch(() => undefined);
  }, []);

  useEffect(() => {
    loadTokens().catch(() => undefined);
  }, [selectedContractId, ownerQuery]);

  useEffect(() => {
    if (!eligibleWallets.length) return;
    if (!eligibleWallets.find((wallet) => wallet.id === activeWalletId)) {
      setActiveWalletId(eligibleWallets[0].id);
    }
  }, [eligibleWallets, activeWalletId]);

  const registerContract = async () => {
    if (!contractForm.address) {
      setStatus('Contract address required');
      return;
    }
    setStatus('Registering contract...');
    try {
      const res = await fetch(`${API_URL}/api/nfts/contracts`, {
        method: 'POST',
        headers: jsonWithCsrf(),
        credentials: 'include',
        body: JSON.stringify({
          address: contractForm.address,
          chainId: contractForm.chainId,
          name: contractForm.name || undefined,
          symbol: contractForm.symbol || undefined,
          metadataUri: contractForm.metadataUri || undefined,
          rpc: contractForm.rpc || undefined
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Register failed');
      setContractForm(defaultContractForm);
      await loadContracts();
      setStatus('Contract registered');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Register failed');
    }
  };

  const updateMinter = async () => {
    if (!selectedContractId) {
      setStatus('Select a contract first');
      return;
    }
    if (!minterForm.account) {
      setStatus('Minter account required');
      return;
    }
    setStatus('Updating minter role...');
    try {
      const res = await fetch(`${API_URL}/api/nfts/minters`, {
        method: 'POST',
        headers: jsonWithCsrf(),
        credentials: 'include',
        body: JSON.stringify({
          contractId: selectedContractId,
          account: minterForm.account,
          action: minterForm.action,
          rpc: minterForm.rpc || undefined
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Minter update failed');
      setStatus(`Minter ${minterForm.action}ed`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Minter update failed');
    }
  };

  const mintToken = async () => {
    if (!selectedContractId) {
      setStatus('Select a contract first');
      return;
    }
    if (!activeWalletId) {
      setStatus('Select a GhostWallet');
      return;
    }
    if (!mintForm.to) {
      setStatus('Recipient required');
      return;
    }
    setStatus('Minting token...');
    try {
      const res = await fetch(`${API_URL}/api/nfts/mint`, {
        method: 'POST',
        headers: jsonWithCsrf(),
        credentials: 'include',
        body: JSON.stringify({
          contractId: selectedContractId,
          walletId: activeWalletId,
          to: mintForm.to,
          tokenId: mintForm.tokenId || undefined,
          tokenUri: mintForm.tokenUri || undefined,
          rpc: mintForm.rpc || undefined
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Mint failed');
      setMintForm(defaultMintForm);
      await loadTokens();
      setStatus('Token minted');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Mint failed');
    }
  };

  const transferToken = async () => {
    if (!selectedContractId) {
      setStatus('Select a contract first');
      return;
    }
    if (!activeWalletId) {
      setStatus('Select a GhostWallet');
      return;
    }
    if (!transferForm.to || !transferForm.tokenId) {
      setStatus('Recipient + token ID required');
      return;
    }
    setStatus('Transferring token...');
    try {
      const res = await fetch(`${API_URL}/api/nfts/transfer`, {
        method: 'POST',
        headers: jsonWithCsrf(),
        credentials: 'include',
        body: JSON.stringify({
          contractId: selectedContractId,
          walletId: activeWalletId,
          to: transferForm.to,
          tokenId: transferForm.tokenId
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Transfer failed');
      setTransferForm(defaultTransferForm);
      await loadTokens();
      setStatus('Token transferred');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Transfer failed');
    }
  };

  const burnToken = async () => {
    if (!selectedContractId) {
      setStatus('Select a contract first');
      return;
    }
    if (!activeWalletId) {
      setStatus('Select a GhostWallet');
      return;
    }
    if (!burnForm.tokenId) {
      setStatus('Token ID required');
      return;
    }
    setStatus('Burning token...');
    try {
      const res = await fetch(`${API_URL}/api/nfts/burn`, {
        method: 'POST',
        headers: jsonWithCsrf(),
        credentials: 'include',
        body: JSON.stringify({
          contractId: selectedContractId,
          walletId: activeWalletId,
          tokenId: burnForm.tokenId
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Burn failed');
      setBurnForm(defaultBurnForm);
      await loadTokens();
      setStatus('Token burned');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Burn failed');
    }
  };

  return (
    <div className="content">
      <div className="card-grid">
        <Card title="NFT contracts" subtitle="Registered collections">
          <div className="stack" style={{ gap: 8 }}>
            <div className="inline-form" style={{ gap: 8 }}>
              <select
                className="select"
                value={selectedContractId}
                onChange={(e) => setSelectedContractId(e.target.value)}
              >
                <option value="">Select contract</option>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.name || contract.symbol || contract.address}
                  </option>
                ))}
              </select>
              <Button variant="secondary" onClick={loadContracts}>
                Refresh
              </Button>
            </div>
            {selectedContract && (
              <div className="stack" style={{ gap: 4 }}>
                <div className="muted">{chainLabel(selectedContract.chainId)}</div>
                <div className="mono">{selectedContract.address}</div>
                <div className="muted">Standard {selectedContract.standard}</div>
                {selectedContract.metadataUri && <div className="muted">Metadata {selectedContract.metadataUri}</div>}
              </div>
            )}
            {!selectedContract && <div className="muted">No contract selected.</div>}
          </div>
        </Card>

        <Card title="Register contract" subtitle="Add existing ERC-721">
          <div className="stack" style={{ gap: 8 }}>
            <input
              className="input"
              placeholder="Contract address"
              value={contractForm.address}
              onChange={(e) => setContractForm((prev) => ({ ...prev, address: e.target.value }))}
            />
            <div className="inline-form" style={{ gap: 8 }}>
              <select
                className="select"
                value={contractForm.chainId}
                onChange={(e) => setContractForm((prev) => ({ ...prev, chainId: e.target.value as ContractForm['chainId'] }))}
              >
                <option value="l1">GhostChain L1</option>
                <option value="l2">Ghost L2</option>
                <option value="l3">Ghost L3</option>
              </select>
              <input
                className="input"
                placeholder="RPC override (optional)"
                value={contractForm.rpc}
                onChange={(e) => setContractForm((prev) => ({ ...prev, rpc: e.target.value }))}
              />
            </div>
            <div className="inline-form" style={{ gap: 8 }}>
              <input
                className="input"
                placeholder="Name (optional)"
                value={contractForm.name}
                onChange={(e) => setContractForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Symbol (optional)"
                value={contractForm.symbol}
                onChange={(e) => setContractForm((prev) => ({ ...prev, symbol: e.target.value }))}
              />
            </div>
            <input
              className="input"
              placeholder="Metadata URI (optional)"
              value={contractForm.metadataUri}
              onChange={(e) => setContractForm((prev) => ({ ...prev, metadataUri: e.target.value }))}
            />
            <Button onClick={registerContract} disabled={!canOperate}>
              Register
            </Button>
          </div>
        </Card>

        <Card title="GhostWallet" subtitle="Select signer">
          <div className="stack" style={{ gap: 8 }}>
            <select
              className="select"
              value={activeWalletId}
              onChange={(e) => setActiveWalletId(e.target.value)}
            >
              <option value="">Select GhostWallet</option>
              {eligibleWallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.label || wallet.id} ({wallet.chainId})
                </option>
              ))}
            </select>
            {!eligibleWallets.length && <div className="muted">No wallets for this chain.</div>}
          </div>
        </Card>

        {isAdmin && (
          <Card title="Minter roles" subtitle="Grant or revoke MINTER_ROLE">
            <div className="stack" style={{ gap: 8 }}>
              <input
                className="input"
                placeholder="0x minter account"
                value={minterForm.account}
                onChange={(e) => setMinterForm((prev) => ({ ...prev, account: e.target.value }))}
              />
              <div className="inline-form" style={{ gap: 8 }}>
                <select
                  className="select"
                  value={minterForm.action}
                  onChange={(e) => setMinterForm((prev) => ({ ...prev, action: e.target.value as MinterForm['action'] }))}
                >
                  <option value="grant">Grant</option>
                  <option value="revoke">Revoke</option>
                </select>
                <input
                  className="input"
                  placeholder="RPC override (optional)"
                  value={minterForm.rpc}
                  onChange={(e) => setMinterForm((prev) => ({ ...prev, rpc: e.target.value }))}
                />
              </div>
              <Button onClick={updateMinter}>Update role</Button>
            </div>
          </Card>
        )}
      </div>

      <div className="card-grid" style={{ marginTop: 16 }}>
        <Card title="Mint NFT" subtitle="GhostWallet minting">
          <div className="stack" style={{ gap: 8 }}>
            <input
              className="input"
              placeholder="Recipient address"
              value={mintForm.to}
              onChange={(e) => setMintForm((prev) => ({ ...prev, to: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Token ID (optional)"
              value={mintForm.tokenId}
              onChange={(e) => setMintForm((prev) => ({ ...prev, tokenId: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Token URI (optional)"
              value={mintForm.tokenUri}
              onChange={(e) => setMintForm((prev) => ({ ...prev, tokenUri: e.target.value }))}
            />
            <input
              className="input"
              placeholder="RPC override (optional)"
              value={mintForm.rpc}
              onChange={(e) => setMintForm((prev) => ({ ...prev, rpc: e.target.value }))}
            />
            <Button onClick={mintToken} disabled={!canOperate}>
              Mint
            </Button>
          </div>
        </Card>

        <Card title="Transfer NFT" subtitle="GhostWallet transfer">
          <div className="stack" style={{ gap: 8 }}>
            <input
              className="input"
              placeholder="Recipient address"
              value={transferForm.to}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, to: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Token ID"
              value={transferForm.tokenId}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, tokenId: e.target.value }))}
            />
            <Button onClick={transferToken} disabled={!canOperate}>
              Transfer
            </Button>
          </div>
        </Card>

        <Card title="Burn NFT" subtitle="Owner burn">
          <div className="stack" style={{ gap: 8 }}>
            <input
              className="input"
              placeholder="Token ID"
              value={burnForm.tokenId}
              onChange={(e) => setBurnForm((prev) => ({ ...prev, tokenId: e.target.value }))}
            />
            <Button onClick={burnToken} disabled={!canOperate}>
              Burn
            </Button>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="NFT tokens" subtitle="Minted tokens for selected contract" className="stack">
        <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
          <div className="inline-form" style={{ gap: 8 }}>
            <input
              className="input"
              placeholder="Filter by owner (0x...)"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
            />
            <Button variant="secondary" onClick={() => setOwnerQuery(ownerFilter.trim())}>
              Apply
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setOwnerFilter('');
                setOwnerQuery('');
              }}
            >
              Clear
            </Button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="secondary" onClick={loadTokens}>
              Refresh
            </Button>
            {loadingTokens && <span className="muted">Loading...</span>}
          </div>
        </div>
        {status && <div className="muted" style={{ marginTop: 8 }}>{status}</div>}
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Token ID</th>
                <th>Owner</th>
                <th>Status</th>
                <th>URI</th>
                <th>Last Tx</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr key={token.id}>
                  <td className="mono">{token.tokenId}</td>
                  <td className="mono">{token.owner}</td>
                  <td>
                    <Badge tone={token.burnedAt ? 'critical' : 'success'}>
                      {token.burnedAt ? 'burned' : 'active'}
                    </Badge>
                  </td>
                  <td className="mono">{token.uri || '—'}</td>
                  <td className="mono">{token.lastTx || '—'}</td>
                  <td>{token.updatedAt || token.mintedAt}</td>
                </tr>
              ))}
              {!tokens.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    No tokens found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </Card>
      </div>
    </div>
  );
}
