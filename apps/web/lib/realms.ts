// Core realm primitives come from the shared @ghostchain/auth package.
export { REALMS, type Realm, isRealm } from '@ghostchain/auth';
import type { Realm } from '@ghostchain/auth';

export type RealmNavItem = {
  href: string;
  label: string;
};

export const REALM_NAV: Record<Realm, RealmNavItem[]> = {
  users: [
    { href: '/dashboard', label: 'Overview' },
    { href: '/wallet', label: 'Wallet' },
    { href: '/bridge', label: 'Bridge' },
    { href: '/explorer', label: 'Explorer' },
    { href: '/alerts', label: 'Alerts' },
    { href: '/profile', label: 'Profile' }
  ],
  employees: [
    { href: '/support', label: 'Support' },
    { href: '/incidents', label: 'Incidents' },
    { href: '/monitoring', label: 'Monitoring' },
    { href: '/kyc-review', label: 'KYC Review' },
    { href: '/logs', label: 'Logs' }
  ],
  admins: [
    { href: '/command-hub', label: 'Command Hub' },
    { href: '/chain', label: 'Chain' },
    { href: '/nodes', label: 'Nodes' },
    { href: '/validators', label: 'Validators' },
    { href: '/governance', label: 'Governance' },
    { href: '/treasury', label: 'Treasury' },
    { href: '/compliance', label: 'Compliance' },
    { href: '/devops', label: 'DevOps' },
    { href: '/ai', label: 'AI' },
    { href: '/users', label: 'Users' }
  ]
};

export const REALM_DEFAULT_PATH: Record<Realm, string> = {
  users: '/dashboard',
  employees: '/incidents',
  admins: '/governance'
};

export const REALM_ROUTE_PREFIXES: Record<Realm, string[]> = {
  users: REALM_NAV.users.map((item) => item.href),
  employees: REALM_NAV.employees.map((item) => item.href),
  admins: REALM_NAV.admins.map((item) => item.href)
};
