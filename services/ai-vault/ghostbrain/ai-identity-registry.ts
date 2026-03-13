/**
 * GhostStack AI Vault — AI Identity Registry
 * Canonical registry of all AI agents that may authenticate to the vault.
 *
 * Each agent has a deterministic identity, a set of roles, and a
 * capability scope that the vault policy engine enforces.
 *
 * Registration is immutable at runtime — changes require governance proposal.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { ActorType } from '../core/identity-engine.js';

// ── AI Agent Identities ────────────────────────────────────────────────────

export type AiAgentId =
  | 'ghostbrain-core'
  | 'treasury-ai'
  | 'dns-ai'
  | 'validator-supervisor-ai'
  | 'vault-guardian'
  | 'key-rotation-agent'
  | 'threat-response-agent'
  | 'compliance-agent'
  | 'hyper-ghost-ai'
  | 'ghostx-ai'
  | 'gns-ai';

export interface AiAgentRegistration {
  id:           AiAgentId;
  displayName:  string;
  actorType:    ActorType;
  roles:        string[];
  /** vault:// path prefixes this agent may access */
  allowedPaths: string[];
  /** Methods this agent may call */
  allowedActions: ('secret.read' | 'secret.write' | 'secret.rotate' | 'key.sign' | 'key.rotate' | 'key.generate')[];
  /** GhostChain chain ids this agent operates on (undefined = all layers) */
  chainIds?:    number[];
  /** Maximum GST value (in wei) this agent may operate on per signing event */
  maxValueGst?: bigint;
  description:  string;
}

// ── Canonical Registry ─────────────────────────────────────────────────────

export const AI_AGENT_REGISTRY: Readonly<Record<AiAgentId, AiAgentRegistration>> = {

  'ghostbrain-core': {
    id:            'ghostbrain-core',
    displayName:   'GhostBrain Core',
    actorType:     'ghostbrain',
    roles:         ['ai-agent', 'orchestrator', 'secret.read', 'secret.rotate', 'key.rotate'],
    allowedPaths:  ['vault://api/', 'vault://keys/', 'vault://docker/', 'vault://github/'],
    allowedActions: ['secret.read', 'secret.rotate', 'key.rotate'],
    description:   'Primary AI orchestrator — coordinates all GhostStack AI systems',
  },

  'treasury-ai': {
    id:            'treasury-ai',
    displayName:   'Ghost Treasury AI',
    actorType:     'treasury-operator',
    roles:         ['ai-agent', 'treasury-operator', 'key.sign'],
    allowedPaths:  ['vault://treasury/'],
    allowedActions: ['secret.read', 'key.sign'],
    chainIds:      [14000101],
    maxValueGst:   BigInt('1000000000000000000000'),  // 1000 GST
    description:   'Treasury AI — manages GST treasury operations under governance ratification',
  },

  'dns-ai': {
    id:            'dns-ai',
    displayName:   'GhostDNS AI',
    actorType:     'ai-agent',
    roles:         ['ai-agent', 'dns-operator'],
    allowedPaths:  ['vault://dns/', 'vault://gns/'],
    allowedActions: ['secret.read', 'key.rotate'],
    description:   'DNS/GNS AI — manages Ghost Name System keys and TSIG credentials',
  },

  'validator-supervisor-ai': {
    id:            'validator-supervisor-ai',
    displayName:   'Validator Supervisor AI',
    actorType:     'validator',
    roles:         ['ai-agent', 'validator', 'key.sign'],
    allowedPaths:  ['vault://validator/'],
    allowedActions: ['secret.read', 'key.sign', 'key.rotate'],
    chainIds:      [14000101, 901, 903],
    description:   'Validator AI — supervises and rotates GhostChain validator signing keys',
  },

  'vault-guardian': {
    id:            'vault-guardian',
    displayName:   'Vault Guardian Agent',
    actorType:     'ai-agent',
    roles:         ['ai-agent', 'vault-internal', 'secret.read'],
    allowedPaths:  ['vault://'],         // read-only across entire vault
    allowedActions: ['secret.read'],
    description:   'Internal vault watcher — monitors for anomalies across all vault activity',
  },

  'key-rotation-agent': {
    id:            'key-rotation-agent',
    displayName:   'Key Rotation Agent',
    actorType:     'ai-agent',
    roles:         ['ai-agent', 'vault-internal', 'key.rotate', 'secret.rotate'],
    allowedPaths:  ['vault://keys/', 'vault://validator/', 'vault://bridge/'],
    allowedActions: ['secret.rotate', 'key.rotate'],
    description:   'Autonomous key rotation — cycles credentials on AI-determined schedule',
  },

  'threat-response-agent': {
    id:            'threat-response-agent',
    displayName:   'Threat Response Agent',
    actorType:     'ai-agent',
    roles:         ['ai-agent', 'vault-internal', 'key.revoke', 'secret.rotate'],
    allowedPaths:  ['vault://'],
    allowedActions: ['secret.read', 'secret.rotate'],
    description:   'Incident response — blocks actors, revokes tokens, rotates on threat detection',
  },

  'compliance-agent': {
    id:            'compliance-agent',
    displayName:   'Compliance Agent',
    actorType:     'ai-agent',
    roles:         ['ai-agent', 'vault-internal', 'audit.read'],
    allowedPaths:  ['vault://'],
    allowedActions: ['secret.read'],
    description:   'Compliance AI — audits vault activity against SOC2/ISO27001 policies',
  },

  'hyper-ghost-ai': {
    id:            'hyper-ghost-ai',
    displayName:   'Hyper Ghost AI',
    actorType:     'ai-agent',
    roles:         ['ai-agent', 'orchestrator', 'secret.read'],
    allowedPaths:  ['vault://hypervisor/', 'vault://docker/', 'vault://ssh/'],
    allowedActions: ['secret.read', 'secret.rotate'],
    description:   'Hypervisor AI — manages VM/container credentials and infrastructure security',
  },

  'ghostx-ai': {
    id:            'ghostx-ai',
    displayName:   'GhostXchange AI',
    actorType:     'ai-agent',
    roles:         ['ai-agent', 'bridge-operator'],
    allowedPaths:  ['vault://bridge/', 'vault://api/ghostx/'],
    allowedActions: ['secret.read', 'key.sign'],
    chainIds:      [14000101, 901, 903],
    description:   'GhostXchange AI — manages DEX bridge keys and settlement signing',
  },

  'gns-ai': {
    id:            'gns-ai',
    displayName:   'Ghost Name System AI',
    actorType:     'ai-agent',
    roles:         ['ai-agent', 'dns-operator'],
    allowedPaths:  ['vault://gns/', 'vault://dns/'],
    allowedActions: ['secret.read', 'key.rotate', 'key.sign'],
    chainIds:      [14000101],
    description:   'GNS AI — manages Ghost Name System operator keys and zone signing',
  },

} as const;

// ── Lookup Helpers ─────────────────────────────────────────────────────────

export function getAgentRegistration(id: AiAgentId): AiAgentRegistration {
  const reg = AI_AGENT_REGISTRY[id];
  if (!reg) throw new Error(`Unknown AI agent: ${id}`);
  return reg;
}

export function isRegisteredAgent(id: string): id is AiAgentId {
  return id in AI_AGENT_REGISTRY;
}

export function agentCanAccessPath(agentId: AiAgentId, vaultPath: string): boolean {
  const reg = getAgentRegistration(agentId);
  return reg.allowedPaths.some(prefix =>
    prefix.endsWith('/') ? vaultPath.startsWith(prefix) :
    prefix === 'vault://'  ? true :
    vaultPath === prefix,
  );
}

export function agentCanPerformAction(
  agentId: AiAgentId,
  action: AiAgentRegistration['allowedActions'][number],
): boolean {
  return getAgentRegistration(agentId).allowedActions.includes(action);
}

export function listAgentIds(): AiAgentId[] {
  return Object.keys(AI_AGENT_REGISTRY) as AiAgentId[];
}
