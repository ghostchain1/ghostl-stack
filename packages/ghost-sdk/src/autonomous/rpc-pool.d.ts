/**
 * RPC Pool — continuous health monitoring, head-lag tracking, and
 * circuit-breaker per endpoint.
 *
 * Health probe runs on a configurable interval (default 5 s).  Each probe
 * updates latency, head-lag and error-rate via exponential moving averages.
 * After `FAILURE_THRESHOLD` consecutive failures the endpoint circuit opens.
 * The circuit closes automatically after an exponential back-off period.
 */
import { JsonRpcProvider } from "ethers";
import type { RpcHealth } from "./ai-engine.js";
export declare class RpcPool {
    private entries;
    private probeInterval?;
    constructor(urls: Array<{
        url: string;
        layer: RpcHealth["layer"];
    }>);
    startHealthLoop(periodMs?: number): this;
    stopHealthLoop(): this;
    /** Return a health snapshot for every endpoint on the given layer. */
    list(layer: RpcHealth["layer"]): RpcHealth[];
    /** Return the ghost provider for a known URL. */
    getProvider(url: string): JsonRpcProvider;
    markSuccess(url: string, latencyMs: number, headNumber: number, bestHead: number): void;
    markFailure(url: string): void;
    private _probeAll;
}
//# sourceMappingURL=rpc-pool.d.ts.map