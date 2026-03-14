import type { NextAuthConfig } from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';
import { isRealm, REALMS, realmFromCookieHeader, type Realm } from '@ghostl/auth';

export { realmFromCookieHeader };

const mustGet = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
};

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
  const base = mustGet('KEYCLOAK_BASE_URL').replace(/\/$/, '');
  const realmName =
    realm === 'users'
      ? mustGet('KEYCLOAK_REALM_USERS')
      : realm === 'employees'
        ? mustGet('KEYCLOAK_REALM_EMPLOYEES')
        : mustGet('KEYCLOAK_REALM_ADMINS');
  return `${base}/realms/${realmName}`;
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

export const buildAuthOptions = (realm: Realm): NextAuthConfig => ({
  trustHost: true,
  providers: [
    Keycloak({
      clientId: mustGet('KEYCLOAK_CLIENT_ID'),
      clientSecret: mustGet('KEYCLOAK_CLIENT_SECRET'),
      issuer: issuerFor(realm)
    })
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile }) {
      const mutableToken = token as Record<string, unknown> & { realm?: Realm; roles?: string[]; sub?: string };
      mutableToken.realm = mutableToken.realm || realm;

      if (account?.access_token) {
        mutableToken.accessToken = account.access_token;
        const decoded = decodeJwtPayload(account.access_token);
        const tokenRealm = realmFromIssuer(decoded?.iss);
        if (tokenRealm) mutableToken.realm = tokenRealm;
        const roles = Array.isArray(decoded?.realm_access && (decoded.realm_access as { roles?: unknown }).roles)
          ? ((decoded?.realm_access as { roles?: unknown[] }).roles ?? []).filter(
              (item): item is string => typeof item === 'string'
            )
          : [];
        mutableToken.roles = roles;
      }
      if (account?.id_token) {
        mutableToken.idToken = account.id_token;
      }
      if (profile && typeof (profile as { sub?: unknown }).sub === 'string') {
        mutableToken.sub = (profile as { sub: string }).sub;
      }

      return mutableToken;
    },
    async session({ session, token }) {
      const mutableSession = session as typeof session & { realm?: Realm; roles?: string[]; sub?: string };
      const mutableToken = token as { realm?: Realm; roles?: string[]; sub?: string };
      mutableSession.realm = mutableToken.realm;
      mutableSession.roles = mutableToken.roles || [];
      mutableSession.sub = mutableToken.sub;
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        // ignore malformed callback URLs and fall back to baseUrl
      }
      return baseUrl;
    }
  }
});
