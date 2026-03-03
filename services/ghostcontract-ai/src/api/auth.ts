/**
 * GhostContractAI — Job API Auth Middleware
 *
 * Validates the X-Ghostbrain-Secret header (shared-secret auth).
 * In production, replace with JWT validation or mTLS.
 */

import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";

const SHARED_SECRET =
  process.env.GHOSTBRAIN_SHARED_SECRET ?? "";

const DEV_MODE = process.env.NODE_ENV === "development";

export function jobApiAuth(req: Request, res: Response, next: NextFunction): void {
  // Dev-mode: allow through without secret (still logs a warning)
  if (DEV_MODE && !SHARED_SECRET) {
    logger.warn("jobApiAuth: no GHOSTBRAIN_SHARED_SECRET set — dev mode passthrough", {
      ip: req.ip,
      path: req.path,
    });
    next();
    return;
  }

  const header = req.headers["x-ghostbrain-secret"];
  if (!header || header !== SHARED_SECRET) {
    logger.warn("jobApiAuth: unauthorized request", {
      ip: req.ip,
      path: req.path,
      hasHeader: !!header,
    });
    res.status(401).json({ error: "Unauthorized — invalid X-Ghostbrain-Secret" });
    return;
  }

  next();
}
