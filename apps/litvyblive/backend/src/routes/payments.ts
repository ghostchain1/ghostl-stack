/**
 * Payments Router — GhostChain Global Payment Gateway
 *
 * All fiat → GST conversions settle on GhostL3 (chain_id 903).
 * Stripe webhooks require raw body access (rawBodyMiddleware applied selectively).
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import {
  initiatePayment,
  processConfirmedPayment,
  refundPayment,
} from '../../../payments/payment_gateway.js';
import {
  getTransaction,
  getUserTransactions,
  listTransactions,
  updateTransactionStatus,
  paymentStats,
} from '../../../payments/transaction_logger.js';
import { getWalletBalance } from '../../../payments/gst_wallet_service.js';
import {
  handleStripeWebhook,
  handleCryptoConfirm,
  handlePaymentFailed,
  getFlaggedTransactions,
  verifyStripeSignature,
  verifyHmacSignature,
  type StripeWebhookPayload,
} from '../../../payments/payment_webhooks.js';
import {
  convertFiatToGST,
  getGSTPrice,
  setGSTPrice,
  FIAT_RATES,
  type FiatCurrency,
} from '../../../payments/fiat_converter.js';
import { type PaymentStatus, type PaymentMethod } from '../../../payments/transaction_logger.js';

export const paymentsRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function validateAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

// ── POST /payments/initiate ───────────────────────────────────────────────────
// Start a new fiat → GST payment. Returns a PaymentIntent with txId.

paymentsRouter.post(
  '/initiate',
  asyncHandler(async (req, res) => {
    const {
      userId,
      walletAddress,
      fiatAmount,
      fiatCurrency = 'USD',
      paymentMethod,
      providerRef,
    } = req.body as {
      userId: string;
      walletAddress: string;
      fiatAmount: number;
      fiatCurrency?: FiatCurrency;
      paymentMethod: string;
      providerRef?: string;
    };

    if (!userId || !walletAddress || !fiatAmount || !paymentMethod) {
      res.status(400).json({ error: 'userId, walletAddress, fiatAmount, paymentMethod required' });
      return;
    }
    if (!validateAddress(walletAddress)) {
      res.status(400).json({ error: 'Invalid GhostL3 wallet address' });
      return;
    }
    if (fiatAmount <= 0) {
      res.status(400).json({ error: 'fiatAmount must be positive' });
      return;
    }

    const valid: FiatCurrency[] = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
    if (!valid.includes(fiatCurrency as FiatCurrency)) {
      res.status(400).json({ error: `Unsupported fiatCurrency. Use: ${valid.join(', ')}` });
      return;
    }

    const validMethods = ['credit_card', 'apple_pay', 'google_pay', 'bank_transfer', 'crypto_wallet'];
    if (!validMethods.includes(paymentMethod)) {
      res.status(400).json({ error: `Unsupported paymentMethod. Use: ${validMethods.join(', ')}` });
      return;
    }

    const intent = await initiatePayment({
      userId,
      walletAddress,
      fiatAmount,
      fiatCurrency: fiatCurrency as FiatCurrency,
      paymentMethod: paymentMethod as any,
      providerRef,
    });

    res.status(201).json({ success: true, intent });
  })
);

// ── GET /payments/rates ───────────────────────────────────────────────────────
// Current GST/fiat exchange rates.

paymentsRouter.get('/rates', (_req, res) => {
  const gstPriceUSD = getGSTPrice();
  const rates: Record<string, number> = {};
  for (const [currency, rate] of Object.entries(FIAT_RATES) as [string, number][]) {
    rates[currency] = gstPriceUSD / rate;
  }
  res.json({
    gstPriceUSD,
    platformFeePct: 0.02,
    fiatPerGST: rates,
    updatedAt: new Date().toISOString(),
  });
});

// ── POST /payments/rates/update ───────────────────────────────────────────────
// Admin endpoint: update the GST oracle price (e.g., from GhostBrain feed).

paymentsRouter.post(
  '/rates/update',
  asyncHandler(async (req, res) => {
    const { usdPerGST } = req.body as { usdPerGST: number };
    if (typeof usdPerGST !== 'number' || usdPerGST <= 0) {
      res.status(400).json({ error: 'usdPerGST must be a positive number' });
      return;
    }
    setGSTPrice(usdPerGST);
    res.json({ success: true, usdPerGST, updatedAt: new Date().toISOString() });
  })
);

// ── POST /payments/convert/preview ────────────────────────────────────────────
// Preview a fiat→GST conversion without initiating a charge.

paymentsRouter.post(
  '/convert/preview',
  asyncHandler(async (req, res) => {
    const { fiatAmount, fiatCurrency = 'USD' } = req.body as {
      fiatAmount: number;
      fiatCurrency?: FiatCurrency;
    };
    if (!fiatAmount || fiatAmount <= 0) {
      res.status(400).json({ error: 'fiatAmount required and must be positive' });
      return;
    }
    const result = convertFiatToGST(fiatAmount, fiatCurrency as FiatCurrency);
    res.json({
      fiatAmount:    result.fiatAmount,
      fiatCurrency:  result.fiatCurrency,
      usdAmount:     result.usdAmount,
      gstAmount:     result.gstAmount,
      gstWei:        result.gstWei.toString(),
      rateUsed:      result.rateUsed,
      platformFee:   `2%`,
      convertedAt:   result.convertedAt,
    });
  })
);

// ── GET /payments/balance/:wallet ─────────────────────────────────────────────
// Current GST balance for a GhostL3 wallet.

paymentsRouter.get(
  '/balance/:wallet',
  asyncHandler(async (req, res) => {
    const wallet = String(req.params['wallet'] ?? '');
    if (!validateAddress(wallet)) {
      res.status(400).json({ error: 'Invalid wallet address' });
      return;
    }
    const balance = await getWalletBalance(wallet);
    res.json(balance);
  })
);

// ── GET /payments/:txId ───────────────────────────────────────────────────────
// Fetch a single transaction by ID.

paymentsRouter.get(
  '/:txId',
  asyncHandler(async (req, res) => {
    const tx = getTransaction(String(req.params['txId'] ?? ''));
    if (!tx) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    res.json(tx);
  })
);

// ── GET /payments/user/:userId ──────────────────────────────────────────────────────────────────────────
// Paginated transaction history for a user.

paymentsRouter.get(
  '/user/:userId',
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(String(req.query['limit'] ?? '50'), 10), 200);
    const txs = getUserTransactions(String(req.params['userId'] ?? ''), limit);
    res.json({ transactions: txs, count: txs.length });
  })
);

// ── GET /payments/stats ───────────────────────────────────────────────────────
// Admin: aggregate payment stats for a date range.

paymentsRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const from = String(req.query['from'] ?? new Date(Date.now() - 86400000).toISOString());
    const to   = String(req.query['to']   ?? new Date().toISOString());
    const stats = paymentStats(from, to);
    res.json(stats);
  })
);

// ── GET /payments/flagged ─────────────────────────────────────────────────────
// Admin: list transactions flagged by fraud detection.

paymentsRouter.get(
  '/flagged',
  asyncHandler(async (req, res) => {
    const limit = parseInt(String(req.query['limit'] ?? '50'), 10);
    const flagged = getFlaggedTransactions(limit);
    res.json({ flagged, count: flagged.length });
  })
);

// ── PATCH /payments/:txId/status ──────────────────────────────────────────────
// Admin: manual status override (e.g., manually approve flagged tx).

paymentsRouter.patch(
  '/:txId/status',
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body as { status: string; reason?: string };
    const allowed = ['confirmed', 'failed', 'refunded'];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
      return;
    }
    const tx = getTransaction(String(req.params['txId'] ?? ''));
    if (!tx) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    if (status === 'refunded') {
      await refundPayment(tx.tx_id, reason ?? 'Admin refund');
    } else {
      updateTransactionStatus(tx.tx_id, status as PaymentStatus, { flaggedReason: reason });
    }
    res.json({ success: true, txId: tx.tx_id, status });
  })
);

// ── POST /payments/webhooks/stripe ────────────────────────────────────────────
// Stripe sends this with a raw body + Stripe-Signature header.
// Must NOT use JSON body-parser before this route.

paymentsRouter.post(
  '/webhooks/stripe',
  // Override JSON body-parser to get raw buffer
  (req: Request, res: Response, next: NextFunction) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      (req as any).rawBody = Buffer.concat(chunks);
      next();
    });
    req.on('error', next);
  },
  asyncHandler(async (req, res) => {
    const sigHeader = req.headers['stripe-signature'] as string;
    const rawBody   = (req as any).rawBody as Buffer;

    if (!sigHeader || !rawBody) {
      res.status(400).json({ error: 'Missing stripe-signature header or body' });
      return;
    }

    let parsed: StripeWebhookPayload;
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as StripeWebhookPayload;
    } catch {
      res.status(400).json({ error: 'Invalid webhook body' });
      return;
    }

    const result = await handleStripeWebhook(parsed, sigHeader);
    if (!result.accepted) {
      res.status(401).json({ error: 'Webhook signature verification failed' });
      return;
    }

    res.json({ received: true, action: result.action });
  })
);

// ── POST /payments/webhooks/crypto ────────────────────────────────────────────
// Crypto wallet confirmation webhook (custom HMAC).

paymentsRouter.post(
  '/webhooks/crypto',
  asyncHandler(async (req, res) => {
    const sigHeader = req.headers['x-ghost-signature'] as string;
    const bodyStr   = JSON.stringify(req.body);

    if (!sigHeader) {
      res.status(400).json({ error: 'Missing x-ghost-signature header' });
      return;
    }

    const result = await handleCryptoConfirm(req.body, sigHeader);
    if (!result.accepted) {
      res.status(401).json({ error: 'Webhook signature verification failed' });
      return;
    }

    res.json({ received: true, action: result.action });
  })
);

// ── POST /payments/webhooks/failed ────────────────────────────────────────────
// Payment provider notifies that a payment failed.

paymentsRouter.post(
  '/webhooks/failed',
  asyncHandler(async (req, res) => {
    const { txId, reason } = req.body as { txId: string; reason?: string };
    if (!txId) {
      res.status(400).json({ error: 'txId required' });
      return;
    }
    await handlePaymentFailed(txId, reason ?? 'Payment provider reported failure');
    res.json({ received: true, txId });
  })
);

// ── POST /payments/admin/list ─────────────────────────────────────────────────
// Admin: list all transactions with optional filters.

paymentsRouter.post(
  '/admin/list',
  asyncHandler(async (req, res) => {
    const {
      status,
      paymentMethod,
      userId,
      fromDate,
      toDate,
      limit = 100,
    } = req.body as {
      status?: string;
      paymentMethod?: string;
      userId?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
    };
    const txs = listTransactions({ status: status as PaymentStatus | undefined, method: paymentMethod as PaymentMethod | undefined, limit });
    res.json({ transactions: txs, count: txs.length });
  })
);

// ── Error handler ─────────────────────────────────────────────────────────────

paymentsRouter.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[payments]', err.message);
  res.status(500).json({ error: err.message ?? 'Internal payment error' });
});
