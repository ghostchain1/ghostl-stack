/**
 * BlogGenerator — creates long-form SEO-optimised articles for GhostChain.
 * Publishes to configured CMS endpoint or writes to filesystem when offline.
 */

import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface BlogPost {
  title:    string;
  slug:     string;
  content:  string;
  tags:     string[];
  createdAt: string;
}

const BLOG_TOPICS = [
  "GhostChain vs legacy monoliths: why the future of L1 is built for speed",
  "How GhostL2 achieves near-zero gas fees without sacrificing security",
  "Building on GhostL3: a developer guide to the next generation blockchain",
  "GST tokenomics explained: deflationary mechanics and staking yields",
  "GhostXchange deep dive: liquidity pools, AMM design, and yield farming",
  "LitVyb Live: the GhostChain streaming economy powered by GST",
];

export async function generateBlogPost(topic: string): Promise<BlogPost> {
  let content: string;

  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a crypto marketing expert. Write detailed, SEO-optimised blog posts about GhostChain. Use headers (##), bullet lists, and technical depth. Target developer and investor audiences.",
          },
          {
            role: "user",
            content: `Write a 800-word blog post about: ${topic}. Include sections: Introduction, Key Benefits, Technical Details, How to Get Started, Conclusion. Focus on GhostChain and GST.`,
          },
        ],
        max_tokens: 1200,
        temperature: 0.7,
      });
      content = completion.choices[0]?.message?.content?.trim() ?? fallbackBlog(topic);
    } catch (err) {
      logger.warn("generateBlogPost: OpenAI error, using template", { err });
      content = fallbackBlog(topic);
    }
  } else {
    content = fallbackBlog(topic);
  }

  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  const post: BlogPost = {
    title:    topic,
    slug,
    content,
    tags:     ["GhostChain", "GST", "blockchain", "Web3", "DeFi"],
    createdAt: new Date().toISOString(),
  };

  await persistPost(post);
  return post;
}

async function persistPost(post: BlogPost): Promise<void> {
  const dir = process.env.BLOG_OUTPUT_DIR ?? "/tmp/ghost-blogs";
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${post.slug}.md`);
    const md = `# ${post.title}\n\n*Generated: ${post.createdAt}*\n\nTags: ${post.tags.join(", ")}\n\n---\n\n${post.content}\n`;
    fs.writeFileSync(file, md, "utf8");
    logger.info(`BlogGenerator: saved post → ${file}`);
  } catch (err) {
    logger.warn("BlogGenerator: could not persist post to disk", { err });
  }
}

function fallbackBlog(topic: string): string {
  return `## ${topic}

GhostChain is building the next generation of blockchain infrastructure. In this post we explore ${topic.toLowerCase()} and what it means for the Ghost ecosystem.

### Key Benefits

- Lightning-fast finality with GhostChain L1
- Near-zero gas fees via GhostL2 rollup technology  
- Enterprise-grade scalability through GhostL3 app-chains
- GST token: deflationary, governance-enabled, yield-bearing

### Technical Details

GhostChain uses an IBFT consensus mechanism ensuring Byzantine fault tolerance across the validator set. GhostL2 employs optimistic rollups with fraud-proof windows, while GhostL3 supports sovereign app-chains anchored to L2 for maximum composability.

### How to Get Started

1. Acquire GST tokens on GhostXchange
2. Route assets across Ghost layers using GhostBridge
3. Deploy your dApp using our EVM-compatible tooling
4. Apply for ecosystem grants at dev.ghostchain.cloud/grants

### Conclusion

The Ghost ecosystem represents a cohesive multi-layer blockchain stack designed for mass adoption. With autonomous AI systems managing growth, GhostChain is positioned to rapidly expand its developer community and user base.
`;
}

export function getRandomTopic(): string {
  return BLOG_TOPICS[Math.floor(Math.random() * BLOG_TOPICS.length)];
}
