/**
 * GestureSystem — Avatar gesture and emote management for Ghost Universe
 *
 * Manages a catalogue of named gestures (emotes), handles gesture
 * triggering, cooldown enforcement, and broadcasts gesture events
 * to nearby players.
 */

export type GestureId =
  | 'wave'
  | 'clap'
  | 'cheer'
  | 'bow'
  | 'thumbs-up'
  | 'dance-1'
  | 'dance-2'
  | 'sit'
  | 'point'
  | 'heart'
  | 'laugh'
  | 'cry'
  | 'shrug';

export interface GestureDef {
  id:           GestureId;
  displayName:  string;
  durationMs:   number;
  cooldownMs:   number;
  animationClip: string;
}

export interface GestureEvent {
  avatarId:   string;
  gesture:    GestureId;
  timestamp:  number;
  worldId:    string;
}

const GESTURE_CATALOGUE: GestureDef[] = [
  { id: 'wave',       displayName: 'Wave',      durationMs: 2500,  cooldownMs: 500,   animationClip: 'wave'   },
  { id: 'clap',       displayName: 'Clap',      durationMs: 2000,  cooldownMs: 500,   animationClip: 'clap'   },
  { id: 'cheer',      displayName: 'Cheer',     durationMs: 3000,  cooldownMs: 1000,  animationClip: 'cheer'  },
  { id: 'bow',        displayName: 'Bow',       durationMs: 2000,  cooldownMs: 500,   animationClip: 'bow'    },
  { id: 'thumbs-up',  displayName: 'Thumbs Up', durationMs: 1500,  cooldownMs: 300,   animationClip: 'thumbs-up' },
  { id: 'dance-1',    displayName: 'Dance',     durationMs: 5000,  cooldownMs: 2000,  animationClip: 'dance'  },
  { id: 'dance-2',    displayName: 'Dance 2',   durationMs: 5000,  cooldownMs: 2000,  animationClip: 'dance-2'},
  { id: 'sit',        displayName: 'Sit',       durationMs: 0,     cooldownMs: 500,   animationClip: 'sit'    },
  { id: 'point',      displayName: 'Point',     durationMs: 1500,  cooldownMs: 300,   animationClip: 'point'  },
  { id: 'heart',      displayName: 'Heart',     durationMs: 2000,  cooldownMs: 1000,  animationClip: 'heart'  },
  { id: 'laugh',      displayName: 'Laugh',     durationMs: 3000,  cooldownMs: 1000,  animationClip: 'laugh'  },
  { id: 'cry',        displayName: 'Cry',       durationMs: 3000,  cooldownMs: 1000,  animationClip: 'cry'    },
  { id: 'shrug',      displayName: 'Shrug',     durationMs: 1500,  cooldownMs: 300,   animationClip: 'shrug'  },
];

// ─── GestureSystem ────────────────────────────────────────────────────────────

export class GestureSystem {
  private cooldowns:  Map<string, Map<GestureId, number>> = new Map(); // avatarId → gestureId → readyAt
  private listeners:  ((event: GestureEvent) => void)[]   = [];

  /** Lookup all available gestures. */
  getCatalogue(): GestureDef[] { return GESTURE_CATALOGUE; }

  /** Lookup a specific gesture definition. */
  getDef(id: GestureId): GestureDef | undefined {
    return GESTURE_CATALOGUE.find(g => g.id === id);
  }

  /**
   * Trigger a gesture for an avatar.  Enforces cooldown and emits an event.
   * Returns `false` if the gesture is on cooldown.
   */
  trigger(avatarId: string, gestureId: GestureId, worldId: string): boolean {
    const def = this.getDef(gestureId);
    if (!def) return false;

    const now      = Date.now();
    const cdMap    = this.cooldowns.get(avatarId) ?? new Map<GestureId, number>();
    const readyAt  = cdMap.get(gestureId) ?? 0;

    if (now < readyAt) return false;   // still on cooldown

    cdMap.set(gestureId, now + def.cooldownMs + def.durationMs);
    this.cooldowns.set(avatarId, cdMap);

    const event: GestureEvent = { avatarId, gesture: gestureId, timestamp: now, worldId };
    for (const fn of this.listeners) fn(event);

    return true;
  }

  /** Check remaining cooldown (ms) for a gesture. 0 = ready. */
  cooldownRemaining(avatarId: string, gestureId: GestureId): number {
    const readyAt = this.cooldowns.get(avatarId)?.get(gestureId) ?? 0;
    return Math.max(0, readyAt - Date.now());
  }

  /** Register a listener for gesture events. */
  onGesture(fn: (event: GestureEvent) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  /** Remove all cooldown state for an avatar (e.g. at logout). */
  clearAvatar(avatarId: string): void {
    this.cooldowns.delete(avatarId);
  }
}
