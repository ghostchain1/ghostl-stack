import Link from 'next/link';
import { REALM_NAV, type Realm } from '@/lib/realms';

export function AppShell({ realm, children }: { realm: Realm; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 border-r p-4">
        <div className="font-semibold text-lg mb-4">GhostStack</div>
        <nav className="space-y-1">
          {REALM_NAV[realm].map((i) => (
            <Link key={i.href} className="block rounded-xl px-3 py-2 hover:bg-muted" href={i.href}>
              {i.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
