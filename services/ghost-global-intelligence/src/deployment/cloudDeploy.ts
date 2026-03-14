/**
 * @file src/deployment/cloudDeploy.ts
 * Ghost Global Network Intelligence — Cloud node deployment proposal emitter.
 *
 * Like vmDeploy.ts, this module NEVER calls cloud provider APIs directly.
 * It builds a structured deployment proposal and submits it to the signing
 * relay.  The DevOps or GAIS team ratifies and executes the cloud deployment.
 *
 * Governance model: AI proposes → human ratifies → cloud automation executes.
 */

import https from 'node:https';
import http  from 'node:http';
import crypto from 'node:crypto';
import type { ChainLayer, RegionCode, ExpansionProposal } from '../types.js';

function log(level: string, msg: string, extra: object = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, module: 'cloud-deploy', msg, ...extra }) + '\n'
  );
}

const SIGNING_RELAY_URL = process.env.SIGNING_RELAY_URL   ?? 'http://localhost:7910';
const CLOUD_PROVIDER    = process.env.GNI_CLOUD_PROVIDER  ?? 'hetzner'; // informational only
const DRY_RUN           = (process.env.GNI_DRY_RUN ?? '0') === '1';

// Map GNI region code to typical cloud datacenter label
const REGION_TO_DC: Record<RegionCode, string> = {
  NA:      'us-east-1',
  EU:      'eu-west-1',
  AS:      'ap-southeast-1',
  SA:      'sa-east-1',
  OC:      'ap-southeast-2',
  AF:      'af-south-1',
  UNKNOWN: 'auto',
};

interface CloudDeployOptions {
  chain:    ChainLayer;
  region:   RegionCode;
  nodeType: 'rpc' | 'validator' | 'archive';
  reason:   string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

async function submitProposal(proposal: ExpansionProposal): Promise<void> {
  const payload = JSON.stringify(proposal);

  if (DRY_RUN) {
    log('info', 'dry-run-cloud-proposal', { proposalId: proposal.proposalId, provider: CLOUD_PROVIDER });
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
        log('info', 'cloud-proposal-submitted', { proposalId: proposal.proposalId, status: res.statusCode });
      } else {
        log('warn', 'cloud-proposal-rejected', { proposalId: proposal.proposalId, status: res.statusCode });
      }
      resolve();
    });
    req.on('error', (err) => {
      log('error', 'cloud-proposal-error', { proposalId: proposal.proposalId, error: err.message });
      resolve();
    });
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(payload);
    req.end();
  });
}

/**
 * Propose a new cloud-hosted GhostChain node deployment.
 * Returns the proposal ID for tracking.
 */
export async function deployCloudNode(opts: CloudDeployOptions): Promise<string> {
  const proposalId = crypto.randomUUID();
  const dc         = REGION_TO_DC[opts.region] ?? 'auto';

  const proposal: ExpansionProposal = {
    proposalId,
    reason:   opts.reason,
    target:   'cloud',
    chain:    opts.chain,
    region:   opts.region,
    nodeType: opts.nodeType,
    provider: `${CLOUD_PROVIDER}:${dc}`,
    priority: opts.priority ?? 'medium',
    requestedBy: 'ghost-global-intelligence/cloud-deploy',
    ts:       Date.now(),
    advisory: true,
  };

  log('info', 'cloud-node-proposal', {
    proposalId,
    provider: `${CLOUD_PROVIDER}:${dc}`,
    chain:    opts.chain,
    region:   opts.region,
    nodeType: opts.nodeType,
  });

  await submitProposal(proposal);
  return proposalId;
}
