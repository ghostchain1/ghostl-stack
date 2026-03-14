/**
 * MarketingBrain — core AI decision-making engine.
 *
 * Responsibilities:
 *   - Scan crypto trends and competitor moves
 *   - Build prioritised campaign strategy
 *   - Score channels by predicted ROI
 *   - Emit strategy objects consumed by all other modules
 */

import axios from "axios";
import logger from "../utils/logger";

export interface CryptoTrend {
  topic:       string;
  momentum:    number; // 0-100
  sentiment:   "bullish" | "neutral" | "bearish";
  relatedCoins: string[];
}

export interface CompetitorMove {
  project:    string;
  action:     string;
  platform:   string;
  timestamp:  string;
  engagement: number;
}

export interface MarketSnapshot {
  trends:      CryptoTrend[];
  competitors: CompetitorMove[];
  scannedAt:   string;
}

export interface CampaignStrategy {
  priority:  "urgent" | "high" | "medium" | "low";
  campaigns: string[];
  channels:  string[];
  budget:    Record<string, number>; // channel → % allocation
  createdAt: string;
}

const TREND_SOURCES = [
  "https://api.coingecko.com/api/v3/search/trending",
];

const GHOST_CAMPAIGNS = [
  "GhostChain developer adoption",
  "GST token awareness",
  "GhostXchange liquidity incentives",
  "GhostVyb live streaming platform",
  "GhostL2 scaling capabilities",
  "GhostL3 enterprise solutions",
];

export class MarketingBrain {
  private lastSnapshot: MarketSnapshot | null = null;
  private cycleCount = 0;
  private startedAt = Date.now();

  /** Fetch live trending topics from CoinGecko (graceful on failure). */
  async scanCryptoTrends(): Promise<CryptoTrend[]> {
    try {
      const { data } = await axios.get(TREND_SOURCES[0], { timeout: 8_000 });
      const coins: CryptoTrend[] = (data.coins ?? []).slice(0, 10).map((c: any) => ({
        topic:        c.item?.name ?? "Unknown",
        momentum:     Math.round((c.item?.score ?? 0) * 10),
        sentiment:    "bullish" as const,
        relatedCoins: [c.item?.symbol ?? "?"],
      }));
      return coins;
    } catch (err) {
      logger.warn("scanCryptoTrends: upstream unreachable, using synthetic data");
      return [
        { topic: "GhostChain", momentum: 85, sentiment: "bullish", relatedCoins: ["GST"] },
        { topic: "Layer2 Scaling", momentum: 72, sentiment: "bullish", relatedCoins: ["ETH", "GST"] },
        { topic: "DeFi Yields",   momentum: 60, sentiment: "neutral", relatedCoins: ["GST"] },
      ];
    }
  }

  /** Stub: scan competitor social/chain activity. */
  async scanCompetitors(): Promise<CompetitorMove[]> {
    return [
      { project: "Ethereum L2", action: "New developer grant announcement", platform: "Twitter",  timestamp: new Date().toISOString(), engagement: 4200 },
      { project: "Polygon",     action: "Exchange listing announcement",    platform: "Discord",  timestamp: new Date().toISOString(), engagement: 3100 },
      { project: "Arbitrum",    action: "DeFi liquidity campaign",         platform: "Reddit",   timestamp: new Date().toISOString(), engagement: 2800 },
    ];
  }

  async analyzeMarket(): Promise<MarketSnapshot> {
    const [trends, competitors] = await Promise.all([
      this.scanCryptoTrends(),
      this.scanCompetitors(),
    ]);
    this.lastSnapshot = { trends, competitors, scannedAt: new Date().toISOString() };
    return this.lastSnapshot;
  }

  async buildStrategy(): Promise<CampaignStrategy> {
    const market = await this.analyzeMarket();
    this.cycleCount++;

    // Determine priority from top-trend momentum
    const topMomentum = market.trends[0]?.momentum ?? 50;
    const priority: CampaignStrategy["priority"] =
      topMomentum > 80 ? "urgent" :
      topMomentum > 60 ? "high"   :
      topMomentum > 40 ? "medium" : "low";

    return {
      priority,
      campaigns: GHOST_CAMPAIGNS,
      channels:  ["Twitter", "Reddit", "Discord", "YouTube", "Telegram", "TikTok"],
      budget: {
        Twitter:   30,
        Reddit:    15,
        YouTube:   25,
        Discord:   15,
        Telegram:  10,
        TikTok:     5,
      },
      createdAt: new Date().toISOString(),
    };
  }

  status() {
    return {
      cycleCount:   this.cycleCount,
      uptimeSec:    Math.floor((Date.now() - this.startedAt) / 1000),
      lastSnapshot: this.lastSnapshot?.scannedAt ?? null,
    };
  }
}

export default new MarketingBrain();
