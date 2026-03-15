/**
 * GhostAccountRegistry — maps addresses to labels and metadata.
 */
export interface GhostAccount {
  address: string;
  label:   string;
  chain:   "L1" | "L2" | "L3";
  tags?:   string[];
}

export class GhostAccountRegistry {
  private registry: Map<string, GhostAccount> = new Map();

  register(account: GhostAccount): void {
    this.registry.set(account.address.toLowerCase(), account);
  }

  resolve(address: string): GhostAccount | undefined {
    return this.registry.get(address.toLowerCase());
  }

  list(): GhostAccount[] {
    return [...this.registry.values()];
  }

  byChain(chain: "L1" | "L2" | "L3"): GhostAccount[] {
    return this.list().filter(a => a.chain === chain);
  }
}
