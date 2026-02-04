export async function requireGovernanceCapability(repoRoot: string, capability: string) {
  void repoRoot;
  const envOk = process.env.GHOST_POLICY_OK === "true";
  if (!envOk) {
    throw new Error(`Governance policy gate blocked capability=${capability}. Set GHOST_POLICY_OK=true via approved flow.`);
  }
}
