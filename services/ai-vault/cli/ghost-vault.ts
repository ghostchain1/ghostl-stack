#!/usr/bin/env node
/**
 * GhostStack AI Vault — CLI
 * Connects to the vault REST API to manage secrets and keys.
 *
 * Usage: ghost-vault <command> [options]
 *
 * Auth is via VAULT_TOKEN env var.  API URL via VAULT_API_URL env var
 * (default: http://localhost:7710).
 */

import { Command } from 'commander';

const API_URL   = process.env['VAULT_API_URL']  ?? 'http://localhost:7710';
const VAULT_TOK = process.env['VAULT_TOKEN']    ?? '';

// ── HTTP helpers ─────────────────────────────────────────────────────────────

interface FetchOpts {
  method?: string;
  body?:   unknown;
}

async function req<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method:  opts.method ?? 'GET',
    headers: {
      'Authorization': `Bearer ${VAULT_TOK}`,
      'Content-Type':  'application/json',
    },
    ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
  });

  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    const errMsg = (typeof json === 'object' && json !== null && 'error' in json)
      ? String((json as Record<string, unknown>)['error'])
      : `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return json as T;
}

function print(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function die(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[ghost-vault] Error: ${msg}`);
  process.exit(1);
}

// ── Program ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('ghost-vault')
  .description('GhostStack AI Vault CLI — GhostChain L1/L2/L3 secret & key management (GST)')
  .version('1.0.0');

// ── Auth ──────────────────────────────────────────────────────────────────────

const auth = program.command('auth').description('Authentication commands');

auth
  .command('token')
  .description('Obtain a vault JWT using the vault token')
  .option('--roles <roles>', 'Comma-separated roles', 'admin')
  .action(async (opts: { roles: string }) => {
    const roles = opts.roles.split(',').map(r => r.trim());
    try {
      const result = await req('/auth/token', {
        method: 'POST',
        body:   { vaultToken: VAULT_TOK, roles },
      });
      print(result);
    } catch (err) { die(err); }
  });

auth
  .command('verify')
  .description('Verify the current JWT in VAULT_TOKEN')
  .action(async () => {
    try {
      const result = await req('/auth/verify');
      print(result);
    } catch (err) { die(err); }
  });

auth
  .command('revoke')
  .description('Revoke the current JWT in VAULT_TOKEN')
  .action(async () => {
    try {
      const result = await req('/auth/revoke', { method: 'POST', body: {} });
      print(result);
    } catch (err) { die(err); }
  });

// ── Secrets ───────────────────────────────────────────────────────────────────

const secret = program.command('secret').description('Secret management commands');

secret
  .command('store <path> <value>')
  .description('Store a secret at a vault path')
  .option('--namespace <ns>', 'Namespace', 'default')
  .option('--type <type>', 'Secret type', 'generic')
  .action(async (path: string, value: string, opts: { namespace: string; type: string }) => {
    try {
      const result = await req('/vault/secret', {
        method: 'POST',
        body:   { path, value, namespace: opts.namespace, type: opts.type },
      });
      print(result);
    } catch (err) { die(err); }
  });

secret
  .command('get <path>')
  .description('Retrieve a secret value')
  .action(async (rawPath: string) => {
    try {
      const encoded = encodeURIComponent(rawPath);
      const result  = await req(`/vault/secret/${encoded}`);
      print(result);
    } catch (err) { die(err); }
  });

secret
  .command('rotate <path>')
  .description('Auto-rotate a secret (generates new random value)')
  .option('--reason <reason>', 'Rotation reason', 'manual-cli')
  .action(async (rawPath: string, opts: { reason: string }) => {
    const encoded = encodeURIComponent(rawPath);
    try {
      const result = await req(`/vault/secret/${encoded}/rotate`, {
        method: 'POST',
        body:   { reason: opts.reason },
      });
      print(result);
    } catch (err) { die(err); }
  });

secret
  .command('delete <path>')
  .description('Delete a secret')
  .action(async (rawPath: string) => {
    const encoded = encodeURIComponent(rawPath);
    try {
      const result = await req(`/vault/secret/${encoded}`, { method: 'DELETE' });
      print(result);
    } catch (err) { die(err); }
  });

secret
  .command('list [namespace]')
  .description('List secrets, optionally filtered by namespace prefix')
  .action(async (namespace?: string) => {
    try {
      const qs     = namespace ? `?namespace=${encodeURIComponent(namespace)}` : '';
      const result = await req(`/vault/secrets${qs}`);
      print(result);
    } catch (err) { die(err); }
  });

// ── Keys ──────────────────────────────────────────────────────────────────────

const key = program.command('key').description('Cryptographic key management');

key
  .command('generate')
  .description('Generate a new cryptographic key')
  .requiredOption('--name <name>',      'Key name')
  .requiredOption('--purpose <purpose>', 'Purpose (e.g. signing, encryption)')
  .option('--algorithm <algo>',         'Algorithm (ed25519|secp256k1|aes-256-gcm|x25519)', 'ed25519')
  .option('--layer <layer>',            'GhostChain layer (l1|l2|l3)', 'l1')
  .option('--chain-id <id>',            'Chain ID (14000101|901|903)', '14000101')
  .action(async (opts: {
    name: string; purpose: string; algorithm: string; layer: string; chainId: string;
  }) => {
    try {
      const result = await req('/vault/key/generate', {
        method: 'POST',
        body:   {
          name:      opts.name,
          purpose:   opts.purpose,
          algorithm: opts.algorithm,
          layer:     opts.layer,
          chainId:   parseInt(opts.chainId, 10),
        },
      });
      print(result);
    } catch (err) { die(err); }
  });

key
  .command('rotate <keyId>')
  .description('Rotate a key by ID')
  .option('--reason <reason>', 'Rotation reason', 'manual-cli')
  .action(async (keyId: string, opts: { reason: string }) => {
    try {
      const result = await req('/vault/key/rotate', {
        method: 'POST',
        body:   { keyId, reason: opts.reason },
      });
      print(result);
    } catch (err) { die(err); }
  });

key
  .command('sign <keyId> <hexMessage>')
  .description('Sign a hex-encoded message with a key')
  .action(async (keyId: string, hexMessage: string) => {
    try {
      const result = await req(`/vault/key/${keyId}/sign`, {
        method: 'POST',
        body:   { messageHex: hexMessage },
      });
      print(result);
    } catch (err) { die(err); }
  });

key
  .command('get <keyId>')
  .description('Get key metadata by ID')
  .action(async (keyId: string) => {
    try {
      const result = await req(`/vault/key/${keyId}`);
      print(result);
    } catch (err) { die(err); }
  });

key
  .command('list')
  .description('List all active keys')
  .option('--state <state>', 'Filter by state (active|rotated|revoked|compromised)', 'active')
  .action(async (opts: { state: string }) => {
    try {
      const result = await req(`/vault/keys?state=${encodeURIComponent(opts.state)}`);
      print(result);
    } catch (err) { die(err); }
  });

// ── Audit ─────────────────────────────────────────────────────────────────────

const audit = program.command('audit').description('Audit log commands');

audit
  .command('query')
  .description('Query audit log entries')
  .option('--since <ms>',  'Since timestamp in ms')
  .option('--limit <n>',   'Max entries', '50')
  .action(async (opts: { since?: string; limit: string }) => {
    try {
      const qs = new URLSearchParams({ limit: opts.limit });
      if (opts.since) qs.set('since', opts.since);
      const result = await req(`/vault/audit?${qs}`);
      print(result);
    } catch (err) { die(err); }
  });

audit
  .command('stats')
  .description('Show audit statistics')
  .action(async () => {
    try {
      const result = await req('/vault/audit/stats');
      print(result);
    } catch (err) { die(err); }
  });

audit
  .command('verify')
  .description('Verify audit chain integrity')
  .action(async () => {
    try {
      const result = await req('/vault/audit/verify');
      print(result);
    } catch (err) { die(err); }
  });

audit
  .command('recent')
  .description('Show most recent audit entries')
  .option('--limit <n>', 'Max entries', '20')
  .action(async (opts: { limit: string }) => {
    try {
      const result = await req(`/vault/audit/recent?limit=${opts.limit}`);
      print(result);
    } catch (err) { die(err); }
  });

// ── Health ────────────────────────────────────────────────────────────────────

program
  .command('health')
  .description('Check vault API health')
  .action(async () => {
    try {
      const result = await req('/health');
      print(result);
    } catch (err) { die(err); }
  });

program.parseAsync(process.argv).catch(die);
