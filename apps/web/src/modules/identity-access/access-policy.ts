export type Role = 'READONLY' | 'OPERATOR' | 'ADMIN';

type PolicyEntry = { pattern: string; role: Role; methods?: string[] };

export const roleOrder: Record<Role, number> = {
  READONLY: 0,
  OPERATOR: 1,
  ADMIN: 2
};

const policies: PolicyEntry[] = [
  { pattern: '/', role: 'READONLY' },
  { pattern: '/dashboard', role: 'READONLY' },
  { pattern: '/ai', role: 'READONLY' },
  { pattern: '/wallet', role: 'READONLY' },
  { pattern: '/integrations', role: 'READONLY' },
  { pattern: '/chain', role: 'OPERATOR' },
  { pattern: '/nodes', role: 'OPERATOR' },
  { pattern: '/validators', role: 'OPERATOR' },
  { pattern: '/bridge', role: 'OPERATOR' },
  { pattern: '/explorer', role: 'OPERATOR' },
  { pattern: '/observability', role: 'OPERATOR' },
  { pattern: '/contracts', role: 'OPERATOR' },
  { pattern: '/tokenomics', role: 'OPERATOR' },
  { pattern: '/treasury', role: 'OPERATOR' },
  { pattern: '/governance', role: 'OPERATOR' },
  { pattern: '/compliance', role: 'OPERATOR' },
  { pattern: '/kyc', role: 'OPERATOR' },
  { pattern: '/devops', role: 'OPERATOR' },
  { pattern: '/admin', role: 'ADMIN' },
  { pattern: '/analytics', role: 'ADMIN' },
  { pattern: '/webhooks', role: 'ADMIN' },
  { pattern: '/api/ai', role: 'READONLY' },
  { pattern: '/api/integrations', role: 'OPERATOR' },
  { pattern: '/api/admin', role: 'ADMIN' },
  { pattern: '/api/webhooks', role: 'ADMIN' },
  { pattern: '/api/analytics', role: 'ADMIN', methods: ['GET', 'HEAD'] },
  { pattern: '/api/analytics', role: 'READONLY' }
];

export const normalizeRole = (roleInput?: string | string[] | null): Role => {
  if (!roleInput) return 'READONLY';
  const roles = Array.isArray(roleInput) ? roleInput : [roleInput];
  const lowered = roles.map((role) => role.toLowerCase());
  if (
    lowered.includes('admin') ||
    lowered.includes('protocol admin') ||
    lowered.includes('security admin') ||
    lowered.includes('treasury admin')
  ) {
    return 'ADMIN';
  }
  if (lowered.includes('operator') || lowered.includes('developer')) {
    return 'OPERATOR';
  }
  if (lowered.includes('readonly') || lowered.includes('viewer')) {
    return 'READONLY';
  }
  return 'READONLY';
};

const matchesPolicy = (pathname: string, entry: PolicyEntry) => {
  if (entry.pattern === '/') return pathname === '/';
  return pathname === entry.pattern || pathname.startsWith(`${entry.pattern}/`);
};

export const resolveMinimumRole = (pathname: string, method?: string): Role | null => {
  const verb = (method || 'GET').toUpperCase();
  const hit = policies.find(
    (entry) => matchesPolicy(pathname, entry) && (!entry.methods || entry.methods.includes(verb))
  );
  return hit ? hit.role : null;
};
