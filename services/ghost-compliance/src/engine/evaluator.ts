import { DecisionInput, PolicyBundle, WhenExpr, Comparator } from './types';
import { resolveMostRestrictive, Triggered } from './conflict';

function getPath(obj: any, path: string): any {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function isComparator(v: any): v is Comparator {
  if (!v || typeof v !== 'object') return false;
  const k = Object.keys(v);
  return k.length === 1 && ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'matches'].includes(k[0]);
}

function cmp(actual: any, c: Comparator): boolean {
  const [op, expected] = Object.entries(c)[0] as [string, any];
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== expected;
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'contains':
      if (typeof actual === 'string') return actual.includes(String(expected));
      if (Array.isArray(actual)) return actual.includes(expected);
      return false;
    case 'matches':
      try {
        const re = new RegExp(String(expected));
        return re.test(String(actual ?? ''));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function evalLeaf(input: any, leaf: Record<string, any>): boolean {
  for (const [path, rule] of Object.entries(leaf)) {
    const actual = getPath(input, path);
    if (isComparator(rule)) {
      if (!cmp(actual, rule)) return false;
    } else {
      if (actual !== rule) return false;
    }
  }
  return true;
}

function evalWhen(input: any, expr: WhenExpr): boolean {
  if ('all' in expr) return expr.all.every((e) => evalWhen(input, e));
  if ('any' in expr) return expr.any.some((e) => evalWhen(input, e));
  if ('not' in expr) return !evalWhen(input, expr.not);
  return evalLeaf(input, expr as Record<string, any>);
}

export function evaluatePolicy(bundle: PolicyBundle, input: DecisionInput) {
  const conflict = bundle.defaults?.conflictStrategy ?? 'most_restrictive';
  if (conflict !== 'most_restrictive') {
    throw new Error(`Unsupported conflict strategy: ${conflict}`);
  }

  const enriched = {
    subject: input.subject,
    resource: input.resource,
    context: input.context,
    action: input.action,
    requestId: input.requestId
  };

  const candidates = bundle.policies
    .filter((p) => p.appliesTo?.actions?.includes(input.action))
    .sort((a, b) => b.priority - a.priority);

  const triggered: Triggered[] = [];
  for (const rule of candidates) {
    const ok = evalWhen(enriched, rule.when);
    if (ok) triggered.push({ ruleId: rule.id, priority: rule.priority, effect: rule.effect });
  }

  const decision = resolveMostRestrictive(triggered);

  return {
    ...decision,
    policyBundle: { bundleId: bundle.metadata.bundleId, version: bundle.metadata.version }
  };
}
