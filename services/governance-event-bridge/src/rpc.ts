/**
 * governance-event-bridge — Minimal JSON-RPC client
 *
 * Uses native fetch (Node 18+). No ethers, no web3, no external RPC library.
 * Only the two methods needed for event polling are implemented.
 */

export interface GetLogsParams {
  /** Contract address to filter (checksummed or lowercase). */
  address: string;
  /** Array of topic0 selectors to filter on. OR-semantics (any match). */
  topics: [string[], ...unknown[]];
  fromBlock: string; // "0x..." hex
  toBlock:   string; // "0x..." hex
}

interface RpcRequest {
  jsonrpc: "2.0";
  id:      number;
  method:  string;
  params:  unknown[];
}

interface RpcResponse<T> {
  result?: T;
  error?:  { code: number; message: string };
}

let _reqId = 1;

async function rpcCall<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const body: RpcRequest = { jsonrpc: "2.0", id: _reqId++, method, params };
  const res = await fetch(url, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`RPC HTTP ${res.status} from ${url} (${method})`);
  }

  const json = (await res.json()) as RpcResponse<T>;
  if (json.error) {
    throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
  }
  if (json.result === undefined) {
    throw new Error(`RPC: empty result for ${method}`);
  }
  return json.result;
}

/**
 * Returns the latest finalised block number on the given network.
 */
export async function getLatestBlock(rpcUrl: string): Promise<bigint> {
  const hex = await rpcCall<string>(rpcUrl, "eth_blockNumber", []);
  return BigInt(hex);
}

export interface RawLog {
  address:         string;
  topics:          string[];
  data:            string;
  blockNumber:     string;
  transactionHash: string;
  logIndex:        string;
}

/**
 * Fetch event logs for a contract address and a set of topic0 selectors
 * between `fromBlock` and `toBlock` (inclusive, hex strings).
 *
 * NOTE: topic filtering uses OR semantics — any log matching any of the
 *       supplied topic0 values is returned.  We filter client-side in events.ts.
 */
export async function getLogs(
  rpcUrl:    string,
  address:   string,
  topic0s:   string[],
  fromBlock: bigint,
  toBlock:   bigint,
): Promise<RawLog[]> {
  const params = [
    {
      address,
      topics: [topic0s], // eth_getLogs topics is an array of OR-possible values per position
      fromBlock: "0x" + fromBlock.toString(16),
      toBlock:   "0x" + toBlock.toString(16),
    },
  ];
  return rpcCall<RawLog[]>(rpcUrl, "eth_getLogs", params);
}
