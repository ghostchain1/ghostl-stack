/**
 * AvatarEngine — Ghost Universe Avatar Orchestrator (GhostChain L3)
 *
 * Manages 3D avatar identities, NFT skins, animation state, voice sync,
 * and gesture dispatch.  Avatar GRC-721 tokens are on GhostChain L2;
 * real-time scene state (position, animation, voice) lives on L3.
 *
 * @example
 * const engine = AvatarEngine.devnet()
 * const { avatar } = await engine.createAvatar('0xUser', 'ghost://models/default.vrm')
 * await engine.moveAvatar(avatar.id, { x: 100, y: 0, z: 50, worldId: 'world-1' })
 */

import { AnimationSystem } from './AnimationSystem.js';
import { VoiceSync }       from './VoiceSync.js';
import { GestureSystem }   from './GestureSystem.js';
import type { AnimationClip } from './AnimationSystem.js';
import type { GestureId }     from './GestureSystem.js';

export interface AvatarModel {
  uri:    string;     // ghost:// URI
  format: 'vrm' | 'glb' | 'ghost3d';
  skin?:  string;     // optional NFT skin override URI
}

export interface AvatarPosition {
  x: number; y: number; z: number;
  worldId: string;
}

export interface GhostAvatar {
  id:         string;
  owner:      string;
  model:      AvatarModel;
  position:   AvatarPosition | null;
  xp:         bigint;
  level:      number;
  online:     boolean;
  createdAt:  number;
}

export interface CreateAvatarResult {
  avatar:  GhostAvatar;
}

const L3_RPC = 'http://localhost:7270';

// ─── AvatarEngine ─────────────────────────────────────────────────────────────

export class AvatarEngine {
  private avatars:   Map<string, GhostAvatar>   = new Map();
  private animation: AnimationSystem             = new AnimationSystem();
  private voice:     VoiceSync                  = new VoiceSync();
  private gesture:   GestureSystem              = new GestureSystem();
  private rpc:       string;

  constructor(rpcUrl: string = L3_RPC) {
    this.rpc = rpcUrl;
  }

  /**
   * Create a new avatar for a user.
   *
   * @param user   Wallet address of the owner
   * @param model  3D model URI + format
   */
  async createAvatar(user: string, model: AvatarModel): Promise<CreateAvatarResult> {
    const id = `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const avatar: GhostAvatar = {
      id,
      owner:     user,
      model,
      position:  null,
      xp:        0n,
      level:     1,
      online:    false,
      createdAt: Date.now(),
    };

    this.avatars.set(id, avatar);
    this.animation.initAvatar(id);
    return { avatar };
  }

  /**
   * Get an avatar by ID.
   */
  getAvatar(id: string): GhostAvatar | null {
    return this.avatars.get(id) ?? null;
  }

  /**
   * Get an avatar owned by an address.
   */
  getAvatarOf(owner: string): GhostAvatar | null {
    return Array.from(this.avatars.values()).find(a => a.owner.toLowerCase() === owner.toLowerCase()) ?? null;
  }

  /**
   * Move an avatar to a new position within a world.
   */
  async moveAvatar(avatarId: string, position: AvatarPosition): Promise<void> {
    const avatar = this.avatars.get(avatarId);
    if (!avatar) throw new Error(`AvatarEngine: avatar '${avatarId}' not found`);

    avatar.position = position;
    // Update animation based on movement (simplified velocity heuristic)
    const isMoving = position.x !== avatar.position?.x || position.z !== avatar.position?.z;
    this.animation.play(avatarId, isMoving ? 'walk' : 'idle');
  }

  /**
   * Spawn an avatar into a world (marks as online).
   */
  spawnAvatar(avatarId: string, position: AvatarPosition): void {
    const avatar = this.avatars.get(avatarId);
    if (!avatar) return;
    avatar.position = position;
    avatar.online   = true;
    this.animation.play(avatarId, 'idle', { loop: true });
  }

  /**
   * Despawn an avatar (marks as offline).
   */
  despawnAvatar(avatarId: string): void {
    const avatar = this.avatars.get(avatarId);
    if (!avatar) return;
    avatar.online   = false;
    avatar.position = null;
    this.gesture.clearAvatar(avatarId);
  }

  /**
   * Apply a NFT skin override to an avatar.
   */
  applySkin(avatarId: string, skinUri: string): void {
    const avatar = this.avatars.get(avatarId);
    if (avatar) avatar.model.skin = skinUri;
  }

  /**
   * Grant XP (called by game engine / event rewards).
   */
  grantXP(avatarId: string, amount: bigint): void {
    const avatar = this.avatars.get(avatarId);
    if (!avatar) return;
    avatar.xp    += amount;
    avatar.level  = Math.floor(Math.sqrt(Number(avatar.xp / 100n))) + 1;
  }

  /**
   * Play an animation clip.
   */
  playAnimation(avatarId: string, clip: AnimationClip, loop = false): void {
    this.animation.play(avatarId, clip, { loop });
  }

  /**
   * Trigger a gesture emote.  Returns false if on cooldown.
   */
  triggerGesture(avatarId: string, gesture: GestureId, worldId: string): boolean {
    return this.gesture.trigger(avatarId, gesture, worldId);
  }

  /** Sub-system accessors */
  get animations(): AnimationSystem { return this.animation; }
  get voiceSync():  VoiceSync       { return this.voice;     }
  get gestures():   GestureSystem   { return this.gesture;   }

  /**
   * List all online avatars in a world.
   */
  onlineInWorld(worldId: string): GhostAvatar[] {
    return Array.from(this.avatars.values()).filter(a => a.online && a.position?.worldId === worldId);
  }

  static devnet(): AvatarEngine { return new AvatarEngine('http://localhost:7270'); }
}
