import NextAuth from 'next-auth';
import { headers } from 'next/headers';
import { buildAuthOptions, realmFromCookieHeader } from './auth/options';

export const { auth, handlers, signIn, signOut } = NextAuth(async (req) => {
  let cookieHeader = req?.headers?.get('cookie');
  if (!cookieHeader) {
    try {
      const requestHeaders = await headers();
      cookieHeader = requestHeaders.get('cookie');
    } catch {
      cookieHeader = null;
    }
  }
  const realm = realmFromCookieHeader(cookieHeader);
  return buildAuthOptions(realm);
});
