/**
 * @ghostchain/ghost-universe — Ghost Universe Platform
 *
 * Full virtual universe built on GhostChain L3/L2/L1.
 * All transactions use GST. Routing law: L3 → L2 → L1.
 */

// World Engine
export { WorldEngine }         from './world/WorldEngine.js';
export { WorldGenerator }      from './world/generator/WorldGenerator.js';
export { PhysicsEngine }       from './world/physics/PhysicsEngine.js';
export { EnvironmentSystem }   from './world/environment/EnvironmentSystem.js';
export { WorldMap }            from './world/map/WorldMap.js';

// Avatar Engine
export { AvatarEngine }        from './avatar/AvatarEngine.js';
export { AnimationSystem }     from './avatar/AnimationSystem.js';
export { VoiceSync }           from './avatar/VoiceSync.js';
export { GestureSystem }       from './avatar/GestureSystem.js';

// Land System
export { LandSystem }          from './land/LandSystem.js';

// Asset Marketplace
export { AssetMarketplace }    from './marketplace/AssetMarketplace.js';

// AI NPC Engine
export { NPCEngine, NPC }      from './ai-npc/NPCEngine.js';

// Multiplayer Network
export { MultiplayerNetwork }  from './network/MultiplayerNetwork.js';

// Universe Economy
export { UniverseEconomy }     from './economy/UniverseEconomy.js';

// Events & Streaming
export { EventSystem }         from './events/EventSystem.js';

// API
export { createApp }           from './api/server.js';
export type { UniverseServices } from './api/server.js';

// Types re-exports
export type { GhostWorld, CreateWorldOptions, WorldTheme } from './world/WorldEngine.js';
export type { Biome, Region, RegionType, GeneratorConfig }  from './world/generator/WorldGenerator.js';
export type { PhysicsBody, CollisionEvent }                 from './world/physics/PhysicsEngine.js';
export type { WeatherState, Season, EnvironmentSnapshot }   from './world/environment/EnvironmentSystem.js';
export type { TileType, Tile, PointOfInterest }             from './world/map/WorldMap.js';
export type { GhostAvatar, AvatarModel, CreateAvatarResult } from './avatar/AvatarEngine.js';
export type { AnimationClip, AnimationState }               from './avatar/AnimationSystem.js';
export type { VoiceChannel, LipSyncFrame }                  from './avatar/VoiceSync.js';
export type { GestureId, GestureEvent }                     from './avatar/GestureSystem.js';
export type { LandParcel, LandType, LandStats }             from './land/LandSystem.js';
export type { MarketAsset, AssetCategory, SaleReceipt }     from './marketplace/AssetMarketplace.js';
export type { NPCRole, NPCPersonality, NPCState, NPCResponse } from './ai-npc/NPCEngine.js';
export type { NetMessage, NetMessageType, PlayerSession }   from './network/MultiplayerNetwork.js';
export type { EconomyTx, TreasuryStats }                    from './economy/UniverseEconomy.js';
export type { GhostEvent, EventType, EventStatus, EventTicket, GiftReceipt } from './events/EventSystem.js';
