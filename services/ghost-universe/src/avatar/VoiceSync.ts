/**
 * VoiceSync — Avatar voice and audio synchronisation for Ghost Universe
 *
 * Manages voice-chat channel assignment, lip-sync amplitude signals,
 * and spatial audio attenuation (proximity-based volume).
 * Actual media streaming is handled by a WebRTC SFU; this module
 * coordinates the metadata and presence signals.
 */

export interface VoiceChannel {
  channelId:   string;
  worldId:     string;
  type:        'proximity' | 'stage' | 'private' | 'broadcast';
  speakerIds:  string[];  // avatar IDs currently speaking
  listenerIds: string[];  // avatar IDs listening
  maxRadius:   number;    // proximity radius (metres), used for spatial attenuation
}

export interface LipSyncFrame {
  avatarId:  string;
  amplitude: number;   // 0.0–1.0 (0 = silent)
  pose:      'idle' | 'low' | 'mid' | 'high';
}

// ─── VoiceSync ────────────────────────────────────────────────────────────────

export class VoiceSync {
  private channels: Map<string, VoiceChannel> = new Map();
  private lipSyncStates: Map<string, LipSyncFrame> = new Map();

  /** Create or return a proximity channel for a world region. */
  getOrCreateChannel(worldId: string, type: VoiceChannel['type'], channelId?: string): VoiceChannel {
    const id = channelId ?? `vc-${worldId}-${type}-${Date.now()}`;
    if (!this.channels.has(id)) {
      this.channels.set(id, { channelId: id, worldId, type, speakerIds: [], listenerIds: [], maxRadius: type === 'proximity' ? 30 : 9999 });
    }
    return this.channels.get(id)!;
  }

  /** Add a listener to a channel. */
  join(channelId: string, avatarId: string): void {
    const ch = this.channels.get(channelId);
    if (!ch) return;
    if (!ch.listenerIds.includes(avatarId)) ch.listenerIds.push(avatarId);
  }

  /** Remove a listener/speaker from a channel. */
  leave(channelId: string, avatarId: string): void {
    const ch = this.channels.get(channelId);
    if (!ch) return;
    ch.listenerIds = ch.listenerIds.filter(id => id !== avatarId);
    ch.speakerIds  = ch.speakerIds.filter(id => id !== avatarId);
  }

  /** Mark an avatar as actively speaking. */
  startSpeaking(channelId: string, avatarId: string): void {
    const ch = this.channels.get(channelId);
    if (!ch) return;
    if (!ch.speakerIds.includes(avatarId)) ch.speakerIds.push(avatarId);
    this.setLipSync(avatarId, 0.5);
  }

  /** Mark an avatar as silent. */
  stopSpeaking(channelId: string, avatarId: string): void {
    const ch = this.channels.get(channelId);
    if (!ch) return;
    ch.speakerIds = ch.speakerIds.filter(id => id !== avatarId);
    this.setLipSync(avatarId, 0);
  }

  /** Update lip-sync amplitude for an avatar (called from audio analysis). */
  setLipSync(avatarId: string, amplitude: number): void {
    const clamped = Math.max(0, Math.min(1, amplitude));
    this.lipSyncStates.set(avatarId, {
      avatarId,
      amplitude: clamped,
      pose:      clamped < 0.01 ? 'idle' : clamped < 0.3 ? 'low' : clamped < 0.7 ? 'mid' : 'high',
    });
  }

  /** Calculate attenuation factor between two 3D positions. */
  spatialAttenuation(
    speaker: { x: number; y: number; z: number },
    listener: { x: number; y: number; z: number },
    maxRadius: number,
  ): number {
    const dist = Math.sqrt((speaker.x - listener.x) ** 2 + (speaker.y - listener.y) ** 2 + (speaker.z - listener.z) ** 2);
    if (dist >= maxRadius) return 0;
    return Math.max(0, 1 - dist / maxRadius);
  }

  /** Get current lip-sync frame for an avatar. */
  getLipSync(avatarId: string): LipSyncFrame {
    return this.lipSyncStates.get(avatarId) ?? { avatarId, amplitude: 0, pose: 'idle' };
  }

  /** Get all channels (for broadcasting state to clients). */
  getChannels(worldId?: string): VoiceChannel[] {
    return Array.from(this.channels.values()).filter(ch => !worldId || ch.worldId === worldId);
  }
}
