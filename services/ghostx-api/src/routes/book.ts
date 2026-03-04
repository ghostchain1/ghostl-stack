import { Router, Request, Response } from "express";
import { engine } from "../matchingEngine";

const router = Router();

/**
 * GET /book?base=0x…&quote=0x…&depth=20
 * Returns current order book snapshot.
 */
router.get("/", (req: Request, res: Response) => {
  const { base, quote, depth } = req.query;
  if (!base || !quote) {
    res.status(400).json({ error: "base and quote query params required" });
    return;
  }
  const snap = engine.getSnapshot(
    base as string,
    quote as string,
    depth ? parseInt(depth as string, 10) : 20,
  );
  res.json(snap);
});

/**
 * GET /book/fills?limit=50
 * Recent trade history.
 */
router.get("/fills", (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const fills = engine.getRecentFills(limit).map((f) => ({
    ...f,
    baseAmount: f.baseAmount.toString(),
    price:      f.price.toString(),
  }));
  res.json(fills);
});

export default router;
