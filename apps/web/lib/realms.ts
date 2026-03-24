// Core realm primitives come from the shared @ghostl/auth package.
export { REALMS, type Realm, isRealm } from '@ghostl/auth';
import type { Realm } from '@ghostl/auth';

export type RealmNavItem = {
  href: string;
  label: string;
};

export const REALM_NAV: Record<Realm, RealmNavItem[]> = {
  users: [
    { href: '/dashboard', label: '⬡ Overview' },
    { href: '/wallet', label: '◈ Wallet' },
    { href: '/bridge', label: '⇆ Bridge' },
    { href: '/explorer', label: '◉ GhostScan' },
    { href: '/alerts', label: '▲ Alerts' },
    { href: '/profile', label: '✦ Profile' },
  ],
  employees: [
    { href: '/incidents', label: '⚠ Incidents' },
    { href: '/monitoring', label: '◉ Monitoring' },
    { href: '/kyc-review', label: '◈ KYC Review' },
    { href: '/support', label: '✉ Support Queue' },
    { href: '/logs', label: '☰ Logs' },
  ],
  admins: [
    { href: '/', label: '⬡ Command Hub' },
    { href: '/chain', label: '◉ Chain' },
    { href: '/chains/l1', label: '↳ GhostChain L1' },
    { href: '/chains/l2', label: '↳ GhostL2' },
    { href: '/chains/l3', label: '↳ GhostL3' },
    { href: '/nodes', label: '◈ Nodes' },
    { href: '/validators', label: '⬡ Validators' },
    { href: '/bridge', label: '⇆ Bridge' },
    { href: '/governance', label: '⚖ Governance' },
    { href: '/treasury', label: '⬡ Treasury' },
    { href: '/contracts', label: '◉ Contracts' },
    { href: '/compliance', label: '✓ Compliance' },
    { href: '/ai', label: '◈ AI Systems' },
    { href: '/observability', label: '▲ Observability' },
    { href: '/devops', label: '⚙ DevOps' },
    { href: '/admin/users', label: '✦ Users' },
    { href: '/whitepaper', label: '☰ Whitepapers' },
    { href: '/docs', label: '☰ Docs' },
  ]
};

export const REALM_DEFAULT_PATH: Record<Realm, string> = {
  users: '/dashboard',
  employees: '/incidents',
  admins: '/',
};

export const REALM_ROUTE_PREFIXES: Record<Realm, string[]> = {
  users: REALM_NAV.users.map((item) => item.href),
  employees: REALM_NAV.employees.map((item) => item.href),
  admins: REALM_NAV.admins.map((item) => item.href),
};
