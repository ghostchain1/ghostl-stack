/**
 * NPCEngine — AI-Powered NPC Characters for Ghost Universe
 *
 * Creates and manages AI NPC characters (shop owners, tour guides,
 * moderators, game characters) powered by GhostBrain Core (port 7900).
 *
 * NPCs have configurable personalities, roles, and knowledge scopes.
 * GhostBrain provides the language model backend; this engine handles
 * spawning, routing, state, and in-world response delivery.
 */

const GHOSTBRAIN_URL = 'http://localhost:7900';
const L3_RPC         = 'http://localhost:39545';

export type NPCRole = 'shop-owner' | 'tour-guide' | 'moderator' | 'game-character' | 'info-bot' | 'event-host';

export interface NPCPersonality {
  name:        string;
  role:        NPCRole;
  greeting:    string;
  knowledgeScope: string[];  // topics the NPC knows about
  worldId:     string;
  position:    { x: number; y: number; z: number };
  model:       string;       // ghost:// URI to NPC 3D model
  voiceId?:    string;
}

export interface NPCState {
  npcId:       string;
  personality: NPCPersonality;
  active:      boolean;
  interacting: string | null;  // avatar ID currently being served
  messageCount: number;
  spawnedAt:   number;
}

export interface NPCResponse {
  npcId:     string;
  npcName:   string;
  message:   string;
  action?:   'offer-item' | 'show-map' | 'initiate-quest' | 'moderate' | 'none';
  metadata?: Record<string, unknown>;
}

// ─── NPC (single character) ───────────────────────────────────────────────────

export class NPC {
  readonly npcId: string;
  private state:  NPCState;
  private gbUrl:  string;

  constructor(personality: NPCPersonality, ghostBrainUrl: string = GHOSTBRAIN_URL) {
    this.npcId  = `npc-${personality.role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.gbUrl  = ghostBrainUrl;
    this.state  = {
      npcId:        this.npcId,
      personality,
      active:       true,
      interacting:  null,
      messageCount: 0,
      spawnedAt:    Date.now(),
    };
  }

  /**
   * Speak a message — either a scripted one or an AI-generated response
   * via GhostBrain Core.
   *
   * @param message   Player's message (empty = greeting)
   * @param avatarId  Initiating avatar
   */
  async speak(message: string, avatarId: string): Promise<NPCResponse> {
    this.state.interacting = avatarId;
    this.state.messageCount++;

    const text = message.trim()
      ? await this.askGhostBrain(message)
      : this.state.personality.greeting;

    const action = this.inferAction(text);

    return {
      npcId:   this.npcId,
      npcName: this.state.personality.name,
      message: text,
      action,
    };
  }

  /**
   * Stop interacting (player walked away).
   */
  endInteraction(): void {
    this.state.interacting = null;
  }

  getState(): NPCState { return this.state; }

  // ── Private ────────────────────────────────────────────────────────────────

  private async askGhostBrain(userMessage: string): Promise<string> {
    try {
      const res  = await fetch(`${this.gbUrl}/v1/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          system: `You are ${this.state.personality.name}, a ${this.state.personality.role} NPC in Ghost Universe.
Topics you know about: ${this.state.personality.knowledgeScope.join(', ')}.
Keep replies short (1–2 sentences), in-character, and helpful.
Never mention external blockchains. Only GhostChain, GST, GhostXchange, GNS.`,
          message: userMessage,
        }),
        signal: AbortSignal.timeout(8000),
      });

      const json = await res.json() as { reply?: string; message?: string };
      return json.reply ?? json.message ?? this.state.personality.greeting;
    } catch {
      // Graceful fallback when GhostBrain is unreachable
      return this.state.personality.greeting;
    }
  }

  private inferAction(text: string): NPCResponse['action'] {
    const lower = text.toLowerCase();
    if (lower.includes('buy') || lower.includes('shop') || lower.includes('item')) return 'offer-item';
    if (lower.includes('map') || lower.includes('guide') || lower.includes('where')) return 'show-map';
    if (lower.includes('quest') || lower.includes('mission')) return 'initiate-quest';
    return 'none';
  }
}

// ─── NPCEngine (registry) ─────────────────────────────────────────────────────

export class NPCEngine {
  private npcs:   Map<string, NPC> = new Map();
  private gbUrl:  string;

  constructor(ghostBrainUrl: string = GHOSTBRAIN_URL) {
    this.gbUrl = ghostBrainUrl;
  }

  /**
   * Spawn an NPC into a world.
   */
  spawn(personality: NPCPersonality): NPC {
    const npc = new NPC(personality, this.gbUrl);
    this.npcs.set(npc.npcId, npc);
    return npc;
  }

  /**
   * Despawn an NPC (remove from world).
   */
  despawn(npcId: string): void {
    this.npcs.delete(npcId);
  }

  /**
   * Get all NPCs in a world.
   */
  getNPCsInWorld(worldId: string): NPC[] {
    return Array.from(this.npcs.values()).filter(n => n.getState().personality.worldId === worldId);
  }

  /**
   * Find the nearest NPC to a position (Euclidean, ignoring Y).
   */
  findNearest(worldId: string, position: { x: number; z: number }): NPC | null {
    const inWorld = this.getNPCsInWorld(worldId);
    if (inWorld.length === 0) return null;

    return inWorld.reduce((best, npc) => {
      const bp = best.getState().personality.position;
      const np = npc.getState().personality.position;
      const bd = (bp.x - position.x) ** 2 + (bp.z - position.z) ** 2;
      const nd = (np.x - position.x) ** 2 + (np.z - position.z) ** 2;
      return nd < bd ? npc : best;
    });
  }

  /**
   * Send a message to an NPC by ID.
   */
  async sendMessage(npcId: string, message: string, fromAvatarId: string): Promise<NPCResponse> {
    const npc = this.npcs.get(npcId);
    if (!npc) throw new Error(`NPCEngine: NPC '${npcId}' not found`);
    return npc.speak(message, fromAvatarId);
  }

  /**
   * Seed default NPCs for a world (one per standard role).
   */
  seedWorld(worldId: string, spawnOrigin: { x: number; z: number }): NPC[] {
    const defaults: Omit<NPCPersonality, 'worldId'>[] = [
      { name: 'GhostMerchant',   role: 'shop-owner',    greeting: 'Welcome! Browse my wares with GST.',          knowledgeScope: ['market', 'items', 'GST prices'],    position: { x: spawnOrigin.x + 10, y: 0, z: spawnOrigin.z },      model: 'ghost://npc/merchant.vrm' },
      { name: 'GhostGuide',      role: 'tour-guide',    greeting: 'Hello! I can show you around Ghost Universe.', knowledgeScope: ['worlds', 'regions', 'landmarks'],    position: { x: spawnOrigin.x,      y: 0, z: spawnOrigin.z + 10 }, model: 'ghost://npc/guide.vrm'    },
      { name: 'GhostMod',        role: 'moderator',     greeting: 'Stay cool — I keep this world safe.',         knowledgeScope: ['rules', 'bans', 'reports'],          position: { x: spawnOrigin.x - 10, y: 0, z: spawnOrigin.z },      model: 'ghost://npc/mod.vrm'      },
      { name: 'GhostEventHost',  role: 'event-host',    greeting: 'Events are happening — join in!',             knowledgeScope: ['events', 'concerts', 'tournaments'],  position: { x: spawnOrigin.x,      y: 0, z: spawnOrigin.z - 10 }, model: 'ghost://npc/host.vrm'     },
    ];

    return defaults.map(d => this.spawn({ ...d, worldId }));
  }

  static devnet(): NPCEngine { return new NPCEngine('http://localhost:7900'); }
}
