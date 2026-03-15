/**
 * Marketing API Router
 * Base: /marketing
 *
 * Sections:
 *   GET  /viral/trending                     — trending creators list
 *   POST /viral/evaluate                     — evaluate a signal for a creator
 *   DEL  /viral/expire                       — expire stale trending scores
 *   GET  /viral/events/:creatorId            — raw viral events for a creator
 *
 *   GET  /campaigns                          — list campaigns (filters: status, creatorId)
 *   POST /campaigns                          — create a campaign
 *   GET  /campaigns/:id                      — get a single campaign
 *   PATCH /campaigns/:id/status              — update status
 *   POST /campaigns/:id/distribute           — blast to all social channels
 *   GET  /campaigns/:id/reach                — channel reach summary
 *   GET  /campaigns/creator/:creatorId       — campaigns for a creator
 *
 *   GET  /social/:creatorId                  — creator's distribution history
 *   GET  /social/campaign/:id                — all distributions for a campaign
 *
 *   GET  /analytics/roi/:campaignId          — campaign ROI
 *   GET  /analytics/roi                      — all campaign ROIs
 *   GET  /analytics/growth                   — platform growth summary (query: from, to)
 *   GET  /analytics/snapshots                — growth snapshots list
 *
 *   POST /ai/cycle                           — manually trigger full AI marketing cycle
 *   POST /ai/auto-launch                     — auto-launch viral campaigns
 *   GET  /ai/status                          — current AI marketing status
 */

import { Router, type Request, type Response } from 'express';
import {
  evaluateSignal,
  getTrendingCreators,
  getViralEvents,
  expireTrending,
  type ViralSignal,
} from '../../../marketing/viral_detector.js';
import {
  createCampaign,
  getCampaign,
  updateCampaignStatus,
  listCampaigns,
  type CampaignType,
  type CampaignStatus,
} from '../../../marketing/campaign_manager.js';
import {
  distributeToAll,
  creatorDistributions,
  listDistributions,
  channelReachSummary,
} from '../../../marketing/social_distribution.js';
import {
  computeCampaignROI,
  allCampaignROIs,
  growthSummary,
  listSnapshots,
} from '../../../marketing/growth_analytics.js';
import { marketingAI } from '../../../marketing/marketing_ai.js';

export const marketingRouter = Router();

// ── Viral detection ───────────────────────────────────────────────────────────

marketingRouter.get('/viral/trending', async (_req: Request, res: Response) => {
  const limit = Number(_req.query['limit'] ?? 20);
  const creators = await getTrendingCreators(limit);
  res.json({ creators });
});

marketingRouter.post('/viral/evaluate', async (req: Request, res: Response) => {
  const { creatorId, signal, value } = req.body as {
    creatorId: string; signal: ViralSignal; value: number;
  };
  if (!creatorId || !signal || value === undefined) {
    res.status(400).json({ error: 'creatorId, signal and value required' });
    return;
  }
  const event = await evaluateSignal(creatorId, signal, value);
  res.json({ triggered: event !== null, event });
});

marketingRouter.delete('/viral/expire', (_req: Request, res: Response) => {
  const windowMinutes = Number(_req.query['window'] ?? 60);
  expireTrending(windowMinutes);
  res.json({ ok: true, windowMinutes });
});

marketingRouter.get('/viral/events/:creatorId', async (req: Request, res: Response) => {
  const events = await getViralEvents(String(req.params['creatorId'] ?? ''), 50);
  res.json({ events });
});

// ── Campaigns ─────────────────────────────────────────────────────────────────

marketingRouter.get('/campaigns', (_req: Request, res: Response) => {
  const { status, creatorId, limit } = _req.query as {
    status?: CampaignStatus; creatorId?: string; limit?: string;
  };
  const campaigns = listCampaigns({
    status,
    creatorId,
    limit: limit ? Number(limit) : 50,
  });
  res.json({ campaigns });
});

marketingRouter.post('/campaigns', async (req: Request, res: Response) => {
  const { creatorId, type, title, description, budgetGst, durationHours } = req.body as {
    creatorId?: string; type: CampaignType; title: string;
    description: string; budgetGst: number; durationHours?: number;
  };
  if (!type || !title || !description || budgetGst === undefined) {
    res.status(400).json({ error: 'type, title, description, budgetGst required' });
    return;
  }
  try {
    const campaign = await createCampaign({
      creatorId: creatorId ?? null,
      type,
      title,
      description,
      budgetGst,
      durationHours: durationHours ?? 24,
    });
    res.status(201).json({ campaign });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

marketingRouter.get('/campaigns/creator/:creatorId', (_req: Request, res: Response) => {
  const campaigns = listCampaigns({ creatorId: String(_req.params['creatorId'] ?? '') });
  res.json({ campaigns });
});

marketingRouter.get('/campaigns/:id', (req: Request, res: Response) => {
  const campaign = getCampaign(String(req.params['id'] ?? ''));
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ campaign });
});

marketingRouter.patch('/campaigns/:id/status', (req: Request, res: Response) => {
  const { status } = req.body as { status: CampaignStatus };
  if (!status) { res.status(400).json({ error: 'status required' }); return; }
  try {
    const campaign = updateCampaignStatus(String(req.params['id'] ?? ''), status);
    res.json({ campaign });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

marketingRouter.post('/campaigns/:id/distribute', async (req: Request, res: Response) => {
  const campaign = getCampaign(String(req.params['id'] ?? ''));
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
  const { streamTitle } = req.body as { streamTitle?: string };
  try {
    const distributions = await distributeToAll({
      campaignId:  campaign.campaign_id,
      creatorId:   campaign.creator_id ?? '',
      streamTitle: streamTitle ?? campaign.title,
    });
    res.json({ distributions, count: distributions.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

marketingRouter.get('/campaigns/:id/reach', (req: Request, res: Response) => {
  const summary = channelReachSummary(String(req.params['id'] ?? ''));
  res.json({ summary });
});

// ── Social distributions ──────────────────────────────────────────────────────

marketingRouter.get('/social/:creatorId', async (req: Request, res: Response) => {
  const limit = Number(req.query['limit'] ?? 30);
  const distributions = await creatorDistributions(String(req.params['creatorId'] ?? ''), limit);
  res.json({ distributions });
});

marketingRouter.get('/social/campaign/:id', (req: Request, res: Response) => {
  const distributions = listDistributions(String(req.params['id'] ?? ''));
  res.json({ distributions });
});

// ── Analytics ─────────────────────────────────────────────────────────────────

marketingRouter.get('/analytics/roi/:campaignId', (req: Request, res: Response) => {
  const roi = computeCampaignROI(String(req.params['campaignId'] ?? ''));
  if (!roi) { res.status(404).json({ error: 'Campaign not found' }); return; }
  res.json({ roi });
});

marketingRouter.get('/analytics/roi', (_req: Request, res: Response) => {
  const rois = allCampaignROIs();
  res.json({ rois });
});

marketingRouter.get('/analytics/growth', (_req: Request, res: Response) => {
  const { from, to } = _req.query as { from?: string; to?: string };
  const now    = new Date().toISOString();
  const sevenD = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const summary = growthSummary(from ?? sevenD, to ?? now);
  res.json({ summary });
});

marketingRouter.get('/analytics/snapshots', (_req: Request, res: Response) => {
  const limit = Number(_req.query['limit'] ?? 30);
  const snapshots = listSnapshots(limit);
  res.json({ snapshots });
});

// ── AI orchestration ──────────────────────────────────────────────────────────

marketingRouter.post('/ai/cycle', async (_req: Request, res: Response) => {
  try {
    const result = await marketingAI.runMarketingCycle();
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

marketingRouter.post('/ai/auto-launch', async (_req: Request, res: Response) => {
  const budgetGst = Number(_req.query['budget'] ?? 500);
  try {
    const campaigns = await marketingAI.launchViralCampaigns();
    res.json({ launched: campaigns.length, campaigns });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

marketingRouter.get('/ai/status', async (_req: Request, res: Response) => {
  const status = await marketingAI.getStatus();
  res.json({ status });
});
