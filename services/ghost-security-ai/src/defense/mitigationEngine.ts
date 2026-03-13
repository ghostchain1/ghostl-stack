/**
 * Mitigation Engine
 *
 * Maps detected ThreatEvents to advisory SecurityProposals and submits them
 * to the signing relay at SIGNING_RELAY_URL (port 7910).
 *
 * ALL proposals are advisory: true — humans ratify via governance quorum.
 * No autonomous on-chain execution ever occurs from this engine.
 *
 * Cooldown: SSA_MITIGATION_COOLDOWN_MIN (default: 15 min) per mitigation type
 * prevents proposal spam.
 */

import { submitProposal, notifyGhostBrain } from '../securityBus.js';
import type { ThreatEvent, SecurityProposal, MitigationType } from '../types.js';

const COOLDOWN_MIN = Number(process.env.SSA_MITIGATION_COOLDOWN_MIN ?? 15);
const COOLDOWN_MS  = COOLDOWN_MIN * 60 * 1_000;
let   _proposalSeq = 0;

// Track last submission time per mitigation type to enforce cooldown
const _lastSubmitted = new Map<MitigationType, number>();

function canSubmit(type: MitigationType): boolean {
  const last = _lastSubmitted.get(type) ?? 0;
  return Date.now() - last > COOLDOWN_MS;
}

function markSubmitted(type: MitigationType): void {
  _lastSubmitted.set(type, Date.now());
}

// ── Threat → Mitigation mapping ───────────────────────────────────────────────

function chooseMitigation(evt: ThreatEvent): MitigationType[] {
  const mitigations: MitigationType[] = [];

  switch (evt.category) {
    case 'contract':
      if (evt.level === 'critical') {
        mitigations.push('pause_contract', 'emergency_governance');
      } else if (evt.level === 'high') {
        mitigations.push('pause_contract');
      } else {
        mitigations.push('alert_only');
      }
      break;

    case 'validator':
      if (evt.level === 'critical' || evt.level === 'high') {
        mitigations.push('isolate_validator');
        if (evt.level === 'critical') mitigations.push('emergency_governance');
      } else {
        mitigations.push('alert_only');
      }
      break;

    case 'rpc':
      if (evt.level === 'critical' || evt.level === 'high') {
        mitigations.push('block_rpc_source');
      } else {
        mitigations.push('increase_rpc_rate_limit');
      }
      break;

    case 'treasury':
      if (evt.level === 'critical' || evt.level === 'high') {
        mitigations.push('freeze_treasury', 'emergency_governance');
      } else {
        mitigations.push('alert_only');
      }
      break;

    case 'network':
      // Application layer cannot directly remediate network isolation
      mitigations.push('alert_only');
      if (evt.level === 'critical') mitigations.push('emergency_governance');
      break;

    default:
      mitigations.push('alert_only');
  }

  return mitigations;
}

// ── Public entrypoint ─────────────────────────────────────────────────────────

export async function mitigateIfNeeded(evt: ThreatEvent): Promise<SecurityProposal | null> {
  // Only generate proposals for medium+ severity
  if (evt.level === 'none' || evt.level === 'low') return null;

  const mitigations = chooseMitigation(evt);
  let lastProposal: SecurityProposal | null = null;

  for (const type of mitigations) {
    if (!canSubmit(type)) {
      console.log(`[SSA:mitigation] Cooldown active for ${type} — skipping`);
      continue;
    }

    const proposal: SecurityProposal = {
      id:            `ssa-proposal-${++_proposalSeq}-${Date.now()}`,
      ts:            Date.now(),
      source:        'ghost-security-ai',
      threatEventId: evt.id,
      mitigation:    type,
      level:         evt.level,
      description:   `[Advisory] Automated mitigation proposal for threat: "${evt.title}". ` +
                     `Recommended action: ${type}. This proposal requires governance ratification.`,
      advisory:      true,
      metadata:      {
        threatCategory: evt.category,
        threatSource:   evt.source,
        ...evt.metadata,
      },
    };

    await submitProposal(proposal);
    markSubmitted(type);
    lastProposal = proposal;

    // GhostBrain notification for high/critical
    if (evt.level === 'high' || evt.level === 'critical') {
      await notifyGhostBrain(evt);
    }
  }

  return lastProposal;
}
