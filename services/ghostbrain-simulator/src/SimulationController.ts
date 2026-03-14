/**
 * SimulationController — orchestrates all GhostBrain simulation modules.
 */
import * as fs from "fs";
import * as path from "path";
import { InfrastructureSimulator } from "./InfrastructureSimulator";
import { ValidatorSimulator }      from "./ValidatorSimulator";
import { MarketSimulator }         from "./MarketSimulator";
import { GovernanceSimulator }     from "./GovernanceSimulator";
import { RiskAnalyzer }            from "./RiskAnalyzer";

export interface Scenario {
  name:   string;
  type:   string;
  params: Record<string, unknown>;
}

export class SimulationController {
  private infra      = new InfrastructureSimulator();
  private validator  = new ValidatorSimulator();
  private market     = new MarketSimulator();
  private governance = new GovernanceSimulator();
  private risk       = new RiskAnalyzer();

  async runScenario(scenario: Scenario): Promise<Record<string, unknown>> {
    console.log(`[Simulator] Running scenario: ${scenario.name}`);
    let result: Record<string, unknown> = {};

    switch (scenario.type) {
      case "node_failure":
        result = this.infra.simulateNodeFailure(
          scenario.params["totalNodes"] as number ?? 10,
          scenario.params["failedNodes"] as number ?? 2
        ) as unknown as Record<string, unknown>;
        break;

      case "validator_attack":
        result = this.validator.simulateAttack(
          scenario.params["validators"] as number ?? 50,
          scenario.params["attackers"] as number ?? 15
        ) as unknown as Record<string, unknown>;
        break;

      case "gas_spike":
        result = this.market.simulateGasMarket(
          scenario.params["pendingTxCount"] as number ?? 2000
        ) as unknown as Record<string, unknown>;
        break;

      case "liquidity_crash":
        result = this.market.simulateLiquidity(
          scenario.params["poolSize"] as number ?? 1_000_000,
          scenario.params["tradeSize"] as number ?? 500_000
        ) as unknown as Record<string, unknown>;
        break;

      case "governance_vote":
        result = this.governance.simulateVote(
          scenario.params["voters"] as number ?? 1000
        ) as unknown as Record<string, unknown>;
        break;

      default:
        console.warn(`[Simulator] Unknown scenario type: ${scenario.type}`);
    }

    const riskReport = this.risk.analyze(result);
    return { ...result, riskReport };
  }

  loadScenario(name: string): Scenario {
    const file = path.join(__dirname, "../scenarios", `${name}.json`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
}
