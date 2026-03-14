import path from "node:path";

export type GhostHelperConfig = {
  repoRoot: string;
  reportsDir: string;
  evidenceDir: string;
  sbomDir: string;
  attestDir: string;
  maxIterations: number;
  requireNoHighCritical: boolean;
};

export function loadConfig(): GhostHelperConfig {
  const repoRoot = process.env.GHOST_REPO_ROOT || "/home/ghost/ghostl-stack";
  const base = path.join(repoRoot, "ghost-helper-bots");
  return {
    repoRoot,
    reportsDir: path.join(base, "reports"),
    evidenceDir: path.join(base, "evidence"),
    sbomDir: path.join(base, "sbom"),
    attestDir: path.join(base, "attestations"),
    maxIterations: Number(process.env.GHOST_HELPER_MAX_ITERS || 5),
    requireNoHighCritical: (process.env.GHOST_HELPER_FAIL_ON_HIGH_CRITICAL || "true") === "true"
  };
}
