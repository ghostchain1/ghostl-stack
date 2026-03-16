import { GHOST_RPC_ENDPOINTS } from "@ghostchain/config";

/**
 * Ghost Wallet integration helper
 *
 * Ghost Wallet is GhostChain's native browser extension wallet.
 * It follows the EIP-1193 provider standard and self-identifies via:
 *   • window.ghostWallet          (primary injection)
 *   • EIP-6963 RDNS: "io.ghostchain.wallet"
 *   • Falls back to window.ethereum (EIP-1193 compat — not GhostChain branding)
 */

export const GHOST_WALLET_RDNS = "io.ghostchain.wallet";
export const GHOST_CHAIN_L2_ID = GHOST_RPC_ENDPOINTS.l2.chainId;

export interface GhostWalletProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
  isGhostWallet?: boolean;
}

declare global {
  interface Window {
    ghostWallet?: GhostWalletProvider;
    ethereum?: GhostWalletProvider & { isGhostWallet?: boolean }; // brand-enforcer-ignore — EIP-1193 property name must be "ethereum"
  }
}

// ─── Provider resolution ───────────────────────────────────────────────────

/** Resolve the best available EIP-1193 provider, favouring Ghost Wallet. */
export function resolveProvider(): GhostWalletProvider | null {
  if (typeof window === "undefined") return null;

  // 1. Native Ghost Wallet injection
  if (window.ghostWallet) return window.ghostWallet;

  // 2. EIP-6963 multi-provider list (injected as window.ethereum.providers in some setups)
  if (Array.isArray((window as unknown as { ethereum?: { providers?: GhostWalletProvider[] } }).ethereum?.providers)) { // brand-enforcer-ignore — EIP-1193 window.ethereum fallback
    const providers = (window as unknown as { ethereum: { providers: GhostWalletProvider[] } }).ethereum.providers; // brand-enforcer-ignore
    const ghost = providers.find((p) => p.isGhostWallet);
    if (ghost) return ghost;
  }

  // 3. Fallback to generic window.ethereum — EIP-1193 compat
  if (window.ethereum) return window.ethereum; // brand-enforcer-ignore

  return null;
}

// ─── Connection helpers ────────────────────────────────────────────────────

export async function requestAccounts(provider: GhostWalletProvider): Promise<string[]> {
  return provider.request({ method: "ghost_requestAccounts" }) as Promise<string[]>;
}

export async function getAccounts(provider: GhostWalletProvider): Promise<string[]> {
  return provider.request({ method: "ghost_accounts" }) as Promise<string[]>;
}

export async function getChainId(provider: GhostWalletProvider): Promise<number> {
  const raw = (await provider.request({ method: "ghost_chainId" })) as string;
  return parseInt(raw, 16);
}

export async function getBalance(
  provider: GhostWalletProvider,
  address: string,
): Promise<bigint> {
  const hex = (await provider.request({
    method: "ghost_getBalance",
    params: [address, "latest"],
  })) as string;
  return BigInt(hex);
}

/** Ask the wallet to switch to GhostChain L2. */
export async function switchToGhostChain(provider: GhostWalletProvider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchGhostChainChain",
      params: [{ chainId: "0x" + GHOST_CHAIN_L2_ID.toString(16) }],
    });
  } catch (err: unknown) {
    // Error code 4902 = chain not added yet
    if ((err as { code?: number }).code === 4902) {
      await provider.request({
        method: "wallet_addGhostChainChain",
        params: [
          {
            chainId: "0x" + GHOST_CHAIN_L2_ID.toString(16),
            chainName: "GhostL2",
            nativeCurrency: { name: "Ghost Standard Token", symbol: "GST", decimals: 18 },
            rpcUrls: [process.env.NEXT_PUBLIC_L2_RPC_URL ?? GHOST_RPC_ENDPOINTS.l2.publicUrl],
            blockExplorerUrls: [GHOST_RPC_ENDPOINTS.l2.explorerUrl],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

// ─── Formatting helpers ────────────────────────────────────────────────────

export function shortAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatGST(wei: bigint, decimals = 4): string {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(decimals);
}
