/**
 * TelegramBot — sends campaign updates to GhostChain Telegram channels.
 * Uses telegraf v4. Dry-runs when TELEGRAM_BOT_TOKEN is absent.
 */

import { Telegraf } from "telegraf";
import logger from "../utils/logger";

export interface TelegramMessage {
  chatId:  string | number;
  text:    string;
  dryRun:  boolean;
  sentAt:  string;
}

const recentMessages: TelegramMessage[] = [];
let bot: Telegraf | null = null;

function getBot(): Telegraf | null {
  if (!process.env.TELEGRAM_BOT_TOKEN) return null;
  if (!bot) {
    bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  }
  return bot;
}

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<TelegramMessage> {
  const tg = getBot();
  const record: TelegramMessage = { chatId, text, dryRun: !tg, sentAt: new Date().toISOString() };

  if (tg) {
    try {
      await tg.telegram.sendMessage(chatId, text, { parse_mode: "Markdown" });
      logger.info(`TelegramBot: sent to chat ${chatId}`);
    } catch (err: any) {
      logger.error("TelegramBot: send failed", { err: err?.message });
      record.dryRun = true;
    }
  } else {
    logger.info(`[DRY-RUN] Telegram ${chatId}: ${text.slice(0, 60)}…`);
  }

  recentMessages.unshift(record);
  if (recentMessages.length > 50) recentMessages.pop();
  return record;
}

export async function broadcastUpdate(text: string): Promise<TelegramMessage[]> {
  const chats = (process.env.TELEGRAM_CHAT_IDS ?? "").split(",").filter(Boolean);
  if (chats.length === 0) {
    logger.warn("TelegramBot: no TELEGRAM_CHAT_IDS configured");
    return [{ chatId: "none", text, dryRun: true, sentAt: new Date().toISOString() }];
  }
  return Promise.all(chats.map(id => sendTelegramMessage(id.trim(), text)));
}

export function getRecentMessages(): TelegramMessage[] {
  return recentMessages;
}
