export type LoopStage =
  | "analyze"
  | "fix"
  | "build"
  | "verify"
  | "remediate"
  | "attest"
  | "automate"
  | "done"
  | "blocked";

export type GateStatus = "pass" | "fail";

export type LoopState = {
  iteration: number;
  stage: LoopStage;
  lastError?: string;
  gates?: Record<string, GateStatus>;
  artifacts?: Record<string, string>;
};
