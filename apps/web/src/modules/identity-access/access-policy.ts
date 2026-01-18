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
  { pattern: '/wallet', role: 'READONLY' },
  { pattern: '/api/ai', role: 'READONLY' },
  { pattern: '/api/integrations', role: 'OPERATOR' },
  { pattern: '/api/admin', role: 'ADMIN' },
  { pattern: '/api/wallet', role: 'READONLY' }
];

export const normalizeRole = (roles?: string[]): Role => {
  if (!roles || !roles.length) return 'READONLY';
  const lowered = roles.map((role) => role.toLowerCase());
  if (lowered.includes('admin') || lowered.includes('protocol admin') || lowered.includes('security admin')) {
    return 'ADMIN';
  }
  if (lowered.includes('operator')) {
    return 'OPERATOR';
  }
  if (lowered.includes('readonly') || lowered.includes('viewer')) {
    return 'READONLY';
  }
  return 'READONLY';
};

export const resolveMinimumRole = (pathname: string): Role | null => {
  const hit = policies.find((entry) => pathname === entry.pattern || pathname.startsWith(`${entry.pattern}/`));
  return hit ? hit.role : null;
};
