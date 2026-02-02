import { getAddress } from "ethers";
import fs from "node:fs/promises";
import path from "node:path";

type NonceFileShape = {
  nonces: Record<string, string>;
  updatedAt: string;
};

const toBigInt = (value: bigint | number | string): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.floor(value));
  return BigInt(value);
};

export class NonceStore {
  private readonly filePath: string;
  private readonly map = new Map<string, bigint>();
  private dirty = false;

  private constructor(filePath: string) {
    this.filePath = filePath;
  }

  static async create(filePath: string): Promise<NonceStore> {
    const store = new NonceStore(filePath);
    await store.load();
    return store;
  }

  private normalize(address: string): string {
    return getAddress(address);
  }

  private async ensureDir(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  private async load(): Promise<void> {
    await this.ensureDir();
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as NonceFileShape;
      if (!parsed?.nonces) return;
      Object.entries(parsed.nonces).forEach(([address, nonce]) => {
        try {
          this.map.set(this.normalize(address), toBigInt(nonce));
        } catch {
          // Ignore malformed entries to keep startup resilient.
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("ENOENT")) {
        console.warn(`[ai-attestor] nonce store load warning: ${message}`);
      }
    }
  }

  private async persist(): Promise<void> {
    if (!this.dirty) return;
    await this.ensureDir();
    const payload: NonceFileShape = {
      nonces: Object.fromEntries(
        Array.from(this.map.entries()).map(([address, nonce]) => [address, nonce.toString()])
      ),
      updatedAt: new Date().toISOString()
    };
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2));
    await fs.rename(tmpPath, this.filePath);
    this.dirty = false;
  }

  get(address: string): bigint {
    const key = this.normalize(address);
    return this.map.get(key) ?? 0n;
  }

  async set(address: string, value: bigint | number | string): Promise<void> {
    const key = this.normalize(address);
    const next = toBigInt(value);
    const prev = this.map.get(key) ?? 0n;
    if (next !== prev) {
      this.map.set(key, next);
      this.dirty = true;
      await this.persist();
    }
  }

  async syncFromChain(address: string, chainNonce: bigint | number | string): Promise<bigint> {
    const chainValue = toBigInt(chainNonce);
    const current = this.get(address);
    if (chainValue > current) {
      await this.set(address, chainValue);
      return chainValue;
    }
    return current;
  }

  async resetToChain(address: string, chainNonce: bigint | number | string): Promise<bigint> {
    const chainValue = toBigInt(chainNonce);
    await this.set(address, chainValue);
    return chainValue;
  }

  async reserveNextNonce(address: string, chainNonce: bigint | number | string): Promise<bigint> {
    const synced = await this.syncFromChain(address, chainNonce);
    const next = synced + 1n;
    await this.set(address, next);
    return next;
  }
}
