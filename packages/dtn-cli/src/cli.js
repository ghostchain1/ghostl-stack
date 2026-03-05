#!/usr/bin/env node
/**
 * @file packages/dtn-cli/src/cli.js
 * @description GhostChain DTN CLI
 *
 * Usage:
 *   dtn pack    --artifacts <file.json> --chain-id <id> --nonce <n> --private-key <pem> --key-id <id> [--out <file>] [--valid-until <unix>]
 *   dtn verify  --bundle <file.json> --keys <keys.json> [--threshold <n>]
 *   dtn sign    --bundle <file.json> --private-key <pem> --key-id <id> [--out <file>]
 *   dtn push    --bundle <file.json> --relay <url>
 *   dtn pull    --bundle-id <id> --relay <url> [--out <file>]
 *   dtn status  --relay <url>
 *   dtn help
 *
 * All operations are offline-capable except push/pull/status.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

// Lazy-import governance-bundle so CLI works even if workspace not installed
// (for monorepo symlink scenarios)
let gb;
async function getGb() {
  if (!gb) {
    try {
      gb = await import('@ghostchain/governance-bundle');
    } catch {
      // Fallback: relative import for running inside the monorepo
      gb = await import('../../governance-bundle/index.js');
    }
  }
  return gb;
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function require_(args, ...keys) {
  for (const k of keys) {
    if (!args[k]) { die(`Missing --${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`); }
  }
}

function die(msg, code = 1) {
  process.stderr.write(`\x1b[31mERROR:\x1b[0m ${msg}\n`);
  process.exit(code);
}

function ok(msg) {
  process.stdout.write(`\x1b[32m✓\x1b[0m ${msg}\n`);
}

function info(msg) {
  process.stdout.write(`  ${msg}\n`);
}

// ─── HTTP fetch helper (no ext deps) ─────────────────────────────────────────

function httpFetch(url, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? (await import('node:https')).default
      : (await import('node:http')).default;
    // Actually Node doesn't support top-level await in this closure; use static import
    resolve(null); // placeholder — see implementation below
  });
}

// Real fetch implementation using dynamic import (sync-ish via callback)
async function relayRequest(relayUrl, path, { method = 'GET', body } = {}) {
  const { request } = await import('node:http');
  const { request: requestHttps } = await import('node:https');
  const isHttps = relayUrl.startsWith('https://');
  const u = new URL(path, relayUrl);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };
    const req = (isHttps ? requestHttps : request)(options, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdPack(args) {
  require_(args, 'artifacts', 'chainId', 'nonce', 'privateKey', 'keyId');
  const { createBundle, CHAIN_IDS } = await getGb();

  const artifacts = JSON.parse(readFileSync(args.artifacts, 'utf8'));
  const chainId = parseInt(args.chainId, 10);
  const nonce = parseInt(args.nonce, 10);
  const privKey = readFileSync(args.privateKey, 'utf8');
  const validUntil = args.validUntil ? parseInt(args.validUntil, 10) : undefined;
  const bundleId = args.bundleId ?? `bundle-${Date.now()}`;

  if (!Object.values(CHAIN_IDS).includes(chainId)) {
    die(`Invalid --chain-id ${chainId}. Valid: ${Object.entries(CHAIN_IDS).map(([k,v]) => `${k}=${v}`).join(', ')}`);
  }

  const bundle = createBundle({ artifacts, bundleId, chainId, nonce, signerPrivKey: privKey, signerPublicKeyId: args.keyId, validUntil });

  const out = args.out ?? `${bundleId}.bundle.json`;
  writeFileSync(out, JSON.stringify(bundle, null, 2));
  ok(`Bundle created: ${out}`);
  info(`  bundleId: ${bundle.header.bundleId}`);
  info(`  chainId:  ${bundle.header.chainId}`);
  info(`  nonce:    ${bundle.header.nonce}`);
  info(`  merkle:   ${bundle.merkle.root}`);
  info(`  digest:   ${bundle.bundleDigest}`);
  info(`  sigs:     ${bundle.signatures.length}`);
}

async function cmdVerify(args) {
  require_(args, 'bundle', 'keys');
  const { verifyBundle } = await getGb();

  const bundle = JSON.parse(readFileSync(args.bundle, 'utf8'));
  const keys = JSON.parse(readFileSync(args.keys, 'utf8')); // [{ keyId, publicKey }]
  const threshold = parseInt(args.threshold ?? '1', 10);

  const { valid, errors } = verifyBundle(bundle, keys, threshold);
  if (valid) {
    ok(`Bundle verified ✓ (threshold ${threshold})`);
    info(`  bundleId: ${bundle.header.bundleId}`);
    info(`  merkle:   ${bundle.merkle.root}`);
  } else {
    die(`Bundle verification FAILED:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
}

async function cmdSign(args) {
  require_(args, 'bundle', 'privateKey', 'keyId');
  const { signBundle } = await getGb();

  const bundle = JSON.parse(readFileSync(args.bundle, 'utf8'));
  const privKey = readFileSync(args.privateKey, 'utf8');

  const signed = signBundle(bundle, privKey, args.keyId);
  const out = args.out ?? args.bundle;
  writeFileSync(out, JSON.stringify(signed, null, 2));
  ok(`Added signature for keyId '${args.keyId}' → ${out} (total sigs: ${signed.signatures.length})`);
}

async function cmdPush(args) {
  require_(args, 'bundle', 'relay');
  const bundle = JSON.parse(readFileSync(args.bundle, 'utf8'));
  const body = JSON.stringify(bundle);

  ok(`Pushing bundle '${bundle.header.bundleId}' to ${args.relay} ...`);
  const res = await relayRequest(args.relay, '/ingest', { method: 'POST', body });

  if (res.status === 201) {
    ok(`Relay accepted bundle`);
    info(`  digest: ${res.body.digest}`);
  } else {
    die(`Relay rejected bundle: HTTP ${res.status}\n${JSON.stringify(res.body, null, 2)}`);
  }
}

async function cmdPull(args) {
  require_(args, 'bundleId', 'relay');
  const res = await relayRequest(args.relay, `/fetch/${encodeURIComponent(args.bundleId)}`);

  if (res.status === 200) {
    const bundle = res.body.bundle;
    const out = args.out ?? `${args.bundleId}.pulled.json`;
    writeFileSync(out, JSON.stringify(bundle, null, 2));
    ok(`Bundle retrieved → ${out}`);
    info(`  receivedAt: ${new Date(res.body.receivedAt * 1000).toISOString()}`);
    info(`  digest:     ${res.body.digest}`);
  } else {
    die(`Pull failed: HTTP ${res.status} — ${JSON.stringify(res.body)}`);
  }
}

async function cmdStatus(args) {
  require_(args, 'relay');
  const res = await relayRequest(args.relay, '/status');
  if (res.status === 200) {
    ok(`Relay status`);
    for (const [k, v] of Object.entries(res.body)) info(`  ${k}: ${v}`);
  } else {
    die(`Status check failed: HTTP ${res.status}`);
  }
}

function cmdHelp() {
  process.stdout.write(`
GhostChain DTN CLI — offline governance bundle tooling

COMMANDS
  pack      Create a signed governance bundle from a JSON artifact list
  verify    Verify a bundle's integrity, Merkle proofs, and signatures
  sign      Co-sign an existing bundle with an additional key
  push      Upload a bundle to a DTN relay
  pull      Download a bundle from a DTN relay by ID
  status    Check DTN relay health
  help      Print this message

EXAMPLES
  dtn pack \\
    --artifacts proposals.json \\
    --chain-id 901 \\
    --nonce 1 \\
    --private-key governor.key.pem \\
    --key-id governor-1 \\
    --out gov-bundle.json

  dtn sign  --bundle gov-bundle.json --private-key cosigner.pem --key-id cosigner-1
  dtn verify --bundle gov-bundle.json --keys allowed-keys.json --threshold 2
  dtn push  --bundle gov-bundle.json --relay http://127.0.0.1:7740
  dtn pull  --bundle-id bundle-123 --relay http://10.0.0.5:7740 --out out.json
  dtn status --relay http://127.0.0.1:7740
`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const [,, cmd, ...rest] = process.argv;
const args = parseArgs(rest);

const commands = { pack: cmdPack, verify: cmdVerify, sign: cmdSign, push: cmdPush, pull: cmdPull, status: cmdStatus, help: cmdHelp };

if (!cmd || !commands[cmd]) {
  if (cmd && cmd !== 'help') process.stderr.write(`Unknown command: ${cmd}\n`);
  cmdHelp();
  process.exit(cmd ? 1 : 0);
}

commands[cmd](args).catch(err => die(err.message));
