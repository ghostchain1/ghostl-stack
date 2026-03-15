import { Router } from 'express';
import { v4 as uuid } from 'uuid';

/**
 * GhostBrain Host Release Mediator — evaluates release requests from hosts
 * to leave agencies. Issues AI-driven decisions that must be ratified by
 * human governance (GhostChain Governor) before on-chain execution.
 */
export const releaseRouter = Router();

enum ReleaseDecision {
  Approved = 'approved',
  Denied = 'denied',
  EscalatedToGovernance = 'escalated_to_governance',
}

interface ReleaseRequest {
  agencyId: string;
  hostId: string;
  reason: string;
}

function analyzeRelease(req: ReleaseRequest): {
  decision: ReleaseDecision;
  rationale: string;
  requiresGovernance: boolean;
} {
  const reason = req.reason.toLowerCase();

  if (reason.includes('abuse') || reason.includes('harassment') || reason.includes('unsafe')) {
    return {
      decision: ReleaseDecision.Approved,
      rationale: 'GhostBrain detected welfare-related keywords. Immediate release approved pending admin review.',
      requiresGovernance: false,
    };
  }

  if (reason.includes('contract') || reason.includes('dispute') || reason.includes('payment')) {
    return {
      decision: ReleaseDecision.EscalatedToGovernance,
      rationale: 'Financial or contractual dispute detected. Escalated to GhostChain Governor for human ratification.',
      requiresGovernance: true,
    };
  }

  return {
    decision: ReleaseDecision.Denied,
    rationale: 'Reason does not meet autonomous release criteria. Host may appeal to GhostChain Governor.',
    requiresGovernance: false,
  };
}

releaseRouter.post('/', (req, res) => {
  const body = req.body as Partial<ReleaseRequest>;
  if (!body.agencyId || !body.hostId || !body.reason) {
    res.status(400).json({ error: 'agencyId, hostId, reason required' });
    return;
  }
  const result = analyzeRelease(body as ReleaseRequest);
  res.json({
    requestId: uuid(),
    ...result,
    engine: 'GhostBrain Host Release Mediator v1',
    governanceUrl: result.requiresGovernance
      ? 'http://localhost:7685/proposals/new'
      : null,
  });
});
