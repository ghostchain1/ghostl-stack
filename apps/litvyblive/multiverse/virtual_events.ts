/**
 * Virtual Events — creator-hosted metaverse events (concerts, meetups,
 * tournaments, NFT exhibitions).  Fans purchase tickets with GST; proceeds
 * are tracked off-chain alongside the on-chain VirtualEventTicket NFTs.
 *
 * Ticket purchases settle on GhostL3 (chain_id 903).
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuid } from 'uuid';

export interface VirtualEvent {
  event_id:        string;
  creator_id:      string;
  world_id:        string;
  title:           string;
  description:     string;
  event_type:      string;   // 'concert' | 'meetup' | 'tournament' | 'exhibition'
  ticket_price_gst: number;  // 0 = free
  max_tickets:     number;   // 0 = unlimited
  tickets_sold:    number;
  starts_at:       string;
  ends_at:         string;
  is_active:       boolean;
  created_at:      string;
}

export interface EventTicket {
  ticket_id:         string;
  event_id:          string;
  owner_id:          string;
  owner_wallet:      string;
  on_chain_token_id: string | null;
  purchased_at:      string;
}

interface EventRow {
  event_id:        string;
  creator_id:      string;
  world_id:        string;
  title:           string;
  description:     string;
  event_type:      string;
  ticket_price_gst: number;
  max_tickets:     number;
  tickets_sold:    number;
  starts_at:       string;
  ends_at:         string;
  is_active:       number;
  created_at:      string;
}

function rowToEvent(r: EventRow): VirtualEvent {
  return { ...r, is_active: r.is_active === 1 };
}

// ── Event CRUD ────────────────────────────────────────────────────────────────

/** Create a new virtual event. */
export function createEvent(
  creatorId:      string,
  worldId:        string,
  title:          string,
  description:    string,
  eventType:      string,
  ticketPriceGst: number,
  maxTickets:     number,
  startsAt:       string,
  endsAt:         string,
): VirtualEvent {
  const db      = getDb();
  const eventId = uuid();
  const now     = new Date().toISOString();

  db.prepare(`
    INSERT INTO virtual_events
      (event_id, creator_id, world_id, title, description, event_type,
       ticket_price_gst, max_tickets, tickets_sold, starts_at, ends_at, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, ?)
  `).run(eventId, creatorId, worldId, title, description, eventType,
         ticketPriceGst, maxTickets, startsAt, endsAt, now);

  return getEventById(eventId)!;
}

/** Get event by ID. */
export function getEventById(eventId: string): VirtualEvent | undefined {
  const row = getDb().prepare(
    `SELECT * FROM virtual_events WHERE event_id = ?`
  ).get(eventId) as EventRow | undefined;
  return row ? rowToEvent(row) : undefined;
}

/** List upcoming active events (start in the future). */
export function listUpcomingEvents(page = 0, pageSize = 20): VirtualEvent[] {
  const now  = new Date().toISOString();
  const rows = getDb().prepare(`
    SELECT * FROM virtual_events
    WHERE is_active = 1 AND ends_at > ?
    ORDER BY starts_at ASC LIMIT ? OFFSET ?
  `).all(now, pageSize, page * pageSize) as EventRow[];
  return rows.map(rowToEvent);
}

/** List events by creator. */
export function listEventsByCreator(creatorId: string, page = 0, pageSize = 20): VirtualEvent[] {
  const rows = getDb().prepare(`
    SELECT * FROM virtual_events WHERE creator_id = ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(creatorId, pageSize, page * pageSize) as EventRow[];
  return rows.map(rowToEvent);
}

/** List events taking place in a specific world. */
export function listEventsByWorld(worldId: string, page = 0, pageSize = 20): VirtualEvent[] {
  const now  = new Date().toISOString();
  const rows = getDb().prepare(`
    SELECT * FROM virtual_events
    WHERE world_id = ? AND is_active = 1 AND ends_at > ?
    ORDER BY starts_at ASC LIMIT ? OFFSET ?
  `).all(worldId, now, pageSize, page * pageSize) as EventRow[];
  return rows.map(rowToEvent);
}

// ── Ticket purchases ──────────────────────────────────────────────────────────

/** Record a ticket purchase (off-chain; on-chain token_id set after tx confirms). */
export function purchaseTicket(
  eventId:         string,
  ownerId:         string,
  ownerWallet:     string,
  onChainTokenId?: string,
): EventTicket | { error: string } {
  const db    = getDb();
  const event = getEventById(eventId);
  if (!event) return { error: 'Event not found' };
  if (!event.is_active) return { error: 'Event is not active' };

  const now    = new Date().toISOString();
  if (now > event.ends_at) return { error: 'Event has ended' };
  if (event.max_tickets > 0 && event.tickets_sold >= event.max_tickets) {
    return { error: 'Event is sold out' };
  }

  const ticketId = uuid();
  db.prepare(`
    INSERT INTO event_tickets (ticket_id, event_id, owner_id, owner_wallet, on_chain_token_id, purchased_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ticketId, eventId, ownerId, ownerWallet, onChainTokenId ?? null, now);

  db.prepare(
    `UPDATE virtual_events SET tickets_sold = tickets_sold + 1 WHERE event_id = ?`
  ).run(eventId);

  return getTicketById(ticketId)!;
}

/** Get a ticket by its ID. */
export function getTicketById(ticketId: string): EventTicket | undefined {
  return getDb().prepare(
    `SELECT * FROM event_tickets WHERE ticket_id = ?`
  ).get(ticketId) as EventTicket | undefined;
}

/** List tickets owned by a user. */
export function listTicketsByOwner(ownerId: string): EventTicket[] {
  return getDb().prepare(
    `SELECT * FROM event_tickets WHERE owner_id = ? ORDER BY purchased_at DESC`
  ).all(ownerId) as EventTicket[];
}

/** Check if a user already holds a ticket to an event. */
export function hasTicket(ownerId: string, eventId: string): boolean {
  const row = getDb().prepare(
    `SELECT 1 FROM event_tickets WHERE owner_id = ? AND event_id = ?`
  ).get(ownerId, eventId);
  return row != null;
}

/** Update on-chain token ID after the GhostL3 mint confirms. */
export function confirmOnChainTicket(ticketId: string, onChainTokenId: string): boolean {
  const result = getDb().prepare(
    `UPDATE event_tickets SET on_chain_token_id = ? WHERE ticket_id = ?`
  ).run(onChainTokenId, ticketId);
  return result.changes > 0;
}
