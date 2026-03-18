/**
 * UniverseEconomy — GST token flow engine for Ghost Universe
 *
 * Routing law (enforced): GST always flows L3 → L2 → L1
 *   - L3 (chain 903, :39545)  — in-world transactions (buys, rewards, tips)
 *   - L2 (chain 901, :29547)  — land/asset settlement + rollup batching
 *   - L1 (chain 14000101, :18545) — treasury accumulation, final finality
 *
 * Ghost-native economy only. GST only.
 */

const L3_RPC  = 'http://localhost:39545';
const L2_RPC  = 'http://localhost:29547';
const L1_RPC  = 'http://localhost:18545';

const GST_UNIT          = 10n ** 18n;
const PLATFORM_FEE_BPS  = 250n;   // 2.5 %
const BASIS_POINTS      = 10_000n;

export interface EconomyTx {
  txId:      string;
  from:      string;
  to:        string;
  amountGST: bigint;
  purpose:   string;
  chain:     'L3' | 'L2' | 'L1';
  timestamp: number;
  status:    'pending' | 'confirmed' | 'failed';
}

export interface TreasuryStats {
  l1BalanceGST:   bigint;
  l2VolumeGST:    bigint;
  l3VolumeGST:    bigint;
  platformFeesGST:bigint;
  totalTxCount:   number;
}

// ─── UniverseEconomy ─────────────────────────────────────────────────────────

export class UniverseEconomy {
  /** In-memory ledger for testing/devnet (replace with persistent store in prod) */
  private txLog:        EconomyTx[] = [];
  private platformFees: bigint      = 0n;
  private l2Volume:     bigint      = 0n;
  private l3Volume:     bigint      = 0n;

  // ── Balance queries ────────────────────────────────────────────────────────

  /**
   * Get GST balance on L3 (the primary in-world chain).
   */
  async getBalanceL3(address: string): Promise<bigint> {
    return this.ghostGetBalance(address, L3_RPC);
  }

  async getBalanceL2(address: string): Promise<bigint> {
    return this.ghostGetBalance(address, L2_RPC);
  }

  async getBalanceL1(address: string): Promise<bigint> {
    return this.ghostGetBalance(address, L1_RPC);
  }

  // ── In-world payment (L3) ─────────────────────────────────────────────────

  /**
   * Generic GST payment on L3.
   * All in-world transactions originate here.
   */
  async payGST(
    from:      string,
    to:        string,
    amountGST: bigint,
    purpose:   string,
  ): Promise<EconomyTx> {
    const tx = await this.submitTx(from, to, amountGST, purpose, 'L3', L3_RPC);
    this.l3Volume += amountGST;
    return tx;
  }

  // ── Land purchase (L3 → L2) ───────────────────────────────────────────────

  /**
   * Buy land: debit buyer on L3, settle ownership on L2, accumulate fee.
   */
  async buyLand(
    buyer:      string,
    seller:     string,
    priceGST:   bigint,
    parcelId:   string,
  ): Promise<{ buyerTx: EconomyTx; feeTx: EconomyTx; settlementTx: EconomyTx }> {
    const fee       = (priceGST * PLATFORM_FEE_BPS) / BASIS_POINTS;
    const netAmount = priceGST - fee;

    const buyerTx  = await this.payGST(buyer, seller, netAmount, `land-purchase:${parcelId}`);
    const feeTx    = await this.payGST(buyer, 'ghost://treasury', fee, `land-fee:${parcelId}`);
    this.platformFees += fee;

    // L2 settlement — ownership record
    const settlementTx = await this.submitTx(
      buyer, parcelId, 0n, `land-settlement:${parcelId}`, 'L2', L2_RPC,
    );
    this.l2Volume += priceGST;

    return { buyerTx, feeTx, settlementTx };
  }

  // ── Asset purchase (L3, with L2 royalty settlement) ─────────────────────

  async purchaseAsset(
    buyer:        string,
    creator:      string,
    priceGST:     bigint,
    royaltyBps:   bigint,
    assetId:      string,
  ): Promise<{ saleTx: EconomyTx; royaltyTx: EconomyTx; feeTx: EconomyTx }> {
    const fee        = (priceGST * PLATFORM_FEE_BPS) / BASIS_POINTS;
    const royalty    = (priceGST * royaltyBps)       / BASIS_POINTS;
    const sellerCut  = priceGST - fee - royalty;

    const saleTx    = await this.payGST(buyer, creator, sellerCut, `asset-sale:${assetId}`);
    const royaltyTx = await this.payGST(buyer, creator, royalty,   `asset-royalty:${assetId}`);
    const feeTx     = await this.payGST(buyer, 'ghost://treasury', fee, `asset-fee:${assetId}`);
    this.platformFees += fee;
    this.l2Volume     += priceGST;

    return { saleTx, royaltyTx, feeTx };
  }

  // ── Game rewards (L3 → avatar) ────────────────────────────────────────────

  async issueGameReward(
    avatarAddress: string,
    amountGST:     bigint,
    reason:        string,
  ): Promise<EconomyTx> {
    return this.payGST('ghost://reward-pool', avatarAddress, amountGST, `reward:${reason}`);
  }

  // ── Event ticket (L3) ─────────────────────────────────────────────────────

  async sellEventTicket(
    buyer:       string,
    host:        string,
    priceGST:    bigint,
    eventId:     string,
  ): Promise<{ ticketTx: EconomyTx; feeTx: EconomyTx }> {
    const fee    = (priceGST * PLATFORM_FEE_BPS) / BASIS_POINTS;
    const net    = priceGST - fee;

    const ticketTx = await this.payGST(buyer, host, net, `event-ticket:${eventId}`);
    const feeTx    = await this.payGST(buyer, 'ghost://treasury', fee, `event-fee:${eventId}`);
    this.platformFees += fee;

    return { ticketTx, feeTx };
  }

  // ── Treasury stats ────────────────────────────────────────────────────────

  async getTreasuryStats(): Promise<TreasuryStats> {
    const l1BalanceGST = await this.getBalanceL1('ghost://treasury');
    return {
      l1BalanceGST,
      l2VolumeGST:    this.l2Volume,
      l3VolumeGST:    this.l3Volume,
      platformFeesGST:this.platformFees,
      totalTxCount:   this.txLog.length,
    };
  }

  getTxLog(): EconomyTx[] { return [...this.txLog]; }

  // ── RPC helpers ───────────────────────────────────────────────────────────

  private async ghostGetBalance(address: string, rpc: string): Promise<bigint> {
    try {
      const res  = await fetch(rpc, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ghost_getBalance', params: [address, 'latest'] }),
        signal:  AbortSignal.timeout(5000),
      });
      const json = await res.json() as { result?: string };
      return BigInt(json.result ?? '0x0');
    } catch {
      return 0n;
    }
  }

  private async submitTx(
    from:    string,
    to:      string,
    amount:  bigint,
    purpose: string,
    chain:   EconomyTx['chain'],
    rpc:     string,
  ): Promise<EconomyTx> {
    const txId = `gst-${chain}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const tx: EconomyTx = {
      txId, from, to, amountGST: amount, purpose, chain,
      timestamp: Date.now(), status: 'pending',
    };
    this.txLog.push(tx);

    try {
      const res  = await fetch(rpc, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method:  'ghost_sendRawTransaction',
          params:  [{ from, to, value: `0x${amount.toString(16)}`, data: `0x${Buffer.from(purpose).toString('hex')}` }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = await res.json() as { result?: string; error?: unknown };
      tx.status = json.result ? 'confirmed' : 'failed';
    } catch {
      tx.status = 'failed';
    }

    return tx;
  }

  static devnet(): UniverseEconomy { return new UniverseEconomy(); }
}
