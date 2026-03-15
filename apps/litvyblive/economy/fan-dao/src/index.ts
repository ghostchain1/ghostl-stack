/**
 * Fan DAO — port 7046
 *
 * Each creator community runs its own embedded DAO.  Members propose and vote
 * on community decisions (stream schedules, content types, charity allocation,
 * exclusive events, etc.).
 *
 * Voting weight formula:
 *   weight = token_balance * 1
 *           + TIER_MULTIPLIER[tier] * 10
 *           + staked_gst / 100
 *
 * Proposals auto-resolve at vote_end if quorum is reached.
 * Results are published to the GhostBrain advisor queue for optional L3 anchoring.
 */

import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import cron from "node-cron";

const PORT = Number(process.env.PORT ?? 7046);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db    = new Pool({ connectionString: process.env.DATABASE_URL });

const app: Application = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 80, standardHeaders: true, legacyHeaders: false }));

// ── Voting weight constants ────────────────────────────────────────────────────
const TIER_MULTIPLIER: Record<string, number> = {
  bronze: 1,
  silver: 2,
  gold:   4,
  vip:    10,
};
const QUORUM_PCT   = 0.10;   // 10% of eligible weight must vote
const MIN_VOTE_HRS = 24;     // proposals are open at least 24 h
const MAX_VOTE_HRS = 168;    // max 7 days

// ── Voting power lookup ───────────────────────────────────────────────────────
async function votingPower(userId: string, creatorId: string): Promise<number> {
  const [tokensRow, memberRow, stakingRow] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM(balance),0) AS bal
       FROM token_balances tb
       JOIN creator_tokens ct ON ct.symbol = tb.token_symbol
       WHERE tb.holder_id = $1 AND ct.creator_id = $2`,
      [userId, creatorId],
    ),
    db.query(
      `SELECT tier FROM fan_memberships
       WHERE fan_id = $1 AND creator_id = $2 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [userId, creatorId],
    ),
    db.query(
      `SELECT COALESCE(SUM(staked_gst),0) AS staked
       FROM staking_positions WHERE user_id = $1 AND creator_id = $2 AND status = 'active'`,
      [userId, creatorId],
    ),
  ]);

  const tokens  = Number(tokensRow.rows[0]?.bal   ?? 0);
  const tier    = memberRow.rows[0]?.tier          ?? null;
  const staked  = Number(stakingRow.rows[0]?.staked ?? 0);

  return tokens + (tier ? (TIER_MULTIPLIER[tier] ?? 0) * 10 : 0) + Math.floor(staked / 100);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /dao/proposals/:creatorId — list proposals
app.get("/dao/proposals/:creatorId", async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.title, p.description, p.category, p.status,
              p.vote_end, p.yes_weight, p.no_weight, p.total_weight,
              p.quorum_reached, p.result, p.created_at, u.username AS proposer_name
       FROM dao_proposals p LEFT JOIN users u ON u.id = p.proposer_id
       WHERE p.creator_id = $1 ${status ? "AND p.status = $2" : ""}
       ORDER BY p.created_at DESC LIMIT 50`,
      status ? [req.params.creatorId, status] : [req.params.creatorId],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch proposals" });
  }
});

// POST /dao/proposal — create new proposal
const ProposalSchema = z.object({
  proposer_id: z.string().uuid(),
  creator_id:  z.string().uuid(),
  title:       z.string().min(5).max(120),
  description: z.string().min(10).max(2000),
  category:    z.enum(["schedule", "content", "charity", "event", "other"]),
  options:     z.array(z.string().min(1).max(80)).min(2).max(6).default(["Yes", "No"]),
  vote_hours:  z.number().int().min(MIN_VOTE_HRS).max(MAX_VOTE_HRS).default(48),
});

app.post("/dao/proposal", async (req: Request, res: Response) => {
  const parsed = ProposalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { proposer_id, creator_id, title, description, category, options, vote_hours } = parsed.data;

  // Only creator or VIP members may propose
  const power = await votingPower(proposer_id, creator_id);
  if (power === 0) return res.status(403).json({ error: "Insufficient voting power to propose" });

  const proposalId = uuidv4();
  const voteEnd    = new Date(Date.now() + vote_hours * 3_600_000);

  try {
    await db.query(
      `INSERT INTO dao_proposals
       (id, creator_id, proposer_id, title, description, category, options,
        status, vote_end, yes_weight, no_weight, total_weight, quorum_reached, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,0,0,0,false,NOW())`,
      [proposalId, creator_id, proposer_id, title, description, category,
       JSON.stringify(options), voteEnd],
    );
    res.status(201).json({ proposal_id: proposalId, vote_end: voteEnd.toISOString() });
  } catch {
    res.status(500).json({ error: "Failed to create proposal" });
  }
});

// POST /dao/vote — cast a vote
const VoteSchema = z.object({
  proposal_id: z.string().uuid(),
  voter_id:    z.string().uuid(),
  option:      z.string().min(1).max(80),  // must match one of proposal.options
});

app.post("/dao/vote", async (req: Request, res: Response) => {
  const parsed = VoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { proposal_id, voter_id, option } = parsed.data;

  try {
    const { rows: [proposal] } = await db.query(
      "SELECT * FROM dao_proposals WHERE id = $1 AND status = 'active'",
      [proposal_id],
    );
    if (!proposal) return res.status(404).json({ error: "Active proposal not found" });
    if (new Date(proposal.vote_end) < new Date())
      return res.status(400).json({ error: "Voting period has ended" });

    const opts: string[] = JSON.parse(proposal.options);
    if (!opts.includes(option)) return res.status(400).json({ error: "Invalid option" });

    const weight = await votingPower(voter_id, proposal.creator_id);
    if (weight === 0) return res.status(403).json({ error: "No voting power in this DAO" });

    // Prevent double voting
    const { rowCount: exists } = await db.query(
      "SELECT 1 FROM dao_votes WHERE proposal_id = $1 AND voter_id = $2",
      [proposal_id, voter_id],
    );
    if (exists) return res.status(409).json({ error: "Already voted" });

    await db.query(
      `INSERT INTO dao_votes (id, proposal_id, voter_id, option, weight, voted_at)
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [uuidv4(), proposal_id, voter_id, option, weight],
    );

    // Update proposal tallies
    const yesInc = option === "Yes" ? weight : 0;
    const noInc  = option === "No"  ? weight : 0;
    await db.query(
      `UPDATE dao_proposals
       SET yes_weight  = yes_weight  + $1,
           no_weight   = no_weight   + $2,
           total_weight = total_weight + $3
       WHERE id = $4`,
      [yesInc, noInc, weight, proposal_id],
    );

    res.json({ ok: true, weight_cast: weight });
  } catch {
    res.status(500).json({ error: "Failed to cast vote" });
  }
});

// GET /dao/proposal/:id — full proposal with vote breakdown
app.get("/dao/proposal/:id", async (req: Request, res: Response) => {
  try {
    const [proposalRes, votesRes] = await Promise.all([
      db.query("SELECT * FROM dao_proposals WHERE id = $1", [req.params.id]),
      db.query(
        `SELECT option, SUM(weight) AS weight, COUNT(*) AS count
         FROM dao_votes WHERE proposal_id = $1 GROUP BY option`,
        [req.params.id],
      ),
    ]);
    if (!proposalRes.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json({
      ...proposalRes.rows[0],
      options: JSON.parse(proposalRes.rows[0].options),
      breakdown: votesRes.rows,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch proposal" });
  }
});

// GET /dao/voter/:userId/power/:creatorId
app.get("/dao/voter/:userId/power/:creatorId", async (req: Request, res: Response) => {
  try {
    const power = await votingPower(req.params.userId, req.params.creatorId);
    res.json({ user_id: req.params.userId, creator_id: req.params.creatorId, voting_power: power });
  } catch {
    res.status(500).json({ error: "Failed to compute voting power" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "fan-dao", port: PORT, status: "ok" }),
);

// ── Cron: resolve expired proposals every hour ────────────────────────────────
cron.schedule("0 * * * *", async () => {
  try {
    // Fetch active proposals whose vote_end has passed
    const { rows } = await db.query(
      `SELECT p.id, p.creator_id, p.yes_weight, p.no_weight, p.total_weight
       FROM dao_proposals p
       WHERE p.status = 'active' AND p.vote_end <= NOW()`,
    );

    for (const p of rows) {
      const { rows: [poolRow] } = await db.query(
        `SELECT COALESCE(SUM(staked_gst + (token_count * 1)),0) AS eligible
         FROM staking_positions sp WHERE sp.creator_id = $1 AND sp.status = 'active'`,
        [p.creator_id],
      );
      const eligible    = Number(poolRow?.eligible ?? 1);
      const quorumMet   = p.total_weight / eligible >= QUORUM_PCT;
      const result      = quorumMet ? (p.yes_weight >= p.no_weight ? "passed" : "rejected") : "no_quorum";

      await db.query(
        `UPDATE dao_proposals SET status = 'closed', result = $1, quorum_reached = $2 WHERE id = $3`,
        [result, quorumMet, p.id],
      );

      // Notify GhostBrain advisor for optional L3 anchoring
      await redis.publish("dao:proposal:resolved", JSON.stringify({
        proposal_id: p.id, creator_id: p.creator_id, result, quorum_met: quorumMet,
      }));
    }
    if (rows.length) console.log(`[fan-dao] resolved ${rows.length} proposals`);
  } catch (err) {
    console.error("[fan-dao] resolve cron error", err);
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[fan-dao]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[fan-dao] listening on :${PORT}`));
export default app;
