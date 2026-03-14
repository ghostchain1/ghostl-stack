/**
 * @file src/deployment/vmDeploy.ts
 * Ghost Global Network Intelligence — VM deployment proposal emitter.
 *
 * This module does NOT use libvirt directly.  Instead it submits a signed
 * deployment proposal to the signing relay (SIGNING_RELAY_URL/proposals).
 * A human operator reviews and approves the proposal — then the GAIS
 * hypervisor supervisor executes the VM creation.
 *
 * Governance model: AI proposes → human ratifies → GAIS executes.
 */

import https from 'node:https';
import http  from 'node:http';
import crypto from 'node:crypto';
import type { ChainLayer, RegionCode, ExpansionProposal } from '../types.js';

function log(level: string, msg: string, extra: object = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, module: 'vm-deploy', msg, ...extra }) + '\n'
  );
}

const SIGNING_RELAY_URL = process.env.SIGNING_RELAY_URL ?? 'http://localhost:7910';
const DRY_RUN           = (process.env.GNI_DRY_RUN ?? '0') === '1';

interface DeployNodeOptions {
  chain:    ChainLayer;
  region:   RegionCode;
  nodeType: 'rpc' | 'validator' | 'archive';
  reason:   string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

async function submitProposal(proposal: ExpansionProposal): Promise<void> {
  const payload = JSON.stringify(proposal);

  if (DRY_RUN) {
    log('info', 'dry-run-vm-proposal', { proposalId: proposal.proposalId, chain: proposal.chain, region: proposal.region });
    return;
  }

  const purl      = new URL('/proposals', SIGNING_RELAY_URL);
  const transport = purl.protocol === 'https:' ? https : http;
  const options   = {
    hostname: purl.hostname,
    port:     purl.port || (purl.protocol === 'https:' ? 443 : 80),
    path:     purl.pathname,
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent':     'ghost-global-intelligence/1.0',
    },
    timeout: 6000,
  };

  return new Promise((resolve) => {
    const req = transport.request(options, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        log('info', 'vm-proposal-submitted', { proposalId: proposal.proposalId, status: res.statusCode });
      } else {
        log('warn', 'vm-proposal-rejected', { proposalId: proposal.proposalId, status: res.statusCode });
      }
      resolve();
    });
    req.on('error', (err) => {
      log('error', 'vm-proposal-error', { proposalId: proposal.proposalId, error: err.message });
      resolve();
    });
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(payload);
    req.end();
  });
}

/**
 * Propose a new VM-hosted GhostChain node deployment.
 * Returns the proposal ID for tracking.
 */
export async function deployNode(opts: DeployNodeOptions): Promise<string> {
  const proposalId = crypto.randomUUID();
  const proposal: ExpansionProposal = {
    proposalId,
    reason:      opts.reason,
    target:      'vm',
    chain:       opts.chain,
    region:      opts.region,
    nodeType:    opts.nodeType,
    provider:    process.env.GNI_VM_PROVIDER ?? 'local-qemu',
    priority:    opts.priority ?? 'medium',
    requestedBy: 'ghost-global-intelligence/vm-deploy',
    ts:          Date.now(),
    advisory:    true,
  };

  log('info', 'vm-node-proposal', {
    proposalId,
    chain:    opts.chain,
    region:   opts.region,
    nodeType: opts.nodeType,
    reason:   opts.reason,
  });

  await submitProposal(proposal);
  return proposalId;
}
