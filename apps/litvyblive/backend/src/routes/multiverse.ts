import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  registerWorld,
  getWorldById,
  listActiveWorlds,
  listAllWorlds,
  setWorldStatus,
  updateWorldAssets,
} from '../../../multiverse/world_registry.js';
import {
  syncAvatarToWorld,
  propagateAvatarUpdate,
  listAvatarStates,
  getAvatarState,
  removeAvatarFromWorld,
} from '../../../multiverse/avatar_world_sync.js';
import {
  registerAsset,
  getAssetById,
  listAssetsByOwner,
  listAssetsInWorld,
  grantWorldPermission,
  revokeWorldPermission,
  updateAssetOwner,
} from '../../../multiverse/nft_asset_bridge.js';
import {
  createEvent,
  getEventById,
  listUpcomingEvents,
  listEventsByCreator,
  listEventsByWorld,
  purchaseTicket,
  listTicketsByOwner,
  hasTicket,
  confirmOnChainTicket,
} from '../../../multiverse/virtual_events.js';
import {
  getGatewayStatus,
  routeEventToWorlds,
  listEventDispatches,
} from '../../../multiverse/multiverse_gateway.js';

export const multiverseRouter = Router();

// ── Gateway ────────────────────────────────────────────────────────────────────

/** GET /multiverse/status */
multiverseRouter.get('/status', (_req, res) => {
  res.json(getGatewayStatus());
});

// ── World Registry ─────────────────────────────────────────────────────────────

/** GET /multiverse/worlds — active worlds */
multiverseRouter.get('/worlds', (_req, res) => {
  res.json(listActiveWorlds());
});

/** GET /multiverse/worlds/all — all worlds (active + inactive, admin) */
multiverseRouter.get('/worlds/all', (req: AuthRequest, res) => {
  const page     = Math.max(0, Number((req as any).query['page'] ?? 0));
  const pageSize = Math.min(100, Math.max(1, Number((req as any).query['pageSize'] ?? 50)));
  res.json(listAllWorlds(page, pageSize));
});

/** GET /multiverse/worlds/:worldId */
multiverseRouter.get('/worlds/:worldId', (req, res) => {
  const world = getWorldById(String(req.params['worldId'] ?? ''));
  if (!world) { res.status(404).json({ error: 'World not found' }); return; }
  res.json(world);
});

/** POST /multiverse/worlds — register a new world */
const RegisterWorldSchema = z.object({
  worldName:       z.string().min(1).max(100),
  apiEndpoint:     z.string().url().optional().default(''),
  supportedAssets: z.array(z.string()).optional().default([]),
});

multiverseRouter.post('/worlds', (req: AuthRequest, res) => {
  const parsed = RegisterWorldSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { worldName, apiEndpoint, supportedAssets } = parsed.data;
  const world = registerWorld(worldName, apiEndpoint, supportedAssets);
  res.status(201).json(world);
});

/** PATCH /multiverse/worlds/:worldId/status */
multiverseRouter.patch('/worlds/:worldId/status', (req: AuthRequest, res) => {
  const status = req.body?.['status'];
  if (status !== 'active' && status !== 'inactive') {
    res.status(400).json({ error: 'status must be "active" or "inactive"' });
    return;
  }
  const ok = setWorldStatus(String(req.params['worldId'] ?? ''), status);
  if (!ok) { res.status(404).json({ error: 'World not found' }); return; }
  res.json({ success: true });
});

/** PATCH /multiverse/worlds/:worldId/assets */
multiverseRouter.patch('/worlds/:worldId/assets', (req: AuthRequest, res) => {
  const assets = req.body?.['supportedAssets'];
  if (!Array.isArray(assets)) { res.status(400).json({ error: 'supportedAssets must be an array' }); return; }
  const ok = updateWorldAssets(String(req.params['worldId'] ?? ''), assets as string[]);
  if (!ok) { res.status(404).json({ error: 'World not found' }); return; }
  res.json({ success: true });
});

// ── Avatar World Sync ──────────────────────────────────────────────────────────

/** GET /multiverse/avatars/:creatorId — all world states for a creator */
multiverseRouter.get('/avatars/:creatorId', (req, res) => {
  res.json(listAvatarStates(String(req.params['creatorId'] ?? '')));
});

/** GET /multiverse/avatars/:creatorId/:worldId */
multiverseRouter.get('/avatars/:creatorId/:worldId', (req, res) => {
  const state = getAvatarState(String(req.params['creatorId'] ?? ''), String(req.params['worldId'] ?? ''));
  if (!state) { res.status(404).json({ error: 'Avatar state not found' }); return; }
  res.json(state);
});

/** POST /multiverse/avatars/:creatorId/sync — sync to a single world */
const SyncAvatarSchema = z.object({
  worldId:        z.string().uuid(),
  avatarModel:    z.string().min(1),
  animationState: z.string().optional().default('idle'),
});

multiverseRouter.post('/avatars/:creatorId/sync', (req: AuthRequest, res) => {
  const parsed = SyncAvatarSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { worldId, avatarModel, animationState } = parsed.data;
  const state = syncAvatarToWorld(String(req.params['creatorId'] ?? ''), worldId, avatarModel, animationState);
  res.json(state);
});

/** POST /multiverse/avatars/:creatorId/propagate — sync to ALL active worlds */
const PropagateSchema = z.object({
  avatarModel:    z.string().min(1),
  animationState: z.string().optional().default('idle'),
});

multiverseRouter.post('/avatars/:creatorId/propagate', async (req: AuthRequest, res) => {
  const parsed = PropagateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { avatarModel, animationState } = parsed.data;
  const results = propagateAvatarUpdate(String(req.params['creatorId'] ?? ''), avatarModel, animationState);
  res.json({ results });
});

/** DELETE /multiverse/avatars/:creatorId/:worldId */
multiverseRouter.delete('/avatars/:creatorId/:worldId', (req: AuthRequest, res) => {
  const ok = removeAvatarFromWorld(String(req.params['creatorId'] ?? ''), String(req.params['worldId'] ?? ''));
  if (!ok) { res.status(404).json({ error: 'Avatar state not found' }); return; }
  res.json({ success: true });
});

// ── NFT Asset Bridge ───────────────────────────────────────────────────────────

/** GET /multiverse/assets/:assetId */
multiverseRouter.get('/assets/:assetId', (req, res) => {
  const asset = getAssetById(String(req.params['assetId'] ?? ''));
  if (!asset) { res.status(404).json({ error: 'Asset not found' }); return; }
  res.json(asset);
});

/** GET /multiverse/assets/owner/:wallet */
multiverseRouter.get('/assets/owner/:wallet', (req, res) => {
  const page     = Math.max(0, Number((req as any).query['page'] ?? 0));
  const pageSize = Math.min(50, Math.max(1, Number((req as any).query['pageSize'] ?? 20)));
  res.json(listAssetsByOwner(String(req.params['wallet'] ?? ''), page, pageSize));
});

/** GET /multiverse/assets/world/:worldId */
multiverseRouter.get('/assets/world/:worldId', (req, res) => {
  const assetType = (req as any).query['type'] as string | undefined;
  res.json(listAssetsInWorld(String(req.params['worldId'] ?? ''), assetType));
});

/** POST /multiverse/assets — register an NFT asset */
const RegisterAssetSchema = z.object({
  tokenId:          z.string().min(1),
  ownerWallet:      z.string().min(1),
  worldPermissions: z.array(z.string()).optional().default([]),
  metadataUri:      z.string().optional().default(''),
  assetType:        z.enum(['avatar_skin', 'accessory', 'ticket', 'merch', 'nft']).default('nft'),
});

multiverseRouter.post('/assets', (req: AuthRequest, res) => {
  const parsed = RegisterAssetSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { tokenId, ownerWallet, worldPermissions, metadataUri, assetType } = parsed.data;
  const asset = registerAsset(tokenId, ownerWallet, worldPermissions, metadataUri, assetType);
  res.status(201).json(asset);
});

/** POST /multiverse/assets/:assetId/grant/:worldId */
multiverseRouter.post('/assets/:assetId/grant/:worldId', (req: AuthRequest, res) => {
  const ok = grantWorldPermission(String(req.params['assetId'] ?? ''), String(req.params['worldId'] ?? ''));
  if (!ok) { res.status(404).json({ error: 'Asset not found' }); return; }
  res.json({ success: true });
});

/** DELETE /multiverse/assets/:assetId/grant/:worldId */
multiverseRouter.delete('/assets/:assetId/grant/:worldId', (req: AuthRequest, res) => {
  const ok = revokeWorldPermission(String(req.params['assetId'] ?? ''), String(req.params['worldId'] ?? ''));
  if (!ok) { res.status(404).json({ error: 'Asset not found' }); return; }
  res.json({ success: true });
});

/** PATCH /multiverse/assets/:assetId/owner */
multiverseRouter.patch('/assets/:assetId/owner', (req: AuthRequest, res) => {
  const tokenId   = req.body?.['tokenId'] as string;
  const newWallet = req.body?.['newWallet'] as string;
  if (!tokenId || !newWallet) { res.status(400).json({ error: 'tokenId and newWallet required' }); return; }
  const ok = updateAssetOwner(tokenId, newWallet);
  if (!ok) { res.status(404).json({ error: 'Asset not found' }); return; }
  res.json({ success: true });
});

// ── Virtual Events ─────────────────────────────────────────────────────────────

/** GET /multiverse/events — upcoming events */
multiverseRouter.get('/events', (req, res) => {
  const page     = Math.max(0, Number((req as any).query['page'] ?? 0));
  const pageSize = Math.min(50, Math.max(1, Number((req as any).query['pageSize'] ?? 20)));
  res.json(listUpcomingEvents(page, pageSize));
});

/** GET /multiverse/events/:eventId */
multiverseRouter.get('/events/:eventId', (req, res) => {
  const event = getEventById(String(req.params['eventId'] ?? ''));
  if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
  res.json(event);
});

/** GET /multiverse/events/creator/:creatorId */
multiverseRouter.get('/events/creator/:creatorId', (req, res) => {
  const page     = Math.max(0, Number((req as any).query['page'] ?? 0));
  const pageSize = Math.min(50, Math.max(1, Number((req as any).query['pageSize'] ?? 20)));
  res.json(listEventsByCreator(String(req.params['creatorId'] ?? ''), page, pageSize));
});

/** GET /multiverse/events/world/:worldId */
multiverseRouter.get('/events/world/:worldId', (req, res) => {
  const page     = Math.max(0, Number((req as any).query['page'] ?? 0));
  const pageSize = Math.min(50, Math.max(1, Number((req as any).query['pageSize'] ?? 20)));
  res.json(listEventsByWorld(String(req.params['worldId'] ?? ''), page, pageSize));
});

/** POST /multiverse/events — create a virtual event */
const CreateEventSchema = z.object({
  worldId:        z.string().min(1),
  title:          z.string().min(1).max(200),
  description:    z.string().optional().default(''),
  eventType:      z.enum(['concert', 'meetup', 'tournament', 'exhibition']).default('concert'),
  ticketPriceGst: z.number().min(0).default(0),
  maxTickets:     z.number().int().min(0).default(0),
  startsAt:       z.string().datetime(),
  endsAt:         z.string().datetime(),
});

multiverseRouter.post('/events', (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorised' }); return; }

  const parsed = CreateEventSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { worldId, title, description, eventType, ticketPriceGst, maxTickets, startsAt, endsAt } = parsed.data;
  const event = createEvent(userId, worldId, title, description, eventType, ticketPriceGst, maxTickets, startsAt, endsAt);
  res.status(201).json(event);
});

/** GET /multiverse/events/:eventId/dispatches — world dispatch log */
multiverseRouter.get('/events/:eventId/dispatches', (req, res) => {
  res.json(listEventDispatches(String(req.params['eventId'] ?? '')));
});

/** POST /multiverse/events/:eventId/dispatch — route to worlds by asset type */
multiverseRouter.post('/events/:eventId/dispatch', (req: AuthRequest, res) => {
  const assetType = req.body?.['assetType'] as string ?? 'ticket';
  const worlds = routeEventToWorlds(String(req.params['eventId'] ?? ''), assetType);
  res.json({ dispatched: worlds });
});

// ── Event Tickets ──────────────────────────────────────────────────────────────

/** POST /multiverse/events/:eventId/tickets — purchase a ticket */
multiverseRouter.post('/events/:eventId/tickets', (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorised' }); return; }

  const wallet = req.body?.['wallet'] as string;
  if (!wallet) { res.status(400).json({ error: 'wallet required' }); return; }

  const result = purchaseTicket(String(req.params['eventId'] ?? ''), userId, wallet);
  if ('error' in result) { res.status(400).json(result); return; }
  res.status(201).json(result);
});

/** GET /multiverse/tickets/mine — tickets owned by authenticated user */
multiverseRouter.get('/tickets/mine', (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorised' }); return; }
  res.json(listTicketsByOwner(userId));
});

/** GET /multiverse/events/:eventId/tickets/check — check if user has a ticket */
multiverseRouter.get('/events/:eventId/tickets/check', (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorised' }); return; }
  res.json({ hasTicket: hasTicket(userId, String(req.params['eventId'] ?? '')) });
});

/** PATCH /multiverse/tickets/:ticketId/confirm — set on-chain token ID after mint */
multiverseRouter.patch('/tickets/:ticketId/confirm', (req: AuthRequest, res) => {
  const onChainTokenId = req.body?.['onChainTokenId'] as string;
  if (!onChainTokenId) { res.status(400).json({ error: 'onChainTokenId required' }); return; }
  const ok = confirmOnChainTicket(String(req.params['ticketId'] ?? ''), onChainTokenId);
  if (!ok) { res.status(404).json({ error: 'Ticket not found' }); return; }
  res.json({ success: true });
});
