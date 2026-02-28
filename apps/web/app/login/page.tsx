import Link from 'next/link';
import type { Realm } from '@/lib/realms';

type LoginSearchParams = {
  returnTo?: string | string[];
};

const safeReturnPath = (value: string | string[] | undefined): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  return raw;
};

const buildRealmLoginHref = (realm: Realm, returnTo: string | null) => {
  const params = new URLSearchParams({ realm });
  if (returnTo) params.set('returnTo', returnTo);
  return `/api/auth/realm-login?${params.toString()}`;
};

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<LoginSearchParams> | LoginSearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const returnTo = safeReturnPath(resolvedSearchParams?.returnTo);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-2xl p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
        <p className="text-sm opacity-80 mb-6">
          Choose the portal you want to access. You will log in once and stay signed in for that realm.
        </p>

        <div className="space-y-3">
          <Link
            className="block w-full text-center rounded-xl border px-4 py-3 hover:bg-muted"
            href={buildRealmLoginHref('users', returnTo)}
          >
            User Portal
          </Link>
          <Link
            className="block w-full text-center rounded-xl border px-4 py-3 hover:bg-muted"
            href={buildRealmLoginHref('employees', returnTo)}
          >
            Employee Portal
          </Link>
          <Link
            className="block w-full text-center rounded-xl border px-4 py-3 hover:bg-muted"
            href={buildRealmLoginHref('admins', returnTo)}
          >
            Admin Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
