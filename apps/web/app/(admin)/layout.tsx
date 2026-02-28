import { ReactNode } from 'react';
import { requireRealm } from '@/lib/authz';
import { AppShell } from '@/components/shell/AppShell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRealm('admins');
  return <AppShell realm="admins">{children}</AppShell>;
}
