/**
 * TwitterBot — posts AI-generated content to Twitter/X using twitter-api-v2.
 * Credentials are read from environment variables.
 */

import { TwitterApi } from "twitter-api-v2";
import { generateTweet } from "../content/tweetGenerator";
import logger from "../utils/logger";

let client: TwitterApi | null = null;

function getClient(): TwitterApi | null {
  if (client) return client;
  const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET } = process.env;
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_SECRET) {
    logger.warn("TwitterBot: credentials not configured — tweets will be dry-run logged only");
    return null;
  }
  client = new TwitterApi({
    appKey:        TWITTER_API_KEY,
    appSecret:     TWITTER_API_SECRET,
    accessToken:   TWITTER_ACCESS_TOKEN,
    accessSecret:  TWITTER_ACCESS_SECRET,
  });
  return client;
}

export interface TweetResult {
  id?:      string;
  text:     string;
  dryRun:   boolean;
  postedAt: string;
}

const recentTweets: TweetResult[] = [];

export async function postTweet(message: string): Promise<TweetResult> {
  const tw = getClient();
  const result: TweetResult = { text: message, dryRun: !tw, postedAt: new Date().toISOString() };

  if (tw) {
    try {
      const { data } = await tw.v2.tweet(message);
      result.id = data.id;
      logger.info(`TwitterBot: posted tweet ${data.id}`);
    } catch (err: any) {
      logger.error("TwitterBot: failed to post tweet", { err: err?.message });
      result.dryRun = true;
    }
  } else {
    logger.info(`[DRY-RUN] Twitter tweet: ${message.slice(0, 80)}…`);
  }

  recentTweets.unshift(result);
  if (recentTweets.length > 50) recentTweets.pop();
  return result;
}

export async function runTwitterCampaign(topic: string): Promise<TweetResult> {
  const text = await generateTweet(topic);
  return postTweet(text);
}

export function getRecentTweets(): TweetResult[] {
  return recentTweets;
}
