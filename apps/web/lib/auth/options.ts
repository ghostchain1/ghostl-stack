import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Keycloak from 'next-auth/providers/keycloak';
import { isRealm, REALMS, REALM_DEFAULT_PATH, type Realm } from '@/lib/realms';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tryGet = (name: string): string | undefined => process.env[name] || undefined;

const decodeJwtPayload = (jwt: string) => {
  const [, payload] = jwt.split('.');
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const json = Buffer.from(`${normalized}${pad}`, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const issuerFor = (realm: Realm): string => {
  const base = (tryGet('KEYCLOAK_BASE_URL') ?? '').replace(/\/$/, '');
  const realmName =
    realm === 'users'
      ? tryGet('KEYCLOAK_REALM_USERS') ?? 'users'
      : realm === 'employees'
        ? tryGet('KEYCLOAK_REALM_EMPLOYEES') ?? 'employees'
        : tryGet('KEYCLOAK_REALM_ADMINS') ?? 'admins';
  return `${base}/realms/${realmName}`;
};

export const realmFromCookieHeader = (cookieHeader: string | null | undefined): Realm => {
  if (!cookieHeader) return 'users';
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('ghost_realm='));
  if (!cookie) return 'users';
  const value = decodeURIComponent(cookie.split('=', 2)[1] || 'users');
  return isRealm(value) ? value : 'users';
};

const realmFromIssuer = (issuer: unknown): Realm | null => {
  if (typeof issuer !== 'string' || issuer.length === 0) return null;
  try {
    for (const realm of REALMS) {
      if (issuerFor(realm) === issuer) return realm;
    }
  } catch {
    return null;
  }
  return null;
};

/** Map API role string → Realm for default redirect */
export const realmFromRole = (role: string | undefined): Realm => {
  if (!role) return 'users';
  const r = role.toLowerCase();
  if (r === 'admin' || r === 'owner') return 'admins';
  if (r === 'operator') return 'employees';
  return 'users';
};

/** Whether Keycloak is configured in the environment */
const isKeycloakConfigured = () =>
  Boolean(tryGet('KEYCLOAK_CLIENT_ID') && tryGet('KEYCLOAK_CLIENT_SECRET') && tryGet('KEYCLOAK_BASE_URL'));

// ---------------------------------------------------------------------------
// Credentials provider - proxies to the Express API auth endpoint
// ---------------------------------------------------------------------------

const API_INTERNAL_URL = () =>
  (tryGet('API_INTERNAL_URL') ?? tryGet('NEXT_PUBLIC_API_URL') ?? 'http://localhost:4000').replace(/\/$/, '');

const credentialsProvider = Credentials({
  id: 'credentials',
  name: 'GhostStack Password',
  credentials: {
    email: { label: 'Email', type: 'email' },
    password: { label: 'Password', type: 'password' }
  },
  async authorize(credentials) {
    const email = credentials?.email as string | undefined;
    const password = credentials?.password as string | undefined;
    if (!email || !password) return null;
    try {
      const res = await fetch(`${API_INTERNAL_URL()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        user?: { id: string; email: string; username?: string; role?: string };
      };
      const u = body.user;
      if (!u?.id) return null;
      const role = u.role ?? 'readonly';
      const realm = realmFromRole(role);
      return {
        id: u.id,
        email: u.email,
        name: u.username ?? u.email,
        // Extra fields merged into JWT via jwt callback
        _roles: [role],
        _realm: realm
      };
    } catch {
      return null;
    }
  }
});

// ---------------------------------------------------------------------------
// NextAuth config factory
// ---------------------------------------------------------------------------

export const buildAuthOptions = (realm: Realm): NextAuthConfig => {
  const providers = [
    credentialsProvider,
    ...(isKeycloakConfigured()
      ? [
          Keycloak({
            clientId: tryGet('KEYCLOAK_CLIENT_ID')!,
            clientSecret: tryGet('KEYCLOAK_CLIENT_SECRET')!,
            issuer: issuerFor(realm)
          })
        ]
      : [])
  ];

  return {
    trustHost: true,
    providers,
    pages: {
      signIn: '/login',
      error: '/login'
    },
    session: { strategy: 'jwt' },
    callbacks: {
      async jwt({ token, account, profile, user }) {
        const t = token as Record<string, unknown> & { realm?: Realm; roles?: string[] };
        t.realm = t.realm ?? realm;

        // Credentials login — user is the authorize() return value
        if (account?.provider === 'credentials' && user) {
          const u = user as Record<string, unknown>;
          t.roles = (u._roles as string[]) ?? ['readonly'];
          t.realm = (u._realm as Realm) ?? realm;
          return t;
        }

        // Keycloak / SSO path
        if (account?.access_token) {
          t.accessToken = account.access_token;
          const decoded = decodeJwtPayload(account.access_token);
          const tokenRealm = realmFromIssuer(decoded?.iss);
          if (tokenRealm) t.realm = tokenRealm;
          const roles = Array.isArray(
            decoded?.realm_access && (decoded.realm_access as { roles?: unknown }).roles
          )
            ? ((decoded?.realm_access as { roles?: unknown[] }).roles ?? []).filter(
                (item): item is string => typeof item === 'string'
              )
            : [];
          t.roles = roles;
        }
        if (account?.id_token) t.idToken = account.id_token;
        if (profile && typeof (profile as { sub?: unknown }).sub === 'string') {
          t.sub = (profile as { sub: string }).sub;
        }

        return t;
      },

      async session({ session, token }) {
        const s = session as typeof session & { realm?: Realm; roles?: string[] };
        const t = token as { realm?: Realm; roles?: string[]; sub?: string };
        s.realm = t.realm;
        s.roles = t.roles ?? [];
        if (t.sub) (s.user as unknown as Record<string, unknown>).id = t.sub;
        return session;
      },

      async redirect({ url, baseUrl }) {
        if (url.startsWith('/')) return `${baseUrl}${url}`;
        try {
          if (new URL(url).origin === baseUrl) return url;
        } catch {
          // ignore malformed URLs
        }
        return baseUrl;
      }
    }
  };
};

/** Derive the default landing path for a session after credentials login */
export const defaultRedirectForRoles = (roles: string[] | undefined): string => {
  const top = (roles ?? []).map((r) => r.toLowerCase());
  if (top.includes('admin') || top.includes('owner')) return REALM_DEFAULT_PATH.admins;
  if (top.includes('operator')) return REALM_DEFAULT_PATH.employees;
  return REALM_DEFAULT_PATH.users;
};
