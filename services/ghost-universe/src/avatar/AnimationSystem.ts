/**
 * AnimationSystem — Avatar animation state machine for Ghost Universe
 *
 * Manages animation clips, blending, and gesture queuing per avatar.
 * Clip names follow the Ghost Universe animation standard.
 */

export type AnimationClip =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'fall'
  | 'sit'
  | 'dance'
  | 'wave'
  | 'clap'
  | 'cheer'
  | 'bow'
  | 'custom';

export interface AnimationState {
  avatarId:       string;
  current:        AnimationClip;
  queue:          AnimationClip[];
  blending:       boolean;
  blendFactor:    number;   // 0.0–1.0 (0 = source, 1 = target)
  looping:        boolean;
  playbackSpeed:  number;   // 1.0 = normal
}

// ─── AnimationSystem ──────────────────────────────────────────────────────────

export class AnimationSystem {
  private states: Map<string, AnimationState> = new Map();

  /** Initialise the animation state for a newly spawned avatar. */
  initAvatar(avatarId: string): void {
    this.states.set(avatarId, {
      avatarId,
      current:       'idle',
      queue:         [],
      blending:      false,
      blendFactor:   0,
      looping:       true,
      playbackSpeed: 1.0,
    });
  }

  /** Remove animation state when avatar despawns. */
  removeAvatar(avatarId: string): void {
    this.states.delete(avatarId);
  }

  /** Immediately transition to a new clip with optional blending. */
  play(avatarId: string, clip: AnimationClip, options: { loop?: boolean; speed?: number; blend?: boolean } = {}): void {
    const state = this.states.get(avatarId);
    if (!state) return;

    state.current       = clip;
    state.looping       = options.loop   ?? this.isLoopable(clip);
    state.playbackSpeed = options.speed  ?? 1.0;
    state.blending      = options.blend  ?? false;
    state.blendFactor   = state.blending ? 0 : 1;
    state.queue         = [];
  }

  /** Queue an animation to play after the current one completes. */
  enqueue(avatarId: string, clip: AnimationClip): void {
    this.states.get(avatarId)?.queue.push(clip);
  }

  /** Advance blend factor and pop queue (called by server game loop at fixed rate). */
  tick(avatarId: string, dt: number): void {
    const state = this.states.get(avatarId);
    if (!state) return;

    if (state.blending) {
      state.blendFactor = Math.min(1, state.blendFactor + dt * 4);
      if (state.blendFactor >= 1) state.blending = false;
    }

    if (!state.looping && !state.blending && state.queue.length > 0) {
      this.play(avatarId, state.queue.shift()!);
    } else if (!state.looping && !state.blending && state.queue.length === 0) {
      // Return to idle when single-play clip ends
      this.play(avatarId, 'idle');
    }
  }

  /** Get current animation state for serialisation to clients. */
  getState(avatarId: string): AnimationState | null {
    return this.states.get(avatarId) ?? null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private isLoopable(clip: AnimationClip): boolean {
    return ['idle', 'walk', 'run', 'dance', 'sit'].includes(clip);
  }
}
