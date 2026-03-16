/**
 * EventSystem — Live events & streaming for Ghost Universe
 *
 * Supports: concerts, live-streams, gaming tournaments,
 * virtual conferences, and NFT drops.
 *
 * Integrates with:
 *  - LitVybzLive streaming backend  (apps/litvyblive)
 *  - VoiceSync (stage channels per event)
 *  - UniverseEconomy (ticket sales, gifts, revenue splits)
 *  - MultiplayerNetwork (world-event broadcasts)
 */

const LITVYBZLIVE_URL = 'http://localhost:4000'; // apps/litvyblive default
const GST_UNIT        = 10n ** 18n;

export type EventType =
  | 'concert'
  | 'live-stream'
  | 'gaming-tournament'
  | 'virtual-conference'
  | 'nft-drop';

export type EventStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

export interface GhostEvent {
  eventId:        string;
  name:           string;
  type:           EventType;
  worldId:        string;
  hostAddress:    string;
  ticketPriceGST: bigint;  // 0n = free
  maxAttendees:   number;
  attendees:      Set<string>;    // avatarId
  startAt:        number;         // Unix ms
  endAt?:         number;
  status:         EventStatus;
  streamUrl?:     string;         // LitVybzLive stream endpoint
  totalGiftsGST:  bigint;
  createdAt:      number;
}

export interface EventTicket {
  ticketId:  string;
  eventId:   string;
  holder:    string;
  paidGST:   bigint;
  issuedAt:  number;
}

export interface GiftReceipt {
  giftId:    string;
  eventId:   string;
  from:      string;
  amountGST: bigint;
  timestamp: number;
}

// ─── EventSystem ─────────────────────────────────────────────────────────────

export class EventSystem {
  private events:      Map<string, GhostEvent> = new Map();
  private tickets:     Map<string, EventTicket[]> = new Map(); // eventId → tickets
  private gifts:       Map<string, GiftReceipt[]> = new Map(); // eventId → gifts
  private liveUrl:     string;

  constructor(liveUrl: string = LITVYBZLIVE_URL) {
    this.liveUrl = liveUrl;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  createEvent(
    name:           string,
    worldId:        string,
    type:           EventType,
    hostAddress:    string,
    ticketPriceGST: bigint  = 0n,
    maxAttendees:   number  = 500,
  ): GhostEvent {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const event: GhostEvent = {
      eventId, name, type, worldId, hostAddress,
      ticketPriceGST, maxAttendees,
      attendees:     new Set(),
      startAt:       Date.now() + 3600_000, // default: 1h from now
      status:        'scheduled',
      totalGiftsGST: 0n,
      createdAt:     Date.now(),
    };
    this.events.set(eventId, event);
    this.tickets.set(eventId, []);
    this.gifts.set(eventId, []);
    return event;
  }

  scheduleEvent(eventId: string, startAt: number): void {
    const ev = this.getOrThrow(eventId);
    if (ev.status !== 'scheduled') throw new Error(`Event '${eventId}' is not schedulable`);
    ev.startAt = startAt;
  }

  /**
   * Start event — triggers LitVybzLive stream creation for streamable types.
   */
  async startEvent(eventId: string): Promise<GhostEvent> {
    const ev = this.getOrThrow(eventId);
    ev.status = 'live';
    ev.startAt = Date.now();

    if (['concert', 'live-stream'].includes(ev.type)) {
      ev.streamUrl = await this.createLiveStream(ev);
    }

    return ev;
  }

  async endEvent(eventId: string): Promise<{ hostRevenue: bigint; platformFee: bigint }> {
    const ev = this.getOrThrow(eventId);
    ev.status = 'ended';
    ev.endAt  = Date.now();

    if (ev.streamUrl) await this.stopLiveStream(ev);

    // Revenue distribution: 90% to host, 10% platform (separate from ticket fee split)
    const totalTicketRevenue = (ev.ticketPriceGST * BigInt(ev.attendees.size));
    const platformFee  = (totalTicketRevenue * 1000n) / 10_000n;  // 10%
    const hostRevenue  = totalTicketRevenue - platformFee + ev.totalGiftsGST;

    return { hostRevenue, platformFee };
  }

  cancelEvent(eventId: string): void {
    const ev = this.getOrThrow(eventId);
    if (ev.status === 'live') throw new Error(`Cannot cancel a live event — end it first`);
    ev.status = 'cancelled';
  }

  // ── Attendee management ───────────────────────────────────────────────────

  /**
   * Join an event. Returns a ticket if one is required.
   * Economy payment must be handled by the caller (UniverseEconomy.sellEventTicket).
   */
  joinEvent(eventId: string, avatarId: string, paidGST: bigint = 0n): EventTicket | null {
    const ev = this.getOrThrow(eventId);
    if (ev.status === 'ended' || ev.status === 'cancelled') {
      throw new Error(`Event '${eventId}' is not joinable`);
    }
    if (ev.attendees.size >= ev.maxAttendees) {
      throw new Error(`Event '${eventId}' is at capacity`);
    }
    ev.attendees.add(avatarId);

    if (ev.ticketPriceGST > 0n) {
      const ticket: EventTicket = {
        ticketId: `tkt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        eventId, holder: avatarId,
        paidGST, issuedAt: Date.now(),
      };
      this.tickets.get(eventId)!.push(ticket);
      return ticket;
    }
    return null;
  }

  leaveEvent(eventId: string, avatarId: string): void {
    this.getOrThrow(eventId).attendees.delete(avatarId);
  }

  // ── Gift system ───────────────────────────────────────────────────────────

  /**
   * Send a GST gift to the event/host.
   * Economy payment handled externally; this records the gift receipt.
   */
  recordGift(eventId: string, from: string, amountGST: bigint): GiftReceipt {
    const ev = this.getOrThrow(eventId);
    if (ev.status !== 'live') throw new Error(`Can only gift to a live event`);

    const receipt: GiftReceipt = {
      giftId: `gift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      eventId, from, amountGST, timestamp: Date.now(),
    };
    this.gifts.get(eventId)!.push(receipt);
    ev.totalGiftsGST += amountGST;
    return receipt;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getEvent(eventId: string): GhostEvent | undefined { return this.events.get(eventId); }

  getUpcomingEvents(worldId?: string): GhostEvent[] {
    return Array.from(this.events.values())
      .filter(e => e.status === 'scheduled' && (!worldId || e.worldId === worldId))
      .sort((a, b) => a.startAt - b.startAt);
  }

  getLiveEvents(worldId?: string): GhostEvent[] {
    return Array.from(this.events.values())
      .filter(e => e.status === 'live' && (!worldId || e.worldId === worldId));
  }

  getTickets(eventId: string): EventTicket[] { return this.tickets.get(eventId) ?? []; }
  getGifts(eventId: string):   GiftReceipt[] { return this.gifts.get(eventId) ?? [];   }

  // ── LitVybzLive integration ───────────────────────────────────────────────

  private async createLiveStream(ev: GhostEvent): Promise<string> {
    try {
      const res  = await fetch(`${this.liveUrl}/streams`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:    ev.name,
          eventId:  ev.eventId,
          worldId:  ev.worldId,
          host:     ev.hostAddress,
          type:     ev.type,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const json = await res.json() as { streamUrl?: string; url?: string };
      return json.streamUrl ?? json.url ?? `ghost://stream/${ev.eventId}`;
    } catch {
      // Fallback ghost:// URI when LitVybzLive is offline
      return `ghost://stream/${ev.eventId}`;
    }
  }

  private async stopLiveStream(ev: GhostEvent): Promise<void> {
    try {
      await fetch(`${this.liveUrl}/streams/${ev.eventId}/stop`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Best-effort; stream cleanup is not blocking
    }
  }

  private getOrThrow(eventId: string): GhostEvent {
    const ev = this.events.get(eventId);
    if (!ev) throw new Error(`EventSystem: event '${eventId}' not found`);
    return ev;
  }

  static devnet(): EventSystem { return new EventSystem('http://localhost:4000'); }
}
