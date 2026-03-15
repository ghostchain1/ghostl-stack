import { Request, Response, NextFunction } from 'express';

const windowMs = 60_000; // 1 minute
const maxRequests = 120;
const hits = new Map<string, { count: number; reset: number }>();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const record = hits.get(key);

  if (!record || now > record.reset) {
    hits.set(key, { count: 1, reset: now + windowMs });
    next();
    return;
  }

  record.count++;
  if (record.count > maxRequests) {
    res.status(429).json({ error: 'Rate limit exceeded. Slow down.' });
    return;
  }
  next();
}
