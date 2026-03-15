/**
 * GhostKeyManager — secure key storage and retrieval for GhostStack.
 * Production: integrate hardware wallet / vault backend.
 */
export class GhostKeyManager {
  private keys: Map<string, string> = new Map();

  store(label: string, privateKey: string): void {
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error("GhostKeyManager: invalid private key format");
    }
    this.keys.set(label, privateKey);
  }

  get(label: string): string {
    const key = this.keys.get(label);
    if (!key) throw new Error(`GhostKeyManager: key '${label}' not found`);
    return key;
  }

  list(): string[] {
    return [...this.keys.keys()];
  }

  remove(label: string): void {
    this.keys.delete(label);
  }
}
