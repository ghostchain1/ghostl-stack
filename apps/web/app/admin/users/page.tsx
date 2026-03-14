import { UserManagement } from '../../../src/modules/identity-access/UserManagement';
import { SessionManagement } from '../../../src/modules/identity-access/SessionManagement';

export default async function UsersAdminPage() {
  return (
    <div className="content">
      <h2>User & session management</h2>
      <p className="muted">Requires ADMIN role.</p>
      <UserManagement />
      <div style={{ marginTop: 24 }}>
        <SessionManagement />
      </div>
    </div>
  );
}
