export type Role = 'READONLY' | 'OPERATOR' | 'ADMIN' | 'OWNER';

type PolicyEntry = { pattern: string; role: Role; methods?: string[] };

export const roleOrder: Record<Role, number> = {
  READONLY: 0,
  OPERATOR: 1,
  ADMIN: 2,
  OWNER: 3
};

const policies: PolicyEntry[] = [
  { pattern: '/', role: 'READONLY' },
  { pattern: '/dashboard', role: 'READONLY' },
  { pattern: '/console/overview', role: 'READONLY' },
  { pattern: '/console/ai', role: 'READONLY' },
  { pattern: '/console/chains-nodes', role: 'READONLY' },
  { pattern: '/ai', role: 'READONLY' },
  { pattern: '/wallet', role: 'READONLY' },
  { pattern: '/integrations', role: 'READONLY' },
  { pattern: '/chain', role: 'OPERATOR' },
  { pattern: '/nodes', role: 'OPERATOR' },
  { pattern: '/validators', role: 'OPERATOR' },
  { pattern: '/bridge', role: 'OPERATOR' },
  { pattern: '/explorer', role: 'OPERATOR' },
  { pattern: '/observability', role: 'READONLY' },
  { pattern: '/contracts', role: 'OPERATOR' },
  { pattern: '/tokens', role: 'OPERATOR' },
  { pattern: '/tokenomics', role: 'OPERATOR' },
  { pattern: '/stocks', role: 'OPERATOR' },
  { pattern: '/treasury', role: 'OPERATOR' },
  { pattern: '/governance', role: 'OPERATOR' },
  { pattern: '/nfts', role: 'OPERATOR' },
  { pattern: '/compliance', role: 'OPERATOR' },
  { pattern: '/kyc', role: 'OPERATOR' },
  { pattern: '/devops', role: 'OPERATOR' },
  { pattern: '/console/users-wallets', role: 'OPERATOR' },
  { pattern: '/console/tokens', role: 'OPERATOR' },
  { pattern: '/console/contracts', role: 'OPERATOR' },
  { pattern: '/console/bridge', role: 'OPERATOR' },
  { pattern: '/console/validators', role: 'OPERATOR' },
  { pattern: '/console/treasury', role: 'OPERATOR' },
  { pattern: '/console/governance', role: 'OPERATOR' },
  { pattern: '/console/compliance', role: 'OPERATOR' },
  { pattern: '/console/devops', role: 'OPERATOR' },
  { pattern: '/console/integrations', role: 'OPERATOR' },
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
  if (lowered.includes('owner') || lowered.includes('root') || lowered.includes('superadmin')) {
    return 'OWNER';
  }
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
