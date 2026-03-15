/**
 * HMAC-SHA256 request authentication middleware.
 *
 * Reads GHOST_SWARM_SECRET_KEY from the environment.
 * When GHOST_SWARM_MODE=dev (default) auth is bypassed.
 * When GHOST_SWARM_MODE=prod every POST/PUT/DELETE must include:
 *   X-Ghost-Signature: sha256=<hmac-hex>
 *   X-Ghost-Timestamp: <unix-seconds>
 *
 * Signature is HMAC-SHA256(key, `${timestamp}:${rawBody}`).
 * Requests with a timestamp skew > 60 s are rejected.
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

const MODE       = process.env["GHOST_SWARM_MODE"] ?? "dev";
const SECRET_KEY = process.env["GHOST_SWARM_SECRET_KEY"] ?? "";
const MAX_SKEW_S = 60;

export function hmacAuth(req: Request, res: Response, next: NextFunction): void {
  if (MODE !== "prod") {
    next();
    return;
  }

  if (!SECRET_KEY) {
    res.status(500).json({ error: "GHOST_SWARM_SECRET_KEY not configured" });
    return;
  }

  const sig = req.headers["x-ghost-signature"] as string | undefined;
  const ts  = req.headers["x-ghost-timestamp"]  as string | undefined;

  if (!sig || !ts) {
    res.status(401).json({ error: "Missing authentication headers" });
    return;
  }

  const tsNum = parseInt(ts, 10);
  if (isNaN(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > MAX_SKEW_S) {
    res.status(401).json({ error: "Request timestamp out of acceptable range" });
    return;
  }

  const rawBody = JSON.stringify(req.body) ?? "";
  const expected = "sha256=" + createHmac("sha256", SECRET_KEY)
    .update(`${ts}:${rawBody}`)
    .digest("hex");

  let sigBuf: Buffer, expBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig);
    expBuf = Buffer.from(expected);
  } catch {
    res.status(401).json({ error: "Invalid signature format" });
    return;
  }

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  next();
}
