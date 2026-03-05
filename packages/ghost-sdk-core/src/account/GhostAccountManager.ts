// ─────────────────────────────────────────────────────────────────────────────
// GhostAccountManager – Multi-wallet, HD-style account management
// ─────────────────────────────────────────────────────────────────────────────
import { GhostWallet } from "../wallet/GhostWallet";
import { GhostWalletError } from "../errors";

export interface ManagedAccount {
  index: number;
  address: string;
  wallet: GhostWallet;
  label?: string;
}

export class GhostAccountManager {
  private accounts: ManagedAccount[] = [];
  private activeIndex = 0;

  /** Add a wallet from a private key string. */
  addAccount(privateKey: string, label?: string): ManagedAccount {
    const wallet = new GhostWallet(privateKey);
    const account: ManagedAccount = {
      index: this.accounts.length,
      address: wallet.address,
      wallet,
      label
    };
    this.accounts.push(account);
    return account;
  }

  /** Generate a fresh random account. */
  createRandom(label?: string): ManagedAccount {
    const wallet = GhostWallet.generateRandom();
    const account: ManagedAccount = {
      index: this.accounts.length,
      address: wallet.address,
      wallet,
      label
    };
    this.accounts.push(account);
    return account;
  }

  /** Set the active signing account by index or address. */
  setActive(indexOrAddress: number | string): void {
    if (typeof indexOrAddress === "number") {
      if (!this.accounts[indexOrAddress]) {
        throw new GhostWalletError(`No account at index ${indexOrAddress}`);
      }
      this.activeIndex = indexOrAddress;
    } else {
      const idx = this.accounts.findIndex(
        (a) => a.address.toLowerCase() === indexOrAddress.toLowerCase()
      );
      if (idx === -1) {
        throw new GhostWalletError(`Account not found: ${indexOrAddress}`);
      }
      this.activeIndex = idx;
    }
  }

  get active(): ManagedAccount {
    const acc = this.accounts[this.activeIndex];
    if (!acc) throw new GhostWalletError("No accounts loaded");
    return acc;
  }

  getAll(): ManagedAccount[] {
    return [...this.accounts];
  }

  count(): number {
    return this.accounts.length;
  }
}
