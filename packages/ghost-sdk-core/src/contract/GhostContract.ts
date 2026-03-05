import { GhostProvider } from "../provider/GhostProvider";
import { GhostAbiCoder } from "../abi/GhostAbiCoder";
import { GhostEventDecoder } from "../abi/GhostEventDecoder";
import { GhostABIError } from "../errors";
import type { GhostABIFragment, GhostLog } from "../types";

export class GhostContract {
  private coder: GhostAbiCoder;
  private decoder: GhostEventDecoder;

  constructor(
    public readonly address: string,
    public readonly abi: GhostABIFragment[],
    public readonly provider: GhostProvider
  ) {
    this.coder = new GhostAbiCoder();
    this.decoder = new GhostEventDecoder(abi);
  }

  async read<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const fragment = this.findFragment(method, "function");
    const data = this.coder.encodeFunctionCall(fragment, params);
    const result = await this.provider.call({ to: this.address, data });
    return this.coder.decodeFunctionResult(fragment, result) as T;
  }

  async write(method: string, params: unknown[] = []): Promise<string> {
    const fragment = this.findFragment(method, "function");
    const data = this.coder.encodeFunctionCall(fragment, params);
    return this.provider.sendRawTransaction(data);
  }

  async queryFilter(eventName: string, fromBlock = 0, toBlock: number | "latest" = "latest") {
    const fragment = this.findFragment(eventName, "event");
    const topic = this.coder.encodeEventTopic(fragment);
    const logs = await this.provider.getLogs({
      address: this.address,
      fromBlock,
      toBlock,
      topics: [topic]
    });
    return (logs as GhostLog[]).map((log) => this.decoder.decode(log));
  }

  private findFragment(name: string, type: "function" | "event"): GhostABIFragment {
    const frag = this.abi.find((f) => f.type === type && f.name === name);
    if (!frag) {
      throw new GhostABIError(`ABI fragment not found: ${name} (${type})`);
    }
    return frag;
  }
}
