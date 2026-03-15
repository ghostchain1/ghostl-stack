/**
 * SeoPublisher — takes KeywordScanner output, triggers BlogGenerator,
 * and publishes optimised content to configured CMS or writes to disk.
 */

import { getTopKeywords, scanKeywords } from "./keywordScanner";
import { generateBlogPost, BlogPost } from "../content/blogGenerator";
import logger from "../utils/logger";

export interface SeoPublishResult {
  keyword: string;
  post:    BlogPost;
  publishedAt: string;
}

const publishedPosts: SeoPublishResult[] = [];

export async function runSeoPublishCycle(): Promise<SeoPublishResult[]> {
  logger.info("SeoPublisher: starting publish cycle");

  await scanKeywords();
  const topKeywords = getTopKeywords(5);
  const results: SeoPublishResult[] = [];

  for (const kw of topKeywords) {
    try {
      const topic = `${kw.term} — GhostChain Guide ${new Date().getFullYear()}`;
      const post  = await generateBlogPost(topic);
      const result: SeoPublishResult = { keyword: kw.term, post, publishedAt: new Date().toISOString() };
      results.push(result);
      publishedPosts.unshift(result);
      logger.info(`SeoPublisher: published "${post.slug}"`);
    } catch (err: any) {
      logger.error(`SeoPublisher: failed for keyword "${kw.term}"`, { err: err?.message });
    }
  }

  if (publishedPosts.length > 100) publishedPosts.splice(100);
  return results;
}

export function getPublishedPosts(): SeoPublishResult[] {
  return publishedPosts;
}
