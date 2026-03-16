import { Router } from 'express';
import { EventSystem }     from '../../events/EventSystem.js';
import { UniverseEconomy } from '../../economy/UniverseEconomy.js';

export function eventsRouter(events: EventSystem, economy: UniverseEconomy): Router {
  const router = Router();

  /** POST /events — create an event */
  router.post('/', (req, res) => {
    const { name, worldId, type, hostAddress, ticketPriceGST, maxAttendees } = req.body as {
      name?: string; worldId?: string; type?: string;
      hostAddress?: string; ticketPriceGST?: string; maxAttendees?: number;
    };
    if (!name || !worldId || !type || !hostAddress) {
      res.status(400).json({ error: 'name, worldId, type, hostAddress required' });
      return;
    }
    const event = events.createEvent(
      name, worldId, type as never, hostAddress,
      ticketPriceGST ? BigInt(ticketPriceGST) : 0n,
      maxAttendees ?? 500,
    );
    res.status(201).json({ event: serializeEvent(event) });
  });

  /** GET /events — upcoming events */
  router.get('/', (req, res) => {
    const worldId = req.query.worldId as string | undefined;
    res.json({ events: events.getUpcomingEvents(worldId).map(serializeEvent) });
  });

  /** GET /events/live */
  router.get('/live', (req, res) => {
    const worldId = req.query.worldId as string | undefined;
    res.json({ events: events.getLiveEvents(worldId).map(serializeEvent) });
  });

  /** GET /events/:id */
  router.get('/:id', (req, res) => {
    const event = events.getEvent(req.params.id);
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    res.json({ event: serializeEvent(event) });
  });

  /** POST /events/:id/start */
  router.post('/:id/start', async (req, res) => {
    const event = await events.startEvent(req.params.id);
    res.json({ event: serializeEvent(event) });
  });

  /** POST /events/:id/end */
  router.post('/:id/end', async (req, res) => {
    const revenue = await events.endEvent(req.params.id);
    res.json({ revenue: {
      hostRevenue:  revenue.hostRevenue.toString(),
      platformFee:  revenue.platformFee.toString(),
    }});
  });

  /** POST /events/:id/join */
  router.post('/:id/join', async (req, res) => {
    const { avatarId, buyerAddress } = req.body as { avatarId?: string; buyerAddress?: string };
    if (!avatarId) { res.status(400).json({ error: 'avatarId required' }); return; }

    const event = events.getEvent(req.params.id);
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }

    let txs = null;
    if (event.ticketPriceGST > 0n && buyerAddress) {
      const economyResult = await economy.sellEventTicket(
        buyerAddress, event.hostAddress, event.ticketPriceGST, event.eventId,
      );
      txs = economyResult;
    }

    const ticket = events.joinEvent(event.eventId, avatarId, event.ticketPriceGST);
    res.json({ ticket, txs });
  });

  /** POST /events/:id/gift */
  router.post('/:id/gift', async (req, res) => {
    const { from, amountGST } = req.body as { from?: string; amountGST?: string };
    if (!from || !amountGST) {
      res.status(400).json({ error: 'from and amountGST required' });
      return;
    }

    const event = events.getEvent(req.params.id);
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }

    const payTx  = await economy.payGST(from, event.hostAddress, BigInt(amountGST), `gift:${event.eventId}`);
    const receipt = events.recordGift(event.eventId, from, BigInt(amountGST));
    res.json({ receipt, payTx });
  });

  return router;
}

function serializeEvent(ev: ReturnType<EventSystem['getEvent']>) {
  if (!ev) return null;
  return {
    ...ev,
    attendees:      Array.from(ev.attendees),
    ticketPriceGST: ev.ticketPriceGST.toString(),
    totalGiftsGST:  ev.totalGiftsGST.toString(),
  };
}
