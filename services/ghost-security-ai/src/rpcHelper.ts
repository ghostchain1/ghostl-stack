/**
 * JSON-RPC helper for GhostChain EVM endpoints.
 * Uses native node:http/https — no axios/ethers.
 * All methods use the ghost_ namespace.
 */

import { request as httpRequest }  from 'node:http';
import { request as httpsRequest } from 'node:https';

let _id = 0;
const TIMEOUT_MS = Number(process.env.SSA_RPC_TIMEOUT ?? 6000);

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
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout:  TIMEOUT_MS,
      },
      (res) => {
        let raw = '';
        res.on('data',  (c: Buffer) => { raw += c.toString(); });
        res.on('end',   () => {
          try {
            const env = JSON.parse(raw) as { result?: unknown; error?: { message?: string } };
            if (env.error) reject(new Error(env.error.message ?? JSON.stringify(env.error)));
            else resolve(env.result);
          } catch (e) { reject(e); }
        });
        res.on('error', reject);
      }
    );
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`RPC timeout: ${method}`)); });
    req.write(body);
    req.end();
  });
}

export function hexToBigInt(hex: unknown): bigint {
  if (typeof hex !== 'string') throw new TypeError(`Expected hex, got ${typeof hex}`);
  return BigInt(hex);
}

export function hexToNumber(hex: unknown): number {
  if (typeof hex !== 'string') return 0;
  return Number(BigInt(hex));
}

/** Strict hex address validation — prevents injection via untrusted input. */
export function isValidAddress(addr: unknown): addr is string {
  return typeof addr === 'string' && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

/** Sanitize a hex address — returns null if invalid. */
export function sanitizeAddress(addr: unknown): string | null {
  return isValidAddress(addr) ? addr.toLowerCase() : null;
}
