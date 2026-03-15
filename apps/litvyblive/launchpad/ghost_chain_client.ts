/**
 * GhostChain JSON-RPC client — no ethers/web3 dependency.
 * Uses native `fetch` with the `ghost_` namespace to interact with GhostL3.
 */

const L3_RPC = process.env.GHOSTL3_RPC_URL ?? 'http://localhost:39545';

let _reqId = 1;

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(L3_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: _reqId++, method, params }),
  });
  if (!res.ok) throw new Error(`GhostRPC HTTP ${res.status}`);
  const json = await res.json() as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`GhostRPC error: ${json.error.message}`);
  return json.result as T;
}

// Encode a uint256 call with a bytes4 selector (simplified ABI encoder, 1-arg)
function encodeUint256Call(selector: string, value: bigint): string {
  const sel = selector.startsWith('0x') ? selector.slice(2) : selector;
  const hex = value.toString(16).padStart(64, '0');
  return '0x' + sel + hex;
}

// Encode a no-arg call
function encodeNoArgCall(selector: string): string {
  const sel = selector.startsWith('0x') ? selector.slice(2) : selector;
  return '0x' + sel;
}

// Decode a uint256 from a 32-byte hex result
function decodeUint256(hex: string): bigint {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  return BigInt('0x' + h);
}

/** Read token balance of `holder` from a GRC-20 token at `tokenAddress` on GhostL3 */
export async function getTokenBalance(tokenAddress: string, holder: string): Promise<bigint> {
  // balanceOf(address) selector = 0x70a08231
  const data = '0x70a08231' + holder.replace('0x', '').padStart(64, '0');
  const result = await rpc<string>('eth_call', [
    { to: tokenAddress, data },
    'latest',
  ]);
  return decodeUint256(result);
}

/** Read totalSupply() of a GRC-20 token on GhostL3 */
export async function getTotalSupply(tokenAddress: string): Promise<bigint> {
  const data = encodeNoArgCall('0x18160ddd'); // totalSupply()
  const result = await rpc<string>('eth_call', [{ to: tokenAddress, data }, 'latest']);
  return decodeUint256(result);
}

/** Read maxSupply (immutable) of a CreatorToken — slot via getter */
export async function getMaxSupply(tokenAddress: string): Promise<bigint> {
  // maxSupply() selector on CreatorToken — 4-byte: keccak("maxSupply()")[:4] = 0xd5abeb01
  const data = encodeNoArgCall('0xd5abeb01');
  const result = await rpc<string>('eth_call', [{ to: tokenAddress, data }, 'latest']);
  return decodeUint256(result);
}

/** Get current GhostL3 block number */
export async function getBlockNumber(): Promise<bigint> {
  const result = await rpc<string>('eth_blockNumber');
  return BigInt(result);
}
