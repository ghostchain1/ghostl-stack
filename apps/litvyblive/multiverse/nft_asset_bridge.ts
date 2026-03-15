/**
 * NFT Asset Bridge — maps GRC-721 NFT assets to virtual worlds.
 * Tracks which worlds each NFT is permitted in, and provides off-chain
 * ownership verification via the GhostL3 RPC (ghost_chain_client).
 *
 * All purchases settle on GhostL3 (chain_id 903).
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuid } from 'uuid';

export interface NftAsset {
  asset_id:         string;
  token_id:         string;   // GRC-721 token ID (on-chain)
  owner_wallet:     string;   // current owner's GhostWallet address
  world_permissions: string[]; // list of world_ids this NFT is usable in
  metadata_uri:     string;   // model/image URI
  asset_type:       string;   // 'avatar_skin' | 'accessory' | 'ticket' | 'merch'
  chain_id:         number;   // always 903 (GhostL3)
  created_at:       string;
}

interface NftAssetRow {
  asset_id:         string;
  token_id:         string;
  owner_wallet:     string;
  world_permissions: string;  // JSON in DB
  metadata_uri:     string;
  asset_type:       string;
  chain_id:         number;
  created_at:       string;
}

function rowToAsset(r: NftAssetRow): NftAsset {
  return {
    ...r,
    world_permissions: JSON.parse(r.world_permissions ?? '[]') as string[],
  };
}

/** Register a new NFT asset in the bridge registry. */
export function registerAsset(
  tokenId:          string,
  ownerWallet:      string,
  worldPermissions: string[],
  metadataUri:      string,
  assetType:        string,
): NftAsset {
  const db      = getDb();
  const assetId = uuid();
  const now     = new Date().toISOString();

  db.prepare(`
    INSERT INTO nft_assets (asset_id, token_id, owner_wallet, world_permissions, metadata_uri, asset_type, chain_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 903, ?)
  `).run(assetId, tokenId, ownerWallet, JSON.stringify(worldPermissions), metadataUri, assetType, now);

  return getAssetById(assetId)!;
}

/** Get a single NFT asset by its registry ID. */
export function getAssetById(assetId: string): NftAsset | undefined {
  const row = getDb().prepare(
    `SELECT * FROM nft_assets WHERE asset_id = ?`
  ).get(assetId) as NftAssetRow | undefined;
  return row ? rowToAsset(row) : undefined;
}

/** Get a single NFT asset by its on-chain token ID. */
export function getAssetByTokenId(tokenId: string): NftAsset | undefined {
  const row = getDb().prepare(
    `SELECT * FROM nft_assets WHERE token_id = ?`
  ).get(tokenId) as NftAssetRow | undefined;
  return row ? rowToAsset(row) : undefined;
}

/** List all NFT assets owned by a wallet address. */
export function listAssetsByOwner(ownerWallet: string, page = 0, pageSize = 20): NftAsset[] {
  const rows = getDb().prepare(
    `SELECT * FROM nft_assets WHERE owner_wallet = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(ownerWallet, pageSize, page * pageSize) as NftAssetRow[];
  return rows.map(rowToAsset);
}

/** Update the owner wallet after an on-chain transfer. */
export function updateAssetOwner(tokenId: string, newOwnerWallet: string): boolean {
  const result = getDb().prepare(
    `UPDATE nft_assets SET owner_wallet = ? WHERE token_id = ?`
  ).run(newOwnerWallet, tokenId);
  return result.changes > 0;
}

/** Add a world to an asset's permission list. */
export function grantWorldPermission(assetId: string, worldId: string): boolean {
  const asset = getAssetById(assetId);
  if (!asset) return false;

  const perms = asset.world_permissions;
  if (perms.includes(worldId)) return true;

  perms.push(worldId);
  const result = getDb().prepare(
    `UPDATE nft_assets SET world_permissions = ? WHERE asset_id = ?`
  ).run(JSON.stringify(perms), assetId);
  return result.changes > 0;
}

/** Remove a world from an asset's permission list. */
export function revokeWorldPermission(assetId: string, worldId: string): boolean {
  const asset = getAssetById(assetId);
  if (!asset) return false;

  const perms = asset.world_permissions.filter(w => w !== worldId);
  const result = getDb().prepare(
    `UPDATE nft_assets SET world_permissions = ? WHERE asset_id = ?`
  ).run(JSON.stringify(perms), assetId);
  return result.changes > 0;
}

/** Check if an asset is permitted in a given world. */
export function isAssetPermittedInWorld(assetId: string, worldId: string): boolean {
  const asset = getAssetById(assetId);
  return asset?.world_permissions.includes(worldId) ?? false;
}

/** List assets by type that are permitted in a specific world. */
export function listAssetsInWorld(worldId: string, assetType?: string): NftAsset[] {
  const rows = getDb().prepare(
    `SELECT * FROM nft_assets WHERE world_permissions LIKE ? ORDER BY created_at DESC`
  ).all(`%"${worldId}"%`) as NftAssetRow[];

  const assets = rows.map(rowToAsset);
  return assetType ? assets.filter(a => a.asset_type === assetType) : assets;
}
