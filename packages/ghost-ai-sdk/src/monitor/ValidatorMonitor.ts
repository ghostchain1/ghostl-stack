import { GhostJsonRpcProvider } from "../chain/GhostJsonRpcProvider.js";
import type { ValidatorHealth } from "./Types.js";

export class ValidatorMonitor {
  async checkValidator(params: {
    id:      string;
    rpcHttp: string;
  }): Promise<ValidatorHealth> {
    const t0 = Date.now();
    try {
      const provider = new GhostJsonRpcProvider({
        layer:           "L1",
        endpoint:        { http: params.rpcHttp },
        ghostName:       "GhostChain",
        gasTokenSymbol:  "GST",
      });

      const [network, blockNumber] = await Promise.all([
        provider.getNetwork(),
        provider.getBlockNumber(),
      ]);

      return {
        id:          params.id,
        ok:          true,
        chainId:     Number(network.chainId),
        blockNumber,
        latencyMs:   Date.now() - t0,
      };
    } catch (err: unknown) {
      return {
        id:        params.id,
        ok:        false,
        latencyMs: Date.now() - t0,
        error:     err instanceof Error ? err.message : String(err),
      };
    }
  }

  async checkAll(
    validators: Array<{ id: string; rpcHttp: string }>
  ): Promise<ValidatorHealth[]> {
    return Promise.all(validators.map(v => this.checkValidator(v)));
  }
}
