import { TokenomicsEngine } from "../src/TokenomicsEngine";

const engine = new TokenomicsEngine();

export const TokenomicsAgent = {
  name: "TokenomicsAgent",
  description: "Evaluates supply/demand balance and recommends mint or burn actions",

  async react(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    switch (event.type) {
      case "supply_check": {
        const { supply, demand } = event.payload as { supply: number; demand: number };
        const report = engine.evaluate(supply, demand);
        console.log(
          `[TokenomicsAgent] ${report.action} ${report.amount} GST — ${report.reason} ` +
          `(ratio ${report.supplyRatio.toFixed(3)})`
        );
        break;
      }
      default:
        break;
    }
  },
};
