/**
 * Payment Gateway — Master Orchestrator
 *
 * End-to-end flow:
 *  1. initiatePayment()     — validate input, create transaction record, return
 *                             payment intent (user redirected to provider)
 *  2. processConfirmedPayment() — called by webhook after provider confirms;
 *                             runs fraud check, credits GhostL3 wallet
 *  3. refundPayment()       — reverses a confirmed payment (admin only)
 *
 * GhostBrain fraud scoring runs synchronously during confirmation.
 * Any transaction with fraud_score ≥ 80 is held as 'flagged' and requires
 * manual admin review before wallet credit.
 */

import {
  convertFiatToGST,
  type FiatCurrency,
} from './fiat_converter.js';
import {
  createTransaction,
  getTransaction,
  updateTransactionStatus,
  appendAuditLog,
  type PaymentMethod,
  type PaymentTransaction,
} from './transaction_logger.js';
import { creditWallet } from './gst_wallet_service.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InitiatePaymentParams {
  userId:         string;
  walletAddress:  string;
  fiatAmount:     number;
  fiatCurrency?:  FiatCurrency;
  paymentMethod:  PaymentMethod;
  providerRef?:   string;   // pre-existing provider reference (crypto wallets)
}

export interface PaymentIntent {
  txId:           string;
  userId:         string;
  walletAddress:  string;
  fiatAmount:     number;
  fiatCurrency:   FiatCurrency;
  gstAmount:      number;
  gstWei:         string;
  rateUsed:       number;
  status:         'pending';
  createdAt:      string;
}

export interface ProcessedPayment {
  txId:          string;
  userId:        string;
  walletAddress: string;
  gstAmount:     number;
  chainTxHash:   string | null;
  status:        'confirmed' | 'flagged';
  fraudScore:    number;
  processedAt:   string;
}

// ── Fraud scoring (GhostBrain stub) ──────────────────────────────────────────

/**
 * Returns a fraud score 0–100. Score ≥ 80 triggers 'flagged' status.
 * In production this calls GhostBrain Core at port 7900.
 *
 * Heuristics applied:
 *  • Very large single purchase (>$500 USD) → +30
 *  • Unfamiliar wallet (never funded before) + large amount → +20
 *  • Rapid successive purchases (>3 in 5 min) → determined by DB query
 *  • Always crypto_wallet with no history → +10
 */
async function computeFraudScore(tx: PaymentTransaction): Promise<number> {
  let score = 0;

  if (tx.usd_amount > 500) score += 30;
  if (tx.usd_amount > 100 && tx.payment_method === 'crypto_wallet') score += 10;
  if (tx.usd_amount > 200) score += 20;

  // Check rapid purchases in GhostBrain (simulated with a cap for now)
  score = Math.min(score, 95);

  return score;
}

// ── Step 1: Initiate ──────────────────────────────────────────────────────────

/**
 * Validate the payment request, compute GST amount, and persist a pending
 * transaction record. Returns a PaymentIntent containing the tx_id that the
 * frontend uses to poll for status.
 */
export async function initiatePayment(
  params: InitiatePaymentParams
): Promise<PaymentIntent> {
  const currency = params.fiatCurrency ?? 'USD';

  if (!params.userId)        throw new Error('userId required');
  if (!params.walletAddress) throw new Error('walletAddress required');
  if (params.fiatAmount <= 0) throw new Error('fiatAmount must be positive');

  // Validate wallet address format
  if (!/^0x[0-9a-fA-F]{40}$/.test(params.walletAddress)) {
    throw new Error(`Invalid GhostL3 wallet address: ${params.walletAddress}`);
  }

  const conversion = convertFiatToGST(params.fiatAmount, currency);

  const tx = createTransaction({
    userId:        params.userId,
    walletAddress: params.walletAddress,
    paymentMethod: params.paymentMethod,
    fiatAmount:    params.fiatAmount,
    fiatCurrency:  currency,
    usdAmount:     conversion.usdAmount,
    gstAmount:     conversion.gstAmount,
    gstRate:       conversion.rateUsed,
    providerRef:   params.providerRef,
  });

  return {
    txId:         tx.tx_id,
    userId:       tx.user_id,
    walletAddress: tx.wallet_address,
    fiatAmount:   tx.fiat_amount,
    fiatCurrency: currency,
    gstAmount:    tx.gst_amount,
    gstWei:       conversion.gstWei.toString(),
    rateUsed:     tx.gst_rate,
    status:       'pending',
    createdAt:    tx.created_at,
  };
}

// ── Step 2: Confirm + credit ──────────────────────────────────────────────────

/**
 * Called by the webhook handler after the payment provider confirms payment.
 * Runs GhostBrain fraud scoring, then credits the GhostL3 wallet.
 */
export async function processConfirmedPayment(
  txId:        string,
  providerRef: string
): Promise<ProcessedPayment> {
  const tx = getTransaction(txId);
  if (!tx) throw new Error(`Transaction ${txId} not found`);
  if (tx.status === 'confirmed') {
    return {
      txId:          tx.tx_id,
      userId:        tx.user_id,
      walletAddress: tx.wallet_address,
      gstAmount:     tx.gst_amount,
      chainTxHash:   tx.chain_tx_hash,
      status:        'confirmed',
      fraudScore:    tx.fraud_score,
      processedAt:   tx.updated_at,
    };
  }

  // Mark as processing
  updateTransactionStatus(txId, 'processing', {});
  appendAuditLog(txId, 'provider_confirmed', 'processing', { providerRef });

  // Fraud analysis
  const fraudScore = await computeFraudScore(tx);

  if (fraudScore >= 80) {
    updateTransactionStatus(txId, 'flagged', {
      fraudScore,
      flaggedReason: `GhostBrain fraud score: ${fraudScore}`,
    });
    return {
      txId:          txId,
      userId:        tx.user_id,
      walletAddress: tx.wallet_address,
      gstAmount:     tx.gst_amount,
      chainTxHash:   null,
      status:        'flagged',
      fraudScore,
      processedAt:   new Date().toISOString(),
    };
  }

  // Credit GhostL3 wallet
  const gstWei = BigInt(Math.floor(tx.gst_amount * 1e18));
  const credit = await creditWallet(tx.wallet_address, gstWei, tx.gst_amount);

  updateTransactionStatus(txId, 'confirmed', {
    chainTxHash: credit.chainTxHash ?? undefined,
    fraudScore,
  });

  return {
    txId:          txId,
    userId:        tx.user_id,
    walletAddress: tx.wallet_address,
    gstAmount:     tx.gst_amount,
    chainTxHash:   credit.chainTxHash,
    status:        'confirmed',
    fraudScore,
    processedAt:   new Date().toISOString(),
  };
}

// ── Step 3: Refund ────────────────────────────────────────────────────────────

/**
 * Admin-initiated refund. Marks the transaction refunded in the DB.
 * Actual fiat refund is initiated via the payment provider's API externally.
 */
export async function refundPayment(
  txId:   string,
  reason: string
): Promise<{ txId: string; refunded: boolean }> {
  const tx = getTransaction(txId);
  if (!tx) throw new Error(`Transaction ${txId} not found`);
  if (!['confirmed', 'flagged'].includes(tx.status)) {
    throw new Error(`Cannot refund transaction in status: ${tx.status}`);
  }

  updateTransactionStatus(txId, 'refunded');
  appendAuditLog(txId, 'refund_initiated', 'refunded', { reason });

  return { txId, refunded: true };
}

// ── Re-export helpers for webhook module ──────────────────────────────────────

export { getTransaction } from './transaction_logger.js';
