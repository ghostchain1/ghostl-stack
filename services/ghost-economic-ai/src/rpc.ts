/**
 * Minimal JSON-RPC helper for GhostChain EVM endpoints.
 *
 * Uses native node:http / node:https — no axios / ethers dependency.
 * All RPC methods use the ghost_ namespace as required by GhostChain conventions.
 */

import { request as httpRequest }  from 'node:http';
import { request as httpsRequest } from 'node:https';

let _id = 0;
const TIMEOUT_MS = Number(process.env.AEE_RPC_TIMEOUT ?? 6000);

export function rpcCall(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: ++_id, method, params });

    let parsed: URL;
    try { parsed = new URL(url); } catch { reject(new Error(`Invalid RPC URL: ${url}`)); return; }

    const isHttps = parsed.protocol === 'https:';
    const reqFn   = isHttps ? httpsRequest : httpRequest;

    const req = reqFn(
      {
        hostname: parsed.hostname,
        port:     Number(parsed.port) || (isHttps ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let raw = '';
        res.on('data',  (chunk: Buffer) => { raw += chunk.toString(); });
        res.on('end',   () => {
          try {
            const envelope = JSON.parse(raw) as { result?: unknown; error?: { message?: string } };
            if (envelope.error) {
              reject(new Error(envelope.error.message ?? JSON.stringify(envelope.error)));
            } else {
              resolve(envelope.result);
            }
          } catch (e) { reject(e); }
        });
        res.on('error', reject);
      }
    );

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`RPC timeout (${TIMEOUT_MS}ms): ${method}`)); });
    req.write(body);
    req.end();
  });
}

/** Parse a 0x-prefixed hex string returned by ghost_getBalance etc. */
export function hexToBigInt(hex: unknown): bigint {
  if (typeof hex !== 'string') throw new TypeError(`Expected hex string, got ${typeof hex}`);
  return BigInt(hex);
}

/** Parse ghost_blockNumber / ghost_getBlockByNumber number field */
export function hexToNumber(hex: unknown): number {
  if (typeof hex !== 'string') throw new TypeError(`Expected hex string, got ${typeof hex}`);
  return Number(BigInt(hex));
}
