import {
  Contract,
  GhostBrowserProvider,
  MaxUint256,
  parseUnits,
  type ContractTransactionResponse,
  type Signer,
} from "@ghostchain/sdk";

export const GHOSTX_LAYER = "L2" as const;

type GhostXBrowserTransport = ConstructorParameters<typeof GhostBrowserProvider>[0];

export type { ContractTransactionResponse, Signer };

export function createGhostXBrowserProvider(provider: unknown) {
  return new GhostBrowserProvider(provider as GhostXBrowserTransport, GHOSTX_LAYER);
}

export function createGhostXContract(
  address: string,
  abi: readonly string[] | string[],
  runner: GhostBrowserProvider | Signer
) {
  return new Contract(address, abi as string[], runner);
}

export function parseGhostXUnits(value: string, decimals = 18) {
  return parseUnits(value, decimals);
}

export { MaxUint256 };
