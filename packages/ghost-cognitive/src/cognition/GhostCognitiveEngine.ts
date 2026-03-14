import { GhostMemoryStore } from '../memory/GhostMemoryStore.js';
import { GhostKnowledgeGraph } from '../memory/GhostKnowledgeGraph.js';
import { GhostLearningEngine } from '../memory/GhostLearningEngine.js';
import { GhostEconomicAI } from '../economy/GhostEconomicAI.js';
import { GhostTreasuryStrategist } from '../economy/GhostTreasuryStrategist.js';
import { GhostMarketAnalyzer } from '../economy/GhostMarketAnalyzer.js';
import { GhostTokenomicsController } from '../tokenomics/GhostTokenomicsController.js';
import { GhostPredictiveGovernance } from '../governance/GhostPredictiveGovernance.js';
import type { EconomicMetrics, MarketData, GovernanceProposal } from '../types.js';

/**
 * GhostCognitiveEngine — the central strategic brain of GhostStack.
 *
 * Wires together memory, economic AI, market analysis, tokenomics control, and
 * governance prediction into a single unified decision surface. Every evaluation
 * is automatically stored in long-term memory for future learning.
 */
export class GhostCognitiveEngine {
  readonly memory: GhostMemoryStore;
  readonly graph: GhostKnowledgeGraph;
  readonly learner: GhostLearningEngine;
  readonly economy: GhostEconomicAI;
  readonly treasury: GhostTreasuryStrategist;
  readonly market: GhostMarketAnalyzer;
  readonly tokenomics: GhostTokenomicsController;
  readonly governance: GhostPredictiveGovernance;

  constructor() {
    this.memory = new GhostMemoryStore();
    this.graph = new GhostKnowledgeGraph();
    this.learner = new GhostLearningEngine(this.memory, this.graph);
    this.economy = new GhostEconomicAI();
    this.treasury = new GhostTreasuryStrategist();
    this.market = new GhostMarketAnalyzer();
    this.tokenomics = new GhostTokenomicsController();
    this.governance = new GhostPredictiveGovernance();

    // Seed causal relationships in the knowledge graph
    this.graph.link('gas-spike', 'bridge-congestion', { relation: 'causes', weight: 0.8 });
    this.graph.link('bridge-congestion', 'liquidity-imbalance', { relation: 'causes', weight: 0.7 });
    this.graph.link('validator-undercount', 'blocktime-high', { relation: 'causes', weight: 0.9 });
    this.graph.link('tvl-drop', 'fee-revenue-drop', { relation: 'causes', weight: 0.75 });
  }

  /** Evaluate current economic state and store the assessment. */
  evaluate(metrics: EconomicMetrics): {
    economicRecommendation: string;
    tokenomicsAction: string;
    treasuryAllocation: ReturnType<GhostTreasuryStrategist['allocate']>;
    healthScore: number;
  } {
    const economicRecommendation = this.economy.evaluate(metrics);
    const tokenomicsAction = this.tokenomics.adjust(metrics);
    const treasuryAllocation = this.treasury.allocate(metrics.treasuryBalance);
    const healthScore = this.economy.healthScore(metrics);

    this.memory.store('evaluation', {
      metrics,
      economicRecommendation,
      tokenomicsAction,
      healthScore,
      ts: Date.now(),
    });

    this.learner.learn({
      type: 'economic-evaluation',
      outcome: healthScore >= 60 ? 'success' : 'failure',
      context: { healthScore, recommendation: economicRecommendation },
    });

    return { economicRecommendation, tokenomicsAction: tokenomicsAction.action, treasuryAllocation, healthScore };
  }

  /** Analyse market data and store signals. */
  analyzeMarket(data: MarketData) {
    const signal = this.market.analyze(data);
    const risk = this.market.riskScore(data);
    this.memory.store('market-signal', { signal, risk, data });
    return { signal, risk };
  }

  /** Screen a governance proposal. */
  screenProposal(proposal: GovernanceProposal) {
    const result = this.governance.predict(proposal);
    this.memory.store('governance-screen', { proposal, result });
    return result;
  }
}
