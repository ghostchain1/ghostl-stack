export const ECON_INDEXER_URL = process.env.ECON_INDEXER_URL || process.env.NEXT_PUBLIC_ECON_INDEXER_URL || "http://localhost:7603";

export async function fetchEcon<T>(path: string): Promise<T> {
  const response = await fetch(`${ECON_INDEXER_URL}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`econ_fetch_failed:${response.status}`);
  }
  return (await response.json()) as T;
}
