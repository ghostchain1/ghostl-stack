/**
 * GST Wallet Service
 *
 * Credits GhostL3 wallets with GST after a confirmed fiat payment.
 * All on-chain interactions target GhostL3 exclusively (chain_id 903).
 *
 * Uses ghost-sdk-core (ethers-free) for GhostL3 JSON-RPC calls.
 * In production the private key is injected from HashiCorp Vault via the
 * WALLET_CREDIT_PK environment variable — never hardcoded.
 */

import { getDb } from '../backend/src/db/index.js';

// ── Chain constants ───────────────────────────────────────────────────────────

const L3_CHAIN_ID = 903;
const L3_RPC      = process.env['GHOST_L3_RPC']      ?? 'http://localhost:7270';
const GST_ADDRESS = process.env['GST_CONTRACT_L3']   ?? '0x5FbDB2315678afecb367f032d93F642f64180aa3';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreditResult {
  walletAddress:  string;
  gstAmount:      number;
  gstWei:         string;
  chainTxHash:    string | null;  // null when in simulation mode
  chainId:        number;
  credited:       boolean;
  creditedAt:     string;
}

export interface WalletBalance {
  walletAddress:  string;
  gstBalance:     number;
  gstWei:         string;
  chainId:        number;
  fetchedAt:      string;
}

// ── RPC helpers ───────────────────────────────────────────────────────────────

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(L3_RPC, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`GhostL3 RPC error: ${res.status}`);
  const json = await res.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`GhostL3 RPC: ${json.error.message}`);
  return json.result;
}

/** GRC20 `transfer(to, amount)` function selector */
function encodeTransfer(to: string, amountWei: bigint): string {
  const selector    = '0xa9059cbb'; // transfer(address,uint256)
  const paddedTo    = to.replace('0x', '').padStart(64, '0');
  const paddedAmt   = amountWei.toString(16).padStart(64, '0');
  return selector + paddedTo + paddedAmt;
}

// ── Credit wallet ─────────────────────────────────────────────────────────────

/**
 * Transfer `gstWei` GST to `walletAddress` on GhostL3.
 *
 * When PAYMENT_SIMULATION_MODE=true (dev/test) the transfer is logged but
 * not sent on-chain, and a fake tx hash is returned.
 */
export async function creditWallet(
  walletAddress: string,
  gstWei:        bigint,
  gstAmount:     number
): Promise<CreditResult> {
  const simMode   = process.env['PAYMENT_SIMULATION_MODE'] === 'true';
  const now       = new Date().toISOString();

  if (!walletAddress.startsWith('0x') || walletAddress.length !== 42) {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }
  if (gstWei <= 0n) {
    throw new Error('GST credit amount must be positive');
  }

  // Record pending credit in DB
  recordPendingCredit(walletAddress, gstAmount, now);

  let chainTxHash: string | null = null;

  if (simMode) {
    // Dev mode: simulate a successful credit
    chainTxHash = `0xsim_${Date.now().toString(16)}`;
  } else {
    try {
      const data = encodeTransfer(walletAddress, gstWei);
      const result = await rpcCall('ghost_sendTransaction', [{
        from:     process.env['CREDIT_WALLET_ADDRESS'],
        to:       GST_ADDRESS,
        data,
        chainId:  `0x${L3_CHAIN_ID.toString(16)}`,
        gas:      '0x15F90', // 90_000 gas
      }]);
      chainTxHash = result as string;
    } catch (err) {
      markCreditFailed(walletAddress, now, String(err));
      throw err;
    }
  }

  markCreditConfirmed(walletAddress, gstAmount, chainTxHash!, now);

  return {
    walletAddress,
    gstAmount,
    gstWei:      gstWei.toString(),
    chainTxHash,
    chainId:     L3_CHAIN_ID,
    credited:    true,
    creditedAt:  now,
  };
}

// ── Balance query ─────────────────────────────────────────────────────────────

/**
 * Query a wallet's GST balance on GhostL3.
 */
export async function getWalletBalance(walletAddress: string): Promise<WalletBalance> {
  const simMode = process.env['PAYMENT_SIMULATION_MODE'] === 'true';

  if (simMode) {
    // Return cached balance from DB
    const db = getDb();
    const row = db.prepare(`
      SELECT COALESCE(SUM(gst_amount), 0) as total
      FROM wallet_credits
      WHERE wallet_address = ? AND status = 'confirmed'
    `).get(walletAddress) as { total: number };

    return {
      walletAddress,
      gstBalance: row.total,
      gstWei:     BigInt(Math.floor(row.total * 1e18)).toString(),
      chainId:    L3_CHAIN_ID,
      fetchedAt:  new Date().toISOString(),
    };
  }

  // GRC20: balanceOf(address) → 0x70a08231
  const paddedAddr = walletAddress.replace('0x', '').padStart(64, '0');
  const data       = `0x70a08231${paddedAddr}`;
  const result     = await rpcCall('ghost_call', [{
    to:   GST_ADDRESS,
    data,
  }, 'latest']);

  const balWei  = BigInt(result as string);
  const balance = Number(balWei) / 1e18;

  return {
    walletAddress,
    gstBalance: balance,
    gstWei:     balWei.toString(),
    chainId:    L3_CHAIN_ID,
    fetchedAt:  new Date().toISOString(),
  };
}

// ── DB persistence helpers ────────────────────────────────────────────────────

function recordPendingCredit(wallet: string, gstAmount: number, now: string): void {
  getDb().prepare(`
    INSERT INTO wallet_credits
      (credit_id, wallet_address, gst_amount, status, chain_tx_hash, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', NULL, ?, ?)
  `).run(crypto.randomUUID(), wallet, gstAmount, now, now);
}

function markCreditConfirmed(wallet: string, gstAmount: number, txHash: string, now: string): void {
  getDb().prepare(`
    UPDATE wallet_credits
    SET status = 'confirmed', chain_tx_hash = ?, updated_at = ?
    WHERE wallet_address = ? AND gst_amount = ? AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1
  `).run(txHash, now, wallet, gstAmount);
}

function markCreditFailed(wallet: string, now: string, reason: string): void {
  getDb().prepare(`
    UPDATE wallet_credits
    SET status = 'failed', updated_at = ?
    WHERE wallet_address = ? AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1
  `).run(now, wallet);
  console.error(`[GSTWalletService] Credit failed for ${wallet}: ${reason}`);
}
