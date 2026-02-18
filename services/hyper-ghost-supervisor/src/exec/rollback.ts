export type RollbackPlan = {
  steps: string[];
  notes?: string[];
};

// Rollback runner skeleton: v1 provides rollback plans as structured data only.
export function describeRollback(plan: unknown): RollbackPlan {
  if (plan && typeof plan === 'object' && Array.isArray((plan as any).steps)) {
    return { steps: (plan as any).steps.map((s: any) => String(s)) };
  }
  return { steps: [], notes: ['rollback plan not provided'] };
}

