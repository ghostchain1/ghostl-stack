/**
 * @file src/topology/networkMap.ts
 * Ghost Global Network Intelligence — Network topology mapper.
 *
 * Polls L1, L2, and L3 RPC endpoints for peer counts and block numbers.
 * Uses the canonical `ghost_` RPC namespace (never `eth_` or `net_`).
 * Returns a TopologySnapshot — this module makes NO infrastructure changes.
 */

import https from 'node:https';
import http  from 'node:http';
import { NodeInfo, ChainLayer, TopologySnapshot } from '../types.js';
import { detectGaps } from '../regions/geoAnalyzer.js';

const PEER_MIN    = parseInt(process.env.GNI_PEER_MIN    ?? '5',   10);
const RPC_TIMEOUT = parseInt(process.env.GNI_RPC_TIMEOUT ?? '6000', 10);

interface ChainEndpoint { url: string; chain: ChainLayer }

function getEndpoints(): ChainEndpoint[] {
  return [
    { url: process.env.L1_RPC_URL ?? 'http://localhost:18545', chain: 'l1' },
    { url: process.env.L2_RPC_URL ?? 'http://localhost:29545', chain: 'l2' },
    { url: process.env.L3_RPC_URL ?? 'http://localhost:39545', chain: 'l3' },
  ];
}

function makeRpcCall(rawUrl: string, method: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const body    = JSON.stringify({ jsonrpc: '2.0', method, params: [], id: 1 });
    const url     = new URL(rawUrl);
    const mod     = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname || '/',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     'ghost-global-intelligence/1.0',
      },
      timeout: timeoutMs,
    };
    const req = mod.request(options, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw) as { result?: string };
          if (parsed.result !== undefined) resolve(parsed.result);
          else reject(new Error('no result in RPC response'));
        } catch { reject(new Error('invalid JSON from RPC')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('RPC timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function pollNode(endpoint: ChainEndpoint): Promise<NodeInfo> {
  const start = Date.now();
  try {
    const [peerHex, blockHex] = await Promise.all([
      makeRpcCall(endpoint.url, 'ghost_peerCount',   RPC_TIMEOUT),
      makeRpcCall(endpoint.url, 'ghost_blockNumber', RPC_TIMEOUT),
    ]);
    return {
      endpoint:    endpoint.url,
      chain:       endpoint.chain,
      peers:       parseInt(peerHex, 16),
      blockNumber: BigInt(blockHex),
      lastSeen:    Date.now(),
      latencyMs:   Date.now() - start,
      healthy:     true,
    };
  } catch {
    return {
      endpoint:    endpoint.url,
      chain:       endpoint.chain,
      peers:       0,
      blockNumber: 0n,
      lastSeen:    Date.now(),
      latencyMs:   Date.now() - start,
      healthy:     false,
    };
  }
}

export async function analyzeNetwork(): Promise<TopologySnapshot> {
  const endpoints = getEndpoints();
  const nodes     = await Promise.all(endpoints.map(pollNode));

  const peerCounts    = nodes.map(n => n.peers);
  const totalPeers    = peerCounts.reduce((a, b) => a + b, 0);
  const avgPeers      = nodes.length > 0 ? totalPeers / nodes.length : 0;
  const minPeers      = peerCounts.length > 0 ? Math.min(...peerCounts) : 0;
  const unhealthyCount = nodes.filter(n => !n.healthy || n.peers < PEER_MIN).length;

  return {
    ts:           Date.now(),
    nodes,
    totalPeers,
    avgPeers,
    minPeers,
    gaps:         detectGaps(nodes),
    unhealthyCount,
  };
}
