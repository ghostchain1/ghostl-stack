/**
 * Social Distribution Engine — publishes marketing content across channels.
 *
 * Channels supported:
 *   tiktok | instagram | youtube | x | discord | telegram
 *
 * In production each channel has a connector that calls the respective API.
 * Here we record the distribution job and simulate dispatch so the backend
 * can track reach and engagement per channel without depending on live keys.
 *
 * Workflow:
 *   1. Campaign triggers distribution for a creator / stream
 *   2. Engine generates a content snippet (title + clip URL + hashtags)
 *   3. Dispatch record is written to `social_distributions`
 *   4. status = 'sent' after mock dispatch (or real API call when keys present)
 */

import { v4 as uuid } from 'uuid';
import { getDb } from '../backend/src/db/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SocialChannel =
  | 'tiktok'
  | 'instagram'
  | 'youtube'
  | 'x'
  | 'discord'
  | 'telegram';

export const ALL_CHANNELS: SocialChannel[] = [
  'tiktok', 'instagram', 'youtube', 'x', 'discord', 'telegram',
];

export type DistributionStatus = 'queued' | 'sent' | 'failed';

export interface SocialDistribution {
  dist_id:      string;
  campaign_id:  string;
  creator_id:   string;
  channel:      SocialChannel;
  content:      string;    // generated post text
  clip_url:     string | null;
  hashtags:     string;    // comma-separated
  status:       DistributionStatus;
  sent_at:      string | null;
  created_at:   string;
}

// ── Content generation ────────────────────────────────────────────────────────

/** Build a platform-branded post for the given creator / stream title. */
export function generateContent(
  creatorId: string,
  streamTitle: string,
  channel: SocialChannel
): { content: string; hashtags: string } {
  const base = `🔴 LIVE on #LitVybzLive — ${streamTitle}`;
  const tags = [
    'LitVybzLive', 'GhostChain', 'GST', 'Web3Streaming',
    'Creator', channel === 'tiktok' ? 'TikTokLive' : 'Livestream',
  ].join(',');

  const callToAction: Record<SocialChannel, string> = {
    tiktok:    '🎁 Send gifts — earn GST rewards! Join now 👇',
    instagram: '✨ Live streaming on GhostChain. Tap to watch!',
    youtube:   '▶️ Watch live — gift creators with GST tokens.',
    x:         '🚀 Streaming live on @LitVybzLive powered by @GhostChain',
    discord:   '📢 Your favourite creator is live! Click to join.',
    telegram:  '📲 Tap the link to watch live & earn GST gifts.',
  };

  return {
    content: `${base}\n\n${callToAction[channel]}`,
    hashtags: tags,
  };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

/** Queue a distribution for a single channel and immediately mark it sent. */
export function distributeToChannel(params: {
  campaignId: string;
  creatorId:  string;
  streamTitle: string;
  channel:    SocialChannel;
  clipUrl?:   string;
}): SocialDistribution {
  const db = getDb();
  const { content, hashtags } = generateContent(params.creatorId, params.streamTitle, params.channel);
  const id        = uuid();
  const createdAt = new Date().toISOString();

  // In production: call channel API here; on success set sentAt / status='sent'
  const sentAt  = createdAt; // simulated immediate send
  const status: DistributionStatus = 'sent';

  db.prepare(`
    INSERT INTO social_distributions
      (dist_id, campaign_id, creator_id, channel, content,
       clip_url, hashtags, status, sent_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, params.campaignId, params.creatorId, params.channel,
    content, params.clipUrl ?? null, hashtags, status, sentAt, createdAt
  );

  return getDistribution(id)!;
}

/** Blast a campaign to ALL channels in one call. */
export function distributeToAll(params: {
  campaignId:  string;
  creatorId:   string;
  streamTitle: string;
  clipUrl?:    string;
  channels?:   SocialChannel[];
}): SocialDistribution[] {
  const channels = params.channels ?? ALL_CHANNELS;
  return channels.map(ch =>
    distributeToChannel({ ...params, channel: ch })
  );
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getDistribution(distId: string): SocialDistribution | null {
  const db = getDb();
  return db.prepare('SELECT * FROM social_distributions WHERE dist_id = ?').get(distId) as SocialDistribution | null;
}

export function listDistributions(campaignId: string): SocialDistribution[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM social_distributions
    WHERE  campaign_id = ?
    ORDER  BY created_at DESC
  `).all(campaignId) as SocialDistribution[];
}

export function creatorDistributions(creatorId: string, limit = 50): SocialDistribution[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM social_distributions
    WHERE  creator_id = ?
    ORDER  BY created_at DESC
    LIMIT  ?
  `).all(creatorId, limit) as SocialDistribution[];
}

/** Channel reach summary (sent count per channel) for a campaign. */
export function channelReachSummary(campaignId: string): Record<SocialChannel, number> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT channel, COUNT(*) as cnt
    FROM   social_distributions
    WHERE  campaign_id = ? AND status = 'sent'
    GROUP  BY channel
  `).all(campaignId) as { channel: SocialChannel; cnt: number }[];

  const summary = Object.fromEntries(ALL_CHANNELS.map(c => [c, 0])) as Record<SocialChannel, number>;
  for (const r of rows) summary[r.channel] = r.cnt;
  return summary;
}
