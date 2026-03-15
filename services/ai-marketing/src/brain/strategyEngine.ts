/**
 * StrategyEngine — translates MarketingBrain output into actionable
 * per-channel campaign configs consumed by social bots, ad engines,
 * and the scheduler.
 */

import brain, { CampaignStrategy } from "./marketingBrain";
import logger from "../utils/logger";

export interface ChannelAction {
  channel:    string;
  action:     string;
  topic:      string;
  budgetPct:  number;
  scheduledAt: string;
}

export interface ExecutionPlan {
  strategy:  CampaignStrategy;
  actions:   ChannelAction[];
  createdAt: string;
}

const CHANNEL_ACTIONS: Record<string, string> = {
  Twitter:   "post_tweet",
  Reddit:    "post_thread",
  YouTube:   "publish_short",
  Discord:   "broadcast_announcement",
  Telegram:  "send_update",
  TikTok:    "post_short",
};

export class StrategyEngine {
  private lastPlan: ExecutionPlan | null = null;

  async generatePlan(): Promise<ExecutionPlan> {
    const strategy = await brain.buildStrategy();
    logger.info(`StrategyEngine: building plan (priority=${strategy.priority})`);

    const actions: ChannelAction[] = strategy.campaigns.flatMap(campaign =>
      strategy.channels.map(channel => ({
        channel,
        action:      CHANNEL_ACTIONS[channel] ?? "post_content",
        topic:       campaign,
        budgetPct:   strategy.budget[channel] ?? 0,
        scheduledAt: new Date().toISOString(),
      }))
    );

    this.lastPlan = { strategy, actions, createdAt: new Date().toISOString() };
    return this.lastPlan;
  }

  getLastPlan(): ExecutionPlan | null {
    return this.lastPlan;
  }
}

export default new StrategyEngine();
