import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import {
  registerPendingLaunch,
  confirmLaunch,
  getTokenById,
  getTokenByCreator,
  listTokens,
  searchTokens,
} from '../../../launchpad/launchpad_registry.js';
import {
  createSale,
  getSaleById,
  listSalesByToken,
  listActiveSales,
  recordPurchase,
  listPurchasesByBuyer,
} from '../../../launchpad/token_sale_engine.js';
import {
  getFanRewardStatus,
  listUserHoldings,
  topFans,
} from '../../../launchpad/fan_rewards.js';
import {
  createProposal,
  getProposalById,
  listProposalsByToken,
  listActiveProposals,
  markExecuted,
  castVote,
  getVoteByUser,
  listVotesByProposal,
} from '../../../launchpad/creator_dao.js';

export const launchpadRouter = Router();

// ── Token registry ────────────────────────────────────────────────────────────

/** GET /launchpad/tokens — paginated list of all creator token launches */
launchpadRouter.get('/tokens', (_req, res) => {
  const page     = Math.max(0, Number(_req.query['page'] ?? 0));
  const pageSize = Math.min(50, Math.max(1, Number(_req.query['pageSize'] ?? 20)));
  res.json(listTokens(page, pageSize));
});

/** GET /launchpad/tokens/search?q= */
launchpadRouter.get('/tokens/search', (req, res) => {
  const q = String(req.query['q'] ?? '').trim();
  if (!q) { res.status(400).json({ error: 'Query required' }); return; }
  res.json(searchTokens(q));
});

/** GET /launchpad/tokens/:id */
launchpadRouter.get('/tokens/:id', (req, res) => {
  const token = getTokenById(String(req.params['id'] ?? ''));
  if (!token) { res.status(404).json({ error: 'Token not found' }); return; }
  res.json(token);
});

/** GET /launchpad/my-token — creator's own token */
launchpadRouter.get('/my-token', (req: AuthRequest, res) => {
  const token = getTokenByCreator(req.userId!);
  if (!token) { res.status(404).json({ error: 'No token launched yet' }); return; }
  res.json(token);
});

const launchSchema = z.object({
  name:       z.string().min(1).max(64),
  symbol:     z.string().min(1).max(12).toUpperCase(),
  maxSupply:  z.number().positive().max(1e15),
  creatorWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

/** POST /launchpad/launch — register a pending creator token launch */
launchpadRouter.post('/launch', (req: AuthRequest, res) => {
  const parsed = launchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { name, symbol, maxSupply, creatorWallet } = parsed.data;

  const existing = getTokenByCreator(req.userId!);
  if (existing) { res.status(409).json({ error: 'You already have an active creator token', token: existing }); return; }

  const record = registerPendingLaunch({
    id:            uuid(),
    creatorId:     req.userId!,
    creatorWallet,
    name,
    symbol,
    maxSupply,
  });
  res.status(201).json(record);
});

const confirmSchema = z.object({
  tokenAddress:   z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  factoryTxHash:  z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

/** POST /launchpad/tokens/:id/confirm — confirm on-chain deployment */
launchpadRouter.post('/tokens/:id/confirm', (req: AuthRequest, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const token = getTokenById(String(req.params['id'] ?? ''));
  if (!token) { res.status(404).json({ error: 'Token not found' }); return; }
  if (token.creator_id !== req.userId!) { res.status(403).json({ error: 'Not your token' }); return; }
  confirmLaunch(String(req.params['id'] ?? ''), parsed.data.tokenAddress, parsed.data.factoryTxHash);
  res.json({ success: true });
});

// ── Sales ─────────────────────────────────────────────────────────────────────

/** GET /launchpad/sales/active */
launchpadRouter.get('/sales/active', (_req, res) => {
  res.json(listActiveSales());
});

/** GET /launchpad/tokens/:tokenId/sales */
launchpadRouter.get('/tokens/:tokenId/sales', (req, res) => {
  res.json(listSalesByToken(String(req.params['tokenId'] ?? '')));
});

const createSaleSchema = z.object({
  priceGst:     z.number().positive(),
  totalForSale: z.number().positive(),
  startsAt:     z.string().datetime(),
  endsAt:       z.string().datetime(),
  chainSaleId:  z.string().optional(),
});

/** POST /launchpad/tokens/:tokenId/sales — create a new sale */
launchpadRouter.post('/tokens/:tokenId/sales', (req: AuthRequest, res) => {
  const parsed = createSaleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const token = getTokenById(String(req.params['tokenId'] ?? ''));
  if (!token) { res.status(404).json({ error: 'Token not found' }); return; }
  if (token.creator_id !== req.userId!) { res.status(403).json({ error: 'Not your token' }); return; }

  const starts = new Date(parsed.data.startsAt);
  const ends   = new Date(parsed.data.endsAt);
  if (ends <= starts) { res.status(400).json({ error: 'endsAt must be after startsAt' }); return; }

  const sale = createSale({
    id:           uuid(),
    tokenId:      String(req.params['tokenId'] ?? ''),
    creatorId:    req.userId!,
    priceGst:     parsed.data.priceGst,
    totalForSale: parsed.data.totalForSale,
    startsAt:     parsed.data.startsAt,
    endsAt:       parsed.data.endsAt,
    chainSaleId:  parsed.data.chainSaleId,
  });
  res.status(201).json(sale);
});

const purchaseSchema = z.object({
  saleId:      z.string().uuid(),
  amount:      z.number().positive(),
  buyerWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  txHash:      z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

/** POST /launchpad/buy — record a fan token purchase */
launchpadRouter.post('/buy', (req: AuthRequest, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { saleId, amount, buyerWallet, txHash } = parsed.data;

  const sale = getSaleById(saleId);
  if (!sale) { res.status(404).json({ error: 'Sale not found' }); return; }
  const now = new Date();
  if (now < new Date(sale.starts_at)) { res.status(400).json({ error: 'Sale not started' }); return; }
  if (now > new Date(sale.ends_at))   { res.status(400).json({ error: 'Sale ended' }); return; }
  if (sale.sold + amount > sale.total_for_sale) { res.status(400).json({ error: 'Insufficient supply remaining' }); return; }

  const gstSpent = sale.price_gst * amount;
  recordPurchase({ id: uuid(), saleId, buyerId: req.userId!, buyerWallet, amount, gstSpent, txHash });
  res.status(201).json({ success: true, gstSpent });
});

/** GET /launchpad/my-purchases */
launchpadRouter.get('/my-purchases', (req: AuthRequest, res) => {
  res.json(listPurchasesByBuyer(req.userId!));
});

// ── Fan rewards ───────────────────────────────────────────────────────────────

/** GET /launchpad/tokens/:tokenId/my-rewards */
launchpadRouter.get('/tokens/:tokenId/my-rewards', (req: AuthRequest, res) => {
  res.json(getFanRewardStatus(req.userId!, String(req.params['tokenId'] ?? '')));
});

/** GET /launchpad/tokens/:tokenId/top-fans */
launchpadRouter.get('/tokens/:tokenId/top-fans', (req, res) => {
  const limit = Math.min(50, Number(req.query['limit'] ?? 20));
  res.json(topFans(String(req.params['tokenId'] ?? ''), limit));
});

/** GET /launchpad/my-holdings */
launchpadRouter.get('/my-holdings', (req: AuthRequest, res) => {
  res.json(listUserHoldings(req.userId!));
});

// ── Creator DAO ───────────────────────────────────────────────────────────────

/** GET /launchpad/tokens/:tokenId/proposals */
launchpadRouter.get('/tokens/:tokenId/proposals', (req, res) => {
  res.json(listProposalsByToken(String(req.params['tokenId'] ?? '')));
});

/** GET /launchpad/tokens/:tokenId/proposals/active */
launchpadRouter.get('/tokens/:tokenId/proposals/active', (req, res) => {
  res.json(listActiveProposals(String(req.params['tokenId'] ?? '')));
});

/** GET /launchpad/proposals/:id */
launchpadRouter.get('/proposals/:id', (req, res) => {
  const p = getProposalById(String(req.params['id'] ?? ''));
  if (!p) { res.status(404).json({ error: 'Proposal not found' }); return; }
  res.json(p);
});

const proposeSchema = z.object({
  description: z.string().min(10).max(2000),
  votingDays:  z.number().int().min(1).max(30).default(7),
  chainProposalId: z.string().optional(),
});

/** POST /launchpad/tokens/:tokenId/proposals — submit a DAO proposal */
launchpadRouter.post('/tokens/:tokenId/proposals', (req: AuthRequest, res) => {
  const parsed = proposeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const token = getTokenById(String(req.params['tokenId'] ?? ''));
  if (!token) { res.status(404).json({ error: 'Token not found' }); return; }

  const db = getDb();
  const holding = (db.prepare('SELECT amount FROM fan_holdings WHERE user_id=? AND token_id=?').get(req.userId!, String(req.params['tokenId'] ?? '')) as { amount: number } | undefined)?.amount ?? 0;
  if (holding < 2000) { res.status(403).json({ error: 'Elite tier (2000+ tokens) required to propose' }); return; }

  const endsAt = new Date(Date.now() + parsed.data.votingDays * 86_400_000).toISOString();
  const proposal = createProposal({
    id:               uuid(),
    tokenId:          String(req.params['tokenId'] ?? ''),
    creatorId:        token.creator_id,
    proposerId:       req.userId!,
    description:      parsed.data.description,
    endsAt,
    chainProposalId:  parsed.data.chainProposalId,
  });
  res.status(201).json(proposal);
});

const voteSchema = z.object({
  support: z.boolean(),
  txHash: z.string().optional(),
});

/** POST /launchpad/proposals/:id/vote */
launchpadRouter.post('/proposals/:id/vote', (req: AuthRequest, res) => {
  const parsed = voteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const proposal = getProposalById(String(req.params['id'] ?? ''));
  if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return; }

  const db = getDb();
  const weight = (db.prepare('SELECT amount FROM fan_holdings WHERE user_id=? AND token_id=?').get(req.userId!, proposal.token_id) as { amount: number } | undefined)?.amount ?? 0;

  const result = castVote({
    voteId:     uuid(),
    proposalId: String(req.params['id'] ?? ''),
    voterId:    req.userId!,
    support:    parsed.data.support,
    weight,
    txHash:     parsed.data.txHash,
  });
  if (!result.success) { res.status(400).json({ error: result.error }); return; }
  res.status(201).json(result.vote);
});

/** GET /launchpad/proposals/:id/my-vote */
launchpadRouter.get('/proposals/:id/my-vote', (req: AuthRequest, res) => {
  const vote = getVoteByUser(String(req.params['id'] ?? ''), req.userId!);
  if (!vote) { res.status(404).json({ error: 'Not voted' }); return; }
  res.json(vote);
});

/** GET /launchpad/proposals/:id/votes */
launchpadRouter.get('/proposals/:id/votes', (req, res) => {
  res.json(listVotesByProposal(String(req.params['id'] ?? '')));
});

/** POST /launchpad/proposals/:id/execute */
launchpadRouter.post('/proposals/:id/execute', (req: AuthRequest, res) => {
  const proposal = getProposalById(String(req.params['id'] ?? ''));
  if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return; }
  if (new Date(proposal.ends_at) > new Date()) { res.status(400).json({ error: 'Voting still open' }); return; }
  if (proposal.executed) { res.status(409).json({ error: 'Already executed' }); return; }
  markExecuted(String(req.params['id'] ?? ''));
  const passed = proposal.votes_for > proposal.votes_against;
  res.json({ success: true, passed, votesFor: proposal.votes_for, votesAgainst: proposal.votes_against });
});
