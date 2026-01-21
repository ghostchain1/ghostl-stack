export type Comparator =
  | { eq: unknown }
  | { ne: unknown }
  | { gt: number }
  | { gte: number }
  | { lt: number }
  | { lte: number }
  | { in: unknown[] }
  | { contains: unknown }
  | { matches: string };

export type WhenExpr =
  | { all: WhenExpr[] }
  | { any: WhenExpr[] }
  | { not: WhenExpr }
  | Record<string, Comparator | unknown>;

export type PolicyEffect = {
  deny?: { reason: string; message?: string };
  require?: { controls?: string[]; disclosures?: string[]; manualReview?: boolean };
  allow?: boolean;
  reason?: string;
};

export type PolicyRule = {
  id: string;
  priority: number;
  appliesTo: { actions: string[] };
  when: WhenExpr;
  effect: PolicyEffect;
};

export type PolicyBundle = {
  apiVersion: string;
  kind: 'PolicyBundle';
  metadata: { bundleId: string; version: string };
  defaults?: { conflictStrategy?: 'most_restrictive'; decisionTTLSeconds?: number };
  policies: PolicyRule[];
};

export type DecisionInput = {
  requestId: string;
  subject: any;
  action: string;
  resource: any;
  context: any;
};

export type DecisionOutput = {
  decision: 'allow' | 'deny' | 'allow_with_controls';
  reasons: string[];
  requiredControls: string[];
  disclosures: string[];
  matchedRules: string[];
};
