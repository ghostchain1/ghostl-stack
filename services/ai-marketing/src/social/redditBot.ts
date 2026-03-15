/**
 * RedditBot — posts GhostChain content to relevant crypto subreddits.
 * Uses snoowrap. Credentials from env. Dry-runs when not configured.
 */

import logger from "../utils/logger";

export interface RedditPost {
  subreddit: string;
  title:     string;
  text:      string;
  dryRun:    boolean;
  postedAt:  string;
}

const TARGET_SUBREDDITS = [
  "r/CryptoCurrency",
  "r/ethdev",
  "r/defi",
  "r/blockchain",
  "r/web3",
  "r/GhostChain",
];

const recentPosts: RedditPost[] = [];

// snoowrap is loaded dynamically to avoid import-time crashes when creds are missing
async function getReddit(): Promise<any> {
  const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD } = process.env;
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET || !REDDIT_USERNAME || !REDDIT_PASSWORD) {
    return null;
  }
  // Dynamic import avoids crash when package not installed in dev
  const snoowrap = await import("snoowrap").then(m => m.default ?? m).catch(() => null);
  if (!snoowrap) return null;
  return new snoowrap({
    userAgent:    "GhostChain-Marketing-Bot/1.0",
    clientId:     REDDIT_CLIENT_ID,
    clientSecret: REDDIT_CLIENT_SECRET,
    username:     REDDIT_USERNAME,
    password:     REDDIT_PASSWORD,
  });
}

export async function postToReddit(
  subreddit: string,
  title: string,
  text: string,
): Promise<RedditPost> {
  const reddit = await getReddit();
  const record: RedditPost = { subreddit, title, text, dryRun: !reddit, postedAt: new Date().toISOString() };

  if (reddit) {
    try {
      await reddit.getSubreddit(subreddit.replace(/^r\//, "")).submitSelfpost({ title, text });
      logger.info(`RedditBot: posted to ${subreddit}`);
    } catch (err: any) {
      logger.error("RedditBot: post failed", { err: err?.message });
      record.dryRun = true;
    }
  } else {
    logger.info(`[DRY-RUN] Reddit ${subreddit}: ${title}`);
  }

  recentPosts.unshift(record);
  if (recentPosts.length > 50) recentPosts.pop();
  return record;
}

export async function runRedditCampaign(topic: string, body: string): Promise<RedditPost> {
  const subreddit = TARGET_SUBREDDITS[Math.floor(Math.random() * TARGET_SUBREDDITS.length)];
  const title = `GhostChain Update: ${topic}`;
  return postToReddit(subreddit, title, body);
}

export function getRecentPosts(): RedditPost[] {
  return recentPosts;
}
