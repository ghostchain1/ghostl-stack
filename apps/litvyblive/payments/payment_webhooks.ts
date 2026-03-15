/**
 * Payment Webhooks
 *
 * Handles incoming webhook confirmations from external payment providers
 * (Stripe, PayPal, etc.) and crypto confirmation callbacks.
 *
 * Security model:
 *  • Each provider webhook is verified with an HMAC-SHA256 signature.
 *  • Payloads are parsed and validated before any DB write.
 *  • Replayed webhooks (same provider_ref) are idempotently ignored.
 *
 * After verification, the webhook handler calls PaymentGateway.processConfirmed()
 * to credit the GhostL3 wallet and update the transaction log.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import {
  getTransaction,
  updateTransactionStatus,
  appendAuditLog,
  listTransactions,
} from './transaction_logger.js';
import { processConfirmedPayment } from './payment_gateway.js';

// ── Signature verification ────────────────────────────────────────────────────

/**
 * Verify Stripe-style webhook signature.
 * Header format: `t=<timestamp>,v1=<hex_sig>`
 */
export function verifyStripeSignature(
  rawBody:    string,
  sigHeader:  string,
  secret:     string
): boolean {
  const parts    = sigHeader.split(',');
  const tPart    = parts.find(p => p.startsWith('t='));
  const v1Part   = parts.find(p => p.startsWith('v1='));
  if (!tPart || !v1Part) return false;

  const timestamp = tPart.slice(2);
  const received  = v1Part.slice(3);
  const payload   = `${timestamp}.${rawBody}`;
  const expected  = createHmac('sha256', secret).update(payload).digest('hex');

  // Timing-safe comparison
  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(received, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Verify Generic HMAC-SHA256 webhook (PayPal, Adyen, etc.).
 * Header: raw hex HMAC of the JSON body.
 */
export function verifyHmacSignature(
  rawBody:    string,
  sigHeader:  string,
  secret:     string
): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(sigHeader,  'hex')
    );
  } catch {
    return false;
  }
}

// ── Webhook payload types ─────────────────────────────────────────────────────

export interface StripeWebhookPayload {
  type:   string;   // e.g. 'payment_intent.succeeded'
  data: {
    object: {
      id:                 string;
      amount:             number;   // cents
      currency:           string;
      metadata: {
        tx_id:            string;   // our payment_transactions.tx_id
        user_id:          string;
        wallet_address:   string;
      };
    };
  };
}

export interface CryptoConfirmPayload {
  tx_id:          string;   // our payment_transactions.tx_id
  chain_tx_hash:  string;
  gst_amount:     number;
  confirmed:      boolean;
}

export interface WebhookResult {
  accepted:   boolean;
  txId:       string | null;
  action:     string;
  details?:   string;
}

// ── Stripe handler ────────────────────────────────────────────────────────────

export async function handleStripeWebhook(
  body:      StripeWebhookPayload,
  sigHeader: string
): Promise<WebhookResult> {
  const secret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';

  if (!verifyStripeSignature(JSON.stringify(body), sigHeader, secret)) {
    return { accepted: false, txId: null, action: 'rejected', details: 'Invalid signature' };
  }

  if (body.type !== 'payment_intent.succeeded') {
    return { accepted: true, txId: null, action: 'ignored', details: `Event type ${body.type} not handled` };
  }

  const obj    = body.data.object;
  const txId   = obj.metadata?.tx_id;
  if (!txId) return { accepted: false, txId: null, action: 'rejected', details: 'Missing tx_id in metadata' };

  // Idempotency check
  const existing = getTransaction(txId);
  if (!existing) return { accepted: false, txId, action: 'rejected', details: 'Transaction not found' };
  if (existing.status === 'confirmed') {
    return { accepted: true, txId, action: 'duplicate', details: 'Already confirmed' };
  }

  // Credit the wallet
  await processConfirmedPayment(txId, obj.id);

  return { accepted: true, txId, action: 'credited' };
}

// ── Crypto wallet handler ─────────────────────────────────────────────────────

export async function handleCryptoConfirm(
  body:      CryptoConfirmPayload,
  sigHeader: string
): Promise<WebhookResult> {
  const secret = process.env['CRYPTO_WEBHOOK_SECRET'] ?? '';

  if (!verifyHmacSignature(JSON.stringify(body), sigHeader, secret)) {
    return { accepted: false, txId: null, action: 'rejected', details: 'Invalid signature' };
  }

  const { tx_id: txId, chain_tx_hash, confirmed } = body;
  const existing = getTransaction(txId);
  if (!existing) return { accepted: false, txId, action: 'rejected', details: 'Transaction not found' };

  if (!confirmed) {
    updateTransactionStatus(txId, 'failed');
    appendAuditLog(txId, 'crypto_failed', 'failed', { chain_tx_hash });
    return { accepted: true, txId, action: 'failed' };
  }

  if (existing.status === 'confirmed') {
    return { accepted: true, txId, action: 'duplicate' };
  }

  await processConfirmedPayment(txId, chain_tx_hash);
  return { accepted: true, txId, action: 'credited' };
}

// ── Generic failure / refund handler ─────────────────────────────────────────

export function handlePaymentFailed(txId: string, reason: string): WebhookResult {
  const tx = getTransaction(txId);
  if (!tx) return { accepted: false, txId, action: 'rejected', details: 'Not found' };
  if (tx.status === 'failed') return { accepted: true, txId, action: 'duplicate' };

  updateTransactionStatus(txId, 'failed');
  appendAuditLog(txId, 'payment_failed', 'failed', { reason });
  return { accepted: true, txId, action: 'failed' };
}

// ── Flagged transaction review ────────────────────────────────────────────────

export function getFlaggedTransactions(limit = 50) {
  return listTransactions({ flagged: true, limit });
}
