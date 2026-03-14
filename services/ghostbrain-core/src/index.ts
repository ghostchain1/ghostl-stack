/**
 * index.ts
 *
 * GhostBrain Core — entry point
 * Port 9100
 */

import express, { type Request, type Response, type NextFunction } from "express";
import pino from "pino";
import signalsRouter from "./routes/signals.js";
import thinkRouter from "./routes/think.js";

const PORT    = parseInt(process.env["PORT"] ?? "9100", 10);
const SERVICE = "ghostbrain-core";

const log = pino({
  name: SERVICE,
  level: process.env["LOG_LEVEL"] ?? "info",
  transport: process.env["NODE_ENV"] !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

const app = express();
app.use(express.json({ limit: "256kb" }));

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  next();
});
app.options("*", (_req: Request, res: Response) => res.sendStatus(204));

// ── Request logger ────────────────────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  log.info({ method: req.method, url: req.url }, "→");
  next();
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: SERVICE, port: PORT, uptime: process.uptime() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/signals", signalsRouter);
app.use("/think",   thinkRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, error: "not found" });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error({ err }, "unhandled error");
  res.status(500).json({ ok: false, error: "internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  log.info(`${SERVICE} listening on :${PORT}`);
});

export default app;
