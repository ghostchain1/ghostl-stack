// GhostEnterprise SDK — Institutional-grade GhostChain integration.
// CBDC issuance, reserve management, KYC/AML compliance, bank rails, and multi-sig treasury.

export interface GhostEnterpriseConfig {
  l1Rpc: string;         // GhostChain L1 RPC (http://localhost:18545)
  complianceApi: string; // Compliance service (http://localhost:8090)
  authToken: string;
  institutionId: string;
}

// ─── KYC / AML ───────────────────────────────────────────────────────────────

export type KYCStatus = 'unverified' | 'pending' | 'approved' | 'rejected' | 'expired';
export type AMLRisk   = 'low' | 'medium' | 'high' | 'blocked';

export interface KYCRecord {
  address: string;
  institutionId: string;
  status: KYCStatus;
  amlRisk: AMLRisk;
  verifiedAt?: number;
  expiresAt?: number;
  jurisdictions: string[];
}

export interface KYCSubmission {
  address: string;
  legalName: string;
  dob: string;          // YYYY-MM-DD
  nationality: string;
  documentType: 'passport' | 'national-id' | 'drivers-license';
  documentNumber: string;
  documentExpiry: string;
  countryOfResidence: string;
}

// ─── CBDC ─────────────────────────────────────────────────────────────────────

export interface GhostCBDCIssuance {
  txHash: string;
  issuer: string;
  amount: bigint;       // GST wei
  currency: string;     // e.g. 'GUSD', 'GEUR'
  recipient: string;
  timestamp: number;
}

export interface GhostCBDCReserve {
  currency: string;
  totalSupply: bigint;
  collateralRatio: number; // e.g. 1.05 = 105% collateralized
  reserveAddress: string;
  lastAuditBlock: number;
}

// ─── Bank Rails ───────────────────────────────────────────────────────────────

export interface BankRailTransfer {
  id: string;
  sender: string;        // GhostChain address
  destination: string;   // IBAN / bank account
  gstAmount: bigint;
  fiatAmount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  settlementTxHash?: string;
  initiatedAt: number;
  settledAt?: number;
}

// ─── Multi-Sig Treasury ───────────────────────────────────────────────────────

export interface MultiSigProposal {
  id: string;
  proposer: string;
  action: string;
  params: Record<string, unknown>;
  signaturesRequired: number;
  signaturesReceived: string[];
  status: 'pending' | 'executed' | 'rejected';
  createdAt: number;
}

/**
 * GhostEnterprise — institutional SDK for GhostChain.
 * Provides CBDC issuance, KYC/AML, bank rails, and enterprise treasury management.
 *
 * @example
 * ```ts
 * import { GhostEnterprise } from '@ghostchain/ghostenterprise-sdk';
 *
 * const enterprise = new GhostEnterprise({
 *   l1Rpc: 'http://localhost:18545',
 *   complianceApi: 'http://localhost:8090',
 *   authToken: process.env.ENTERPRISE_AUTH!,
 *   institutionId: 'GCB-001', // GhostChain Central Bank
 * });
 *
 * await enterprise.kyc.submit({ address, legalName: 'Alice Corp', ... });
 * const issuance = await enterprise.cbdc.issue({ currency: 'GUSD', amount: 1_000_000n * 10n**18n, recipient });
 * ```
 */
export class GhostEnterprise {
  public readonly kyc: GhostKYC;
  public readonly cbdc: GhostCBDC;
  public readonly rails: GhostBankRails;
  public readonly treasury: GhostEnterpriseTreasury;

  constructor(config: GhostEnterpriseConfig) {
    this.kyc      = new GhostKYC(config);
    this.cbdc     = new GhostCBDC(config);
    this.rails    = new GhostBankRails(config);
    this.treasury = new GhostEnterpriseTreasury(config);
  }
}

// ─── KYC Module ───────────────────────────────────────────────────────────────

export class GhostKYC {
  constructor(private readonly config: GhostEnterpriseConfig) {}

  /** Submit a KYC application */
  async submit(data: KYCSubmission): Promise<{ applicationId: string }> {
    return this._compliance<{ applicationId: string }>('POST', '/kyc/submit', data);
  }

  /** Check KYC status for an address */
  async status(address: string): Promise<KYCRecord> {
    return this._compliance<KYCRecord>('GET', `/kyc/status/${address}`);
  }

  /** Approve a KYC application (institution privileged) */
  async approve(address: string, jurisdictions: string[]): Promise<void> {
    await this._compliance('POST', `/kyc/approve/${address}`, { jurisdictions });
  }

  /** Revoke KYC status */
  async revoke(address: string, reason: string): Promise<void> {
    await this._compliance('POST', `/kyc/revoke/${address}`, { reason });
  }

  /** Batch check KYC status */
  async batchStatus(addresses: string[]): Promise<Record<string, KYCRecord>> {
    return this._compliance<Record<string, KYCRecord>>('POST', '/kyc/batch-status', { addresses });
  }

  /** Require valid KYC — throws if not approved */
  async requireApproved(address: string): Promise<void> {
    const record = await this.status(address);
    if (record.status !== 'approved') {
      throw new Error(`GhostKYC: ${address} is not KYC-approved (status=${record.status})`);
    }
  }

  private async _compliance<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.config.complianceApi}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.authToken}`,
        'X-Institution-ID': this.config.institutionId,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`GhostKYC [${path}]: ${res.status}`);
    return res.json() as Promise<T>;
  }
}

// ─── CBDC Module ──────────────────────────────────────────────────────────────

export class GhostCBDC {
  constructor(private readonly config: GhostEnterpriseConfig) {}

  /** Issue CBDC tokens */
  async issue(params: { currency: string; amount: bigint; recipient: string }): Promise<GhostCBDCIssuance> {
    return this._rpc<GhostCBDCIssuance>('ghost_cbdc_issue', [{
      ...params,
      amount: params.amount.toString(),
      institutionId: this.config.institutionId,
    }]);
  }

  /** Burn CBDC tokens (redemption) */
  async redeem(params: { currency: string; amount: bigint; holder: string }): Promise<{ txHash: string }> {
    return this._rpc<{ txHash: string }>('ghost_cbdc_redeem', [{
      ...params,
      amount: params.amount.toString(),
    }]);
  }

  /** Transfer CBDC between addresses */
  async transfer(params: { currency: string; amount: bigint; from: string; to: string }): Promise<{ txHash: string }> {
    return this._rpc<{ txHash: string }>('ghost_cbdc_transfer', [{
      ...params,
      amount: params.amount.toString(),
    }]);
  }

  /** Get reserve info for a currency */
  async getReserve(currency: string): Promise<GhostCBDCReserve> {
    return this._rpc<GhostCBDCReserve>('ghost_cbdc_reserve', [{ currency }]);
  }

  /** Get balance of a holder */
  async balanceOf(currency: string, holder: string): Promise<bigint> {
    const result = await this._rpc<{ balance: string }>('ghost_cbdc_balanceOf', [{ currency, holder }]);
    return BigInt(result.balance);
  }

  private async _rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.config.l1Rpc, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.authToken}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`GhostCBDC RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostCBDC [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}

// ─── Bank Rails Module ────────────────────────────────────────────────────────

export class GhostBankRails {
  constructor(private readonly config: GhostEnterpriseConfig) {}

  /** Initiate a bank wire / SEPA transfer from GhostChain address */
  async initiateTransfer(params: {
    sender: string;
    destination: string;  // IBAN or routing+account
    gstAmount: bigint;
    currency: string;
    reference?: string;
  }): Promise<BankRailTransfer> {
    return this._compliance<BankRailTransfer>('POST', '/rails/transfer', {
      ...params,
      gstAmount: params.gstAmount.toString(),
    });
  }

  /** Get transfer status */
  async getTransfer(id: string): Promise<BankRailTransfer> {
    return this._compliance<BankRailTransfer>('GET', `/rails/transfer/${id}`);
  }

  /** List pending transfers for institution */
  async listPending(): Promise<BankRailTransfer[]> {
    return this._compliance<BankRailTransfer[]>('GET', '/rails/pending');
  }

  private async _compliance<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.config.complianceApi}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.authToken}`,
        'X-Institution-ID': this.config.institutionId,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`GhostBankRails [${path}]: ${res.status}`);
    return res.json() as Promise<T>;
  }
}

// ─── Enterprise Treasury ──────────────────────────────────────────────────────

export class GhostEnterpriseTreasury {
  constructor(private readonly config: GhostEnterpriseConfig) {}

  /** Propose a treasury action (requires multi-sig ratification) */
  async propose(action: string, params: Record<string, unknown>): Promise<MultiSigProposal> {
    return this._rpc<MultiSigProposal>('ghost_enterprise_proposeAction', [{
      institutionId: this.config.institutionId,
      action,
      params,
    }]);
  }

  /** Sign a pending proposal */
  async sign(proposalId: string, signerAddress: string): Promise<void> {
    await this._rpc('ghost_enterprise_signProposal', [{ proposalId, signerAddress }]);
  }

  /** Execute a fully-signed proposal */
  async execute(proposalId: string): Promise<{ txHash: string }> {
    return this._rpc<{ txHash: string }>('ghost_enterprise_executeProposal', [{ proposalId }]);
  }

  /** Get current treasury balance */
  async balance(): Promise<bigint> {
    const result = await this._rpc<{ balance: string }>('ghost_enterprise_treasuryBalance', [{
      institutionId: this.config.institutionId,
    }]);
    return BigInt(result.balance);
  }

  private async _rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.config.l1Rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.authToken}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`GhostEnterpriseTreasury RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostEnterpriseTreasury [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}

export default GhostEnterprise;
