import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { engine } from "../matchingEngine";
import { getRelay } from "../chainRelay";
import { LimitOrder } from "../types";

const router = Router();

// ─── Validation Schemas ────────────────────────────────────────────────────

const PlaceOrderSchema = z.object({
  trader:     z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  baseToken:  z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  quoteToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  side:       z.enum(["BUY", "SELL"]),
  price:      z.string().regex(/^\d+$/),   // bigint as decimal string
  baseAmount: z.string().regex(/^\d+$/),
});

// ─── Middleware ────────────────────────────────────────────────────────────

function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Validation error", details: result.error.issues });
      return;
    }
    req.body = result.data;
    next();
  };
}

// ─── Routes ────────────────────────────────────────────────────────────────

/** POST /orders – place a limit order */
router.post("/", validate(PlaceOrderSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof PlaceOrderSchema>;
  try {
    const order = engine.placeOrder({
      trader:     body.trader,
      baseToken:  body.baseToken,
      quoteToken: body.quoteToken,
      side:       body.side,
      price:      BigInt(body.price),
      baseAmount: BigInt(body.baseAmount),
    });

    // Submit on-chain asynchronously (non-blocking for API response).
    const relay = getRelay();
    if (relay) {
      relay.submitOrder(order).then((onChainId) => {
        order.onChainId = onChainId;
      }).catch(console.error);
    }

    res.status(201).json(serializeOrder(order));
  } catch (err: any) {
    res.status(422).json({ error: err.message });
  }
});

/** DELETE /orders/:orderId – cancel */
router.delete("/:orderId", async (req: Request, res: Response) => {
  const orderId = req.params["orderId"] as string;
  const rawTrader = req.headers["x-trader-address"];
  const trader = Array.isArray(rawTrader) ? rawTrader[0] ?? "" : rawTrader ?? "";
  try {
    const order = engine.cancelOrder(orderId, trader);
    const relay = getRelay();
    if (relay && order.onChainId != null) {
      relay.cancelOrder(order.onChainId).catch(console.error);
    }
    res.json(serializeOrder(order));
  } catch (err: any) {
    res.status(422).json({ error: err.message });
  }
});

/** GET /orders/:orderId */
router.get("/:orderId", (req: Request, res: Response) => {
  const order = engine.getOrder(req.params["orderId"] as string);
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeOrder(order));
});

/** GET /orders?trader=0x… */
router.get("/", (req: Request, res: Response) => {
  const { trader } = req.query;
  if (!trader || typeof trader !== "string") {
    res.status(400).json({ error: "trader query param required" });
    return;
  }
  res.json(engine.getOpenOrders(trader).map(serializeOrder));
});

// ─── Helper ───────────────────────────────────────────────────────────────

function serializeOrder(o: LimitOrder) {
  return {
    ...o,
    price:      o.price.toString(),
    baseAmount: o.baseAmount.toString(),
    filled:     o.filled.toString(),
    onChainId:  o.onChainId?.toString(),
  };
}

export default router;
