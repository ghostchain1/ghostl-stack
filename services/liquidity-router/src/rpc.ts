import { ethers } from "ethers";

export type ExternalRpcMap = Record<string, string[]>;

export const parseRpcUrlList = (raw: string): string[] =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => Boolean(s));

const timeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  if (timeoutMs <= 0) return promise;
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout:${label}`)), timeoutMs))
  ]);
};

export type LatestBlockInfo = {
  url: string;
  chainId: bigint;
  blockNumber: number;
  blockHash: string;
  blockTimestamp: number;
  latencyMs: number;
};

export class RpcPool {
  private readonly urls: string[];
  private readonly providers: Map<string, ethers.JsonRpcProvider>;
  private cursor: number;

  constructor(urls: string[]) {
    const uniq = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean)));
    if (uniq.length === 0) throw new Error("rpc_pool_empty");
    this.urls = uniq;
    this.providers = new Map();
    this.cursor = 0;
  }

  private provider(url: string): ethers.JsonRpcProvider {
    const existing = this.providers.get(url);
    if (existing) return existing;
    const p = new ethers.JsonRpcProvider(url);
    this.providers.set(url, p);
    return p;
  }

  private orderedUrls(): string[] {
    const start = Math.max(0, Math.min(this.cursor, this.urls.length - 1));
    return [...this.urls.slice(start), ...this.urls.slice(0, start)];
  }

  async fetchLatestBlock(expectedChainId: bigint, timeoutMs: number): Promise<LatestBlockInfo> {
    const errors: { url: string; error: string }[] = [];
    for (const [idx, url] of this.orderedUrls().entries()) {
      const provider = this.provider(url);
      const start = Date.now();
      try {
        const net = await timeout(provider.getNetwork(), timeoutMs, "getNetwork");
        if (net.chainId !== expectedChainId) {
          throw new Error(`chainId_mismatch:${net.chainId.toString()}!=${expectedChainId.toString()}`);
        }
        const bn = await timeout(provider.getBlockNumber(), timeoutMs, "getBlockNumber");
        const block = await timeout(provider.getBlock(bn), timeoutMs, "getBlock");
        if (!block || !block.hash) throw new Error("missing_block");
        const latencyMs = Date.now() - start;
        this.cursor = (this.cursor + idx) % this.urls.length;
        return {
          url,
          chainId: expectedChainId,
          blockNumber: bn,
          blockHash: block.hash,
          blockTimestamp: Number(block.timestamp),
          latencyMs
        };
      } catch (e) {
        errors.push({ url, error: (e as any)?.message || String(e) });
      }
    }
    throw new Error(`rpc_pool_all_failed:${JSON.stringify(errors)}`);
  }
}

