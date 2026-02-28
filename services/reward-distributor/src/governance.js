import fs from "node:fs";
import path from "node:path";

const PROPOSAL_ID_REGEX = /^[A-Za-z0-9._-]+$/;

export function verifyGovernanceApproval({ proposalId, governanceRoot, requireQuorumAndTimelock = true }) {
  const id = String(proposalId || "").trim();
  if (!PROPOSAL_ID_REGEX.test(id)) {
    throw new Error("invalid_governance_proposal_id");
  }

  const filePath = path.join(governanceRoot, id, "approval.json");
  if (!fs.existsSync(filePath)) {
    throw new Error("governance_approval_missing");
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (String(data.proposalId || "") !== id) throw new Error("governance_proposal_mismatch");
  if (data.allowDeploy !== true) throw new Error("governance_allow_deploy_false");

  if (requireQuorumAndTimelock) {
    if (data.quorumReached !== true) {
      throw new Error("governance_quorum_not_reached");
    }
    const timelockExpiresAt = new Date(String(data.timelockExpiresAt || ""));
    if (Number.isNaN(timelockExpiresAt.getTime())) {
      throw new Error("governance_invalid_timelock_expires_at");
    }
    if (timelockExpiresAt.getTime() > Date.now()) {
      throw new Error("governance_timelock_not_expired");
    }
  }

  return {
    proposalId: id,
    approvedBy: String(data.approvedBy || "unknown"),
    filePath
  };
}
