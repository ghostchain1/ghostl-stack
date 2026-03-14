/**
 * GhostGasOracle — monitors on-chain gas conditions and recommends pricing.
 */
import { GhostProvider } from "../core/GhostProvider";
import { GhostGasEngine } from "./GhostGasEngine";

export interface GhostGasSuggestion {
  slow:     string;  // GhostUnits
  standard: string;
  fast:     string;
}

export class GhostGasOracle {
  private provider: GhostProvider;
  private history:  bigint[] = [];

  constructor(provider: GhostProvider) {
    this.provider = provider;
  }

  async getSuggestion(): Promise<GhostGasSuggestion> {
    const base = BigInt(await GhostGasEngine.getGasPrice(this.provider));
    this.history.push(base);
    if (this.history.length > 100) this.history.shift();

    return {
      slow:     (base * 8n / 10n).toString(),
      standard: base.toString(),
      fast:     (base * 12n / 10n).toString(),
    };
  }

  averageGasPrice(): string {
    if (this.history.length === 0) return "0";
    const sum = this.history.reduce((a, b) => a + b, 0n);
    return (sum / BigInt(this.history.length)).toString();
  }
}
