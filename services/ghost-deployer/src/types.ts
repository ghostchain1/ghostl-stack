import { z } from "zod";

export type Layer = "L1" | "L2" | "L3";

export type DeploymentStage =
  | "queued"
  | "compiling"
  | "auditing"
  | "deploying"
  | "bridging"
  | "settling"
  | "done"
  | "failed";

export interface Deployment {
  id:           string;
  contractName: string;
  targetLayer:  Layer;
  stage:        DeploymentStage;
  txHash?:      string;
  address?:     string;
  error?:       string;
  log:          string[];
  createdAt:    number;
  updatedAt:    number;
}

export interface ArtifactEntry {
  name:      string;
  path:      string;
  abi:       unknown[];
  bytecode:  string;
  deployedBytecode: string;
}

// ── Request schemas ───────────────────────────────────────────────────────────

export const DeployRequestSchema = z.object({
  /** Name of the contract to deploy (e.g. "GhostToken") */
  contractName:  z.string().min(1),
  /** Target layer — defaults to L3 for new deployments (then bridge up) */
  targetLayer:   z.enum(["L1", "L2", "L3"]).default("L3"),
  /** Constructor arguments as JSON-serialisable array */
  constructorArgs: z.array(z.unknown()).default([]),
  /** If true, bridge the deployment up to L2 after deploying on L3 */
  bridgeToL2:    z.boolean().default(false),
  /** If true, settle the deployment to L1 after bridging to L2 */
  settleToL1:    z.boolean().default(false),
  /** Private key of the deployer (optional — uses env DEPLOY_PRIVATE_KEY if omitted) */
  privateKey:    z.string().optional(),
  /** Skip the GhostBrain AI audit step */
  skipAudit:     z.boolean().default(false),
});

export type DeployRequest = z.infer<typeof DeployRequestSchema>;
