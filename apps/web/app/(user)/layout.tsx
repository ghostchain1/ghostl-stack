import { ReactNode } from 'react';
import { requireRealm } from '@/lib/authz';
import { AppShell } from '@/components/shell/AppShell';

export default async function UserLayout({ children }: { children: ReactNode }) {
  await requireRealm('users');
  return <AppShell realm="users">{children}</AppShell>;
}
