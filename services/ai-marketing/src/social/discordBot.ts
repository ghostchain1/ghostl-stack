/**
 * DiscordBot — announces campaigns in configured GhostChain Discord servers.
 * Uses discord.js v14. Dry-runs when DISCORD_BOT_TOKEN is absent.
 */

import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import logger from "../utils/logger";

export interface DiscordMessage {
  channel:  string;
  content:  string;
  dryRun:   boolean;
  sentAt:   string;
}

const recentMessages: DiscordMessage[] = [];
let discordClient: Client | null = null;

async function getClient(): Promise<Client | null> {
  if (!process.env.DISCORD_BOT_TOKEN) {
    return null;
  }
  if (discordClient?.isReady()) return discordClient;

  discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await discordClient.login(process.env.DISCORD_BOT_TOKEN);
    logger.info("DiscordBot: logged in");
  } catch (err: any) {
    logger.error("DiscordBot: login failed", { err: err?.message });
    discordClient = null;
  }
  return discordClient;
}

export async function sendDiscordMessage(channelId: string, content: string): Promise<DiscordMessage> {
  const cl = await getClient();
  const record: DiscordMessage = { channel: channelId, content, dryRun: !cl, sentAt: new Date().toISOString() };

  if (cl) {
    try {
      const ch = await cl.channels.fetch(channelId) as TextChannel;
      await ch.send(content);
      logger.info(`DiscordBot: message sent to channel ${channelId}`);
    } catch (err: any) {
      logger.error("DiscordBot: send failed", { err: err?.message });
      record.dryRun = true;
    }
  } else {
    logger.info(`[DRY-RUN] Discord channel ${channelId}: ${content.slice(0, 60)}…`);
  }

  recentMessages.unshift(record);
  if (recentMessages.length > 50) recentMessages.pop();
  return record;
}

export async function broadcastAnnouncement(content: string): Promise<DiscordMessage[]> {
  const channels = (process.env.DISCORD_CHANNEL_IDS ?? "").split(",").filter(Boolean);
  if (channels.length === 0) {
    logger.warn("DiscordBot: no DISCORD_CHANNEL_IDS configured");
    return [{ channel: "none", content, dryRun: true, sentAt: new Date().toISOString() }];
  }
  return Promise.all(channels.map(id => sendDiscordMessage(id.trim(), content)));
}

export function getRecentMessages(): DiscordMessage[] {
  return recentMessages;
}
