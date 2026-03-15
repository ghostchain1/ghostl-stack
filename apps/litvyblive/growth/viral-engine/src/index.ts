import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";

const PORT = Number(process.env.PORT ?? 7034);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Clip processor URL (internal service for FFmpeg/clip extraction)
const CLIP_PROCESSOR_URL = process.env.CLIP_PROCESSOR_URL ?? "http://localhost:7940";

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));

// ── Schemas ───────────────────────────────────────────────────────────────────
const ClipRequestSchema = z.object({
  stream_id:    z.string().uuid(),
  host_id:      z.string().uuid(),
  start_offset: z.number().int().min(0),    // seconds into the stream
  duration_sec: z.number().int().min(5).max(60).default(30),
  title:        z.string().max(100).optional(),
  auto_share:   z.boolean().default(false), // push share event on completion
});

const ShareSchema = z.object({
  clip_id:   z.string().uuid(),
  platforms: z.array(z.enum(["ghostsocial", "internal"])).min(1),
  message:   z.string().max(280).optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /clips — request clip generation
app.post("/clips", async (req: Request, res: Response) => {
  const parsed = ClipRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const d = parsed.data;
  const id = uuidv4();
  try {
    await db.query(
      `INSERT INTO viral_clips (id, stream_id, host_id, start_offset, duration_sec, title, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',NOW())`,
      [id, d.stream_id, d.host_id, d.start_offset, d.duration_sec, d.title ?? null],
    );

    // Dispatch to clip processor asynchronously
    axios.post(`${CLIP_PROCESSOR_URL}/process`, {
      clip_id: id, stream_id: d.stream_id,
      start_offset: d.start_offset, duration_sec: d.duration_sec,
    }).catch((err: Error) => console.error("[viral-engine] clip processor error:", err.message));

    // Publish clip created event
    await redis.publish("clip:created", JSON.stringify({ clip_id: id, host_id: d.host_id, auto_share: d.auto_share }));

    res.status(202).json({ clip_id: id, status: "pending" });
  } catch {
    res.status(500).json({ error: "Failed to queue clip" });
  }
});

// GET /clips/:id — get clip status
app.get("/clips/:id", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM viral_clips WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Clip not found" });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch clip" });
  }
});

// GET /clips — list clips for a host
app.get("/clips", async (req: Request, res: Response) => {
  const host_id = req.query.host_id as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  try {
    const { rows } = await db.query(
      `SELECT * FROM viral_clips ${host_id ? "WHERE host_id = $1" : ""} ORDER BY created_at DESC LIMIT ${limit}`,
      host_id ? [host_id] : [],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch clips" });
  }
});

// POST /clips/:id/ready — callback from clip processor when encoding is done
app.post("/clips/:id/ready", async (req: Request, res: Response) => {
  const Schema = z.object({ cdn_url: z.string().url(), thumbnail_url: z.string().url().optional() });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const { rows, rowCount } = await db.query(
      `UPDATE viral_clips SET status = 'ready', cdn_url = $1, thumbnail_url = $2, completed_at = NOW()
       WHERE id = $3 RETURNING host_id`,
      [parsed.data.cdn_url, parsed.data.thumbnail_url ?? null, req.params.id],
    );
    if (!rowCount) return res.status(404).json({ error: "Clip not found" });

    await redis.publish("clip:ready", JSON.stringify({
      clip_id: req.params.id,
      host_id: rows[0].host_id,
      cdn_url: parsed.data.cdn_url,
    }));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to mark clip ready" });
  }
});

// POST /clips/share — share a clip to platforms
app.post("/clips/share", async (req: Request, res: Response) => {
  const parsed = ShareSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { clip_id, platforms, message } = parsed.data;
  try {
    const { rows } = await db.query(
      `SELECT cdn_url, host_id FROM viral_clips WHERE id = $1 AND status = 'ready'`,
      [clip_id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Clip not ready or not found" });

    // Publish share event; social adapters consume from Redis
    await redis.publish("clip:share", JSON.stringify({
      clip_id, platforms, message: message ?? "", cdn_url: rows[0].cdn_url, host_id: rows[0].host_id,
    }));

    await db.query(
      `INSERT INTO clip_shares (id, clip_id, platforms, message, created_at)
       VALUES ($1,$2,$3,$4,NOW())`,
      [uuidv4(), clip_id, platforms.join(","), message ?? null],
    );

    res.json({ ok: true, platforms });
  } catch {
    res.status(500).json({ error: "Failed to share clip" });
  }
});

// GET /highlights — top clips by view count
app.get("/highlights", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  try {
    const { rows } = await db.query(
      `SELECT * FROM viral_clips WHERE status = 'ready' ORDER BY view_count DESC LIMIT $1`,
      [limit],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch highlights" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "viral-engine", port: PORT, status: "ok" }),
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[viral-engine]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[viral-engine] listening on :${PORT}`));
export default app;
