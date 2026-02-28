import { ReactNode } from 'react';
import { requireRealm } from '@/lib/authz';
import { AppShell } from '@/components/shell/AppShell';

export default async function EmployeeLayout({ children }: { children: ReactNode }) {
  await requireRealm('employees');
  return <AppShell realm="employees">{children}</AppShell>;
}
