export type Role = 'READONLY' | 'OPERATOR' | 'ADMIN';

type PolicyEntry = { pattern: string; role: Role };

export const roleOrder: Record<Role, number> = {
  READONLY: 0,
  OPERATOR: 1,
  ADMIN: 2
};

const policies: PolicyEntry[] = [
  { pattern: '/ai', role: 'READONLY' },
  { pattern: '/integrations', role: 'OPERATOR' },
  { pattern: '/admin', role: 'ADMIN' },
  { pattern: '/api/ai', role: 'READONLY' },
  { pattern: '/api/integrations', role: 'OPERATOR' },
  { pattern: '/api/admin', role: 'ADMIN' },
  { pattern: '/api/webhooks', role: 'ADMIN' }
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

export const resolveMinimumRole = (pathname: string, method?: string): Role | null => {
  if (pathname.startsWith('/api/analytics')) {
    const verb = (method || 'GET').toUpperCase();
    return verb === 'GET' || verb === 'HEAD' ? 'ADMIN' : 'READONLY';
  }
  const hit = policies.find((entry) => pathname === entry.pattern || pathname.startsWith(`${entry.pattern}/`));
  return hit ? hit.role : null;
};
