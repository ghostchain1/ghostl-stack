import { redirect } from 'next/navigation';
import { fetchServerSession } from '../../../src/modules/identity-access/serverSession';
import { UserManagement } from '../../../src/modules/identity-access/UserManagement';

export default async function UsersAdminPage() {
  const session = await fetchServerSession();
  if (!session.user) {
    redirect('/login?returnTo=/admin/users');
  }
  return (
    <div className="content">
      <h2>User & wallet management</h2>
      <p className="muted">Requires iam:read/iam:write permissions.</p>
      <UserManagement />
    </div>
  );
}
