import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import type { AuthRequest } from '../middleware/auth.js';

// ── Economy modules ────────────────────────────────────────────────────────────
import {
  recordMetrics,
  getLatestMetrics,
  aggregateMetrics,
  topCreators,
  resolveCreatorTier,
  computeScore,
} from '../../../economy/creator_metrics.js';
import {
  openSalaryCycle,
  getSalaryCycle,
  queueSalaryPayouts,
  closeSalaryCycle,
  confirmPayout,
  listCyclePayouts,
  creatorPayoutHistory,
  creatorSalaryStatus,
} from '../../../economy/creator_salary_engine.js';
import {
  openSeason,
  closeSeason,
  getActiveSeason,
  getSeason,
  upsertStanding,
  refreshStandings,
  runPromotionRelegation,
  getLeaderboard,
  getCreatorStanding,
  listSeasons,
  resolveLeagueTier,
  type LeagueTier,
} from '../../../economy/league_manager.js';
import {
  createCompetition,
  getCompetition,
  setCompetitionStatus,
  enterCompetition,
  addScore,
  scoreCompetition,
  confirmPrize,
  listCompetitions,
  listEntries,
  creatorCompetitionHistory,
  getEntryByCreator,
} from '../../../economy/competition_engine.js';
import {
  evaluateCreator,
  manualPromote,
  expirePromotions,
  getActivePromotions,
  getBoostedCreators,
  listPromotionHistory,
} from '../../../economy/promotion_system.js';

export const economyRouter = Router();

// ══════════════════════════════════════════════════════════════════════════════
// METRICS
// ══════════════════════════════════════════════════════════════════════════════

/** POST /economy/metrics  — record a metric snapshot (server-side / GhostBrain) */
economyRouter.post('/metrics', (req: AuthRequest, res) => {
  const schema = z.object({
    creator_id:      z.string(),
    period:          z.enum(['daily', 'weekly', 'monthly']),
    viewer_count:    z.number().min(0),
    gifts_received:  z.number().min(0),
    followers_gained: z.number().min(0),
    stream_hours:    z.number().min(0),
  });
  const b = schema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: b.error.flatten() });
  const snap = recordMetrics(
    b.data.creator_id, b.data.period, b.data.viewer_count,
    b.data.gifts_received, b.data.followers_gained, b.data.stream_hours,
  );
  res.json(snap);
});

/** GET /economy/metrics/:creatorId/:period — latest snapshot */
economyRouter.get('/metrics/:creatorId/:period', (req, res) => {
  const period = String(req.params['period'] ?? '') as 'daily' | 'weekly' | 'monthly';
  const snap   = getLatestMetrics(String(req.params['creatorId'] ?? ''), period);
  if (!snap) return res.status(404).json({ error: 'No metrics found' });
  res.json(snap);
});

/** GET /economy/metrics/:creatorId/:period/aggregate — aggregated totals */
economyRouter.get('/metrics/:creatorId/:period/aggregate', (req, res) => {
  const period = String(req.params['period'] ?? '') as 'daily' | 'weekly' | 'monthly';
  res.json(aggregateMetrics(String(req.params['creatorId'] ?? ''), period));
});

/** GET /economy/metrics/top/:period — top creators by score */
economyRouter.get('/metrics/top/:period', (req, res) => {
  const period = String(req.params['period'] ?? '') as 'daily' | 'weekly' | 'monthly';
  const limit  = Math.min(Number(req.query.limit ?? 50), 200);
  res.json(topCreators(period, limit));
});

// ══════════════════════════════════════════════════════════════════════════════
// SALARY ENGINE
// ══════════════════════════════════════════════════════════════════════════════

/** GET /economy/salary/:creatorId — current tier + salary amount */
economyRouter.get('/salary/:creatorId', (req, res) => {
  res.json(creatorSalaryStatus(String(req.params['creatorId'] ?? '')));
});

/** GET /economy/salary/:creatorId/history — past payouts */
economyRouter.get('/salary/:creatorId/history', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 24), 120);
  res.json(creatorPayoutHistory(String(req.params['creatorId'] ?? ''), limit));
});

/** POST /economy/salary/cycles — open a new salary cycle */
economyRouter.post('/salary/cycles', (req: AuthRequest, res) => {
  const schema = z.object({ period_label: z.string().regex(/^\d{4}-\d{2}$/) });
  const b = schema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: b.error.flatten() });
  res.json(openSalaryCycle(b.data.period_label));
});

/** GET /economy/salary/cycles/:periodLabel */
economyRouter.get('/salary/cycles/:periodLabel', (req, res) => {
  const cycle = getSalaryCycle(String(req.params['periodLabel'] ?? ''));
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  res.json(cycle);
});

/** POST /economy/salary/cycles/:cycleId/queue — queue payouts for a cycle */
economyRouter.post('/salary/cycles/:cycleId/queue', (req: AuthRequest, res) => {
  const schema = z.object({
    creators: z.array(z.object({ creator_id: z.string(), wallet: z.string() })),
  });
  const b = schema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: b.error.flatten() });
  const payouts = queueSalaryPayouts(String(req.params['cycleId'] ?? ''), b.data.creators);
  res.json({ queued: payouts.length, payouts });
});

/** GET /economy/salary/cycles/:cycleId/payouts */
economyRouter.get('/salary/cycles/:cycleId/payouts', (req, res) => {
  res.json(listCyclePayouts(String(req.params['cycleId'] ?? '')));
});

/** PATCH /economy/salary/payouts/:payoutId/confirm */
economyRouter.patch('/salary/payouts/:payoutId/confirm', (req: AuthRequest, res) => {
  const schema = z.object({ tx_hash: z.string() });
  const b = schema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: b.error.flatten() });
  confirmPayout(String(req.params['payoutId'] ?? ''), b.data.tx_hash);
  res.json({ ok: true });
});

/** POST /economy/salary/cycles/:cycleId/close */
economyRouter.post('/salary/cycles/:cycleId/close', (req: AuthRequest, res) => {
  closeSalaryCycle(String(req.params['cycleId'] ?? ''));
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// LEAGUE SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

/** GET /economy/leagues/seasons — list all seasons */
economyRouter.get('/leagues/seasons', (_req, res) => {
  res.json(listSeasons());
});

/** GET /economy/leagues/seasons/active — current active season */
economyRouter.get('/leagues/seasons/active', (_req, res) => {
  const season = getActiveSeason();
  if (!season) return res.status(404).json({ error: 'No active season' });
  res.json(season);
});

/** POST /economy/leagues/seasons — open a new season */
economyRouter.post('/leagues/seasons', (req: AuthRequest, res) => {
  const schema = z.object({
    season_name: z.string().min(1),
    starts_at:   z.string(),
    ends_at:     z.string(),
  });
  const b = schema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: b.error.flatten() });
  res.json(openSeason(b.data.season_name, b.data.starts_at, b.data.ends_at));
});

/** POST /economy/leagues/seasons/:seasonId/close */
economyRouter.post('/leagues/seasons/:seasonId/close', (req: AuthRequest, res) => {
  closeSeason(String(req.params['seasonId'] ?? ''));
  res.json({ ok: true });
});

/** POST /economy/leagues/seasons/:seasonId/promote-relegate */
economyRouter.post('/leagues/seasons/:seasonId/promote-relegate', (req: AuthRequest, res) => {
  const count = Number(req.body?.promotion_count ?? 10);
  runPromotionRelegation(String(req.params['seasonId'] ?? ''), count);
  res.json({ ok: true });
});

/** POST /economy/leagues/refresh — recompute all standings from fresh metrics */
economyRouter.post('/leagues/refresh', (req: AuthRequest, res) => {
  refreshStandings();
  res.json({ ok: true });
});

/** GET /economy/leagues/:seasonId/leaderboard/:tier */
economyRouter.get('/leagues/:seasonId/leaderboard/:tier', (req, res) => {
  const tier  = String(req.params['tier'] ?? '') as LeagueTier;
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json(getLeaderboard(String(req.params['seasonId'] ?? ''), tier, limit));
});

/** GET /economy/leagues/:seasonId/standing/:creatorId */
economyRouter.get('/leagues/:seasonId/standing/:creatorId', (req, res) => {
  const standing = getCreatorStanding(String(req.params['seasonId'] ?? ''), String(req.params['creatorId'] ?? ''));
  if (!standing) return res.status(404).json({ error: 'No standing found' });
  res.json(standing);
});

/** PATCH /economy/leagues/:seasonId/standing/:creatorId — manually set tier/score */
economyRouter.patch('/leagues/:seasonId/standing/:creatorId', (req: AuthRequest, res) => {
  const schema = z.object({ tier: z.string(), score: z.number().min(0) });
  const b = schema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: b.error.flatten() });
  const standing = upsertStanding(
    String(req.params['seasonId'] ?? ''), String(req.params['creatorId'] ?? ''),
    b.data.tier as LeagueTier, b.data.score,
  );
  res.json(standing);
});

// ══════════════════════════════════════════════════════════════════════════════
// COMPETITIONS
// ══════════════════════════════════════════════════════════════════════════════

/** GET /economy/competitions */
economyRouter.get('/competitions', (req, res) => {
  const status  = req.query.status  as string | undefined;
  const cadence = req.query.cadence as string | undefined;
  const limit   = Math.min(Number(req.query.limit ?? 50), 200);
  res.json(listCompetitions(
    status  as any,
    cadence as any,
    limit,
  ));
});

/** GET /economy/competitions/:competitionId */
economyRouter.get('/competitions/:competitionId', (req, res) => {
  const comp = getCompetition(String(req.params['competitionId'] ?? ''));
  if (!comp) return res.status(404).json({ error: 'Competition not found' });
  res.json(comp);
});

/** POST /economy/competitions */
economyRouter.post('/competitions', (req: AuthRequest, res) => {
  const schema = z.object({
    title:            z.string().min(1),
    type:             z.enum(['gift_battle', 'pk_tournament', 'engagement_contest', 'game_tournament']),
    cadence:          z.enum(['weekly', 'monthly']),
    prize_pool_gst:   z.number().min(0),
    starts_at:        z.string(),
    ends_at:          z.string(),
    max_participants: z.number().min(0).optional(),
    entry_fee_gst:    z.number().min(0).optional(),
  });
  const b = schema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: b.error.flatten() });
  const comp = createCompetition(
    b.data.title, b.data.type, b.data.cadence, b.data.prize_pool_gst,
    b.data.starts_at, b.data.ends_at,
    b.data.max_participants, b.data.entry_fee_gst,
  );
  res.status(201).json(comp);
});

/** POST /economy/competitions/:competitionId/enter */
economyRouter.post('/competitions/:competitionId/enter', (req: AuthRequest, res) => {
  const creatorId = req.userId ?? '';
  try {
    const entry = enterCompetition(String(req.params['competitionId'] ?? ''), creatorId);
    res.status(201).json(entry);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** POST /economy/competitions/:competitionId/score — add points */
economyRouter.post('/competitions/:competitionId/score', (req: AuthRequest, res) => {
  const schema = z.object({ creator_id: z.string(), points: z.number().min(0) });
  const b = schema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: b.error.flatten() });
  addScore(String(req.params['competitionId'] ?? ''), b.data.creator_id, b.data.points);
  res.json({ ok: true });
});

/** POST /economy/competitions/:competitionId/score-final — close + rank */
economyRouter.post('/competitions/:competitionId/score-final', (req: AuthRequest, res) => {
  try {
    const entries = scoreCompetition(String(req.params['competitionId'] ?? ''));
    res.json(entries);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** PATCH /economy/competitions/prizes/:entryId/confirm */
economyRouter.patch('/competitions/prizes/:entryId/confirm', (req: AuthRequest, res) => {
  const schema = z.object({ tx_hash: z.string() });
  const b = schema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: b.error.flatten() });
  confirmPrize(String(req.params['entryId'] ?? ''), b.data.tx_hash);
  res.json({ ok: true });
});

/** GET /economy/competitions/:competitionId/entries */
economyRouter.get('/competitions/:competitionId/entries', (req, res) => {
  res.json(listEntries(String(req.params['competitionId'] ?? '')));
});

/** GET /economy/competitions/:competitionId/my-entry */
economyRouter.get('/competitions/:competitionId/my-entry', (req: AuthRequest, res) => {
  const entry = getEntryByCreator(String(req.params['competitionId'] ?? ''), req.userId ?? '');
  if (!entry) return res.status(404).json({ error: 'Not entered' });
  res.json(entry);
});

/** GET /economy/competitions/creator/:creatorId/history */
economyRouter.get('/competitions/creator/:creatorId/history', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  res.json(creatorCompetitionHistory(String(req.params['creatorId'] ?? ''), limit));
});

// ══════════════════════════════════════════════════════════════════════════════
// PROMOTION SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

/** GET /economy/promotions/boosted — all currently boosted creators */
economyRouter.get('/promotions/boosted', (_req, res) => {
  res.json(getBoostedCreators());
});

/** GET /economy/promotions/:creatorId/active */
economyRouter.get('/promotions/:creatorId/active', (req, res) => {
  res.json(getActivePromotions(String(req.params['creatorId'] ?? '')));
});

/** GET /economy/promotions/:creatorId/history */
economyRouter.get('/promotions/:creatorId/history', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json(listPromotionHistory(String(req.params['creatorId'] ?? ''), limit));
});

/** POST /economy/promotions/:creatorId/evaluate — run GhostBrain evaluation */
economyRouter.post('/promotions/:creatorId/evaluate', (req: AuthRequest, res) => {
  const events = evaluateCreator(String(req.params['creatorId'] ?? ''));
  res.json({ triggered: events.length, events });
});

/** POST /economy/promotions/:creatorId/manual — admin/GhostBrain manual boost */
economyRouter.post('/promotions/:creatorId/manual', (req: AuthRequest, res) => {
  const schema = z.object({
    action:         z.enum(['boost_discovery', 'featured_slot', 'trending_badge', 'front_page', 'collaboration_suggest']),
    duration_hours: z.number().min(1).max(168).optional(),
  });
  const b = schema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: b.error.flatten() });
  const event = manualPromote(String(req.params['creatorId'] ?? ''), b.data.action, b.data.duration_hours);
  res.status(201).json(event);
});

/** POST /economy/promotions/expire — housekeeping: deactivate expired promotions */
economyRouter.post('/promotions/expire', (_req, res) => {
  const count = expirePromotions();
  res.json({ expired: count });
});

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD — single-shot creator economy overview
// ══════════════════════════════════════════════════════════════════════════════

/** GET /economy/dashboard/:creatorId — full economy summary for UI */
economyRouter.get('/dashboard/:creatorId', (req, res) => {
  const creatorId = String(req.params['creatorId'] ?? '');
  const season    = getActiveSeason();

  const salary   = creatorSalaryStatus(creatorId);
  const standing = season ? getCreatorStanding(season.season_id, creatorId) : null;
  const promoted = getActivePromotions(creatorId);
  const history  = creatorCompetitionHistory(creatorId, 5);
  const monthly  = aggregateMetrics(creatorId, 'monthly');

  res.json({
    creator_id:         creatorId,
    salary_tier:        salary.tier,
    monthly_salary_gst: salary.monthly_salary,
    performance_score:  salary.score,
    league_tier:        standing?.league_tier ?? 'bronze',
    league_rank:        standing?.rank_in_tier ?? null,
    active_promotions:  promoted.length,
    recent_competitions: history,
    metrics_monthly:    monthly,
  });
});
