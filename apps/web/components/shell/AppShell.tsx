'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { REALM_NAV, type Realm } from '@/lib/realms';

export function AppShell({ realm, children }: { realm: Realm; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 border-r p-4">
        <div className="font-semibold text-lg mb-4">GhostStack</div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">{realm}</div>
        <nav className="space-y-1">
          {REALM_NAV[realm].map((i) => {
            const isActive = i.href === '/' ? pathname === '/' : pathname?.startsWith(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                className={`block rounded-xl px-3 py-2 hover:bg-muted transition-colors${isActive ? ' bg-muted font-medium' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {i.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
