'use client';

import { useMemo } from 'react';
import { useSession } from '../../../src/modules/identity-access/session';
import { normalizeRole, roleOrder } from '../../../src/modules/identity-access/access-policy';
import { UserManagement } from '../../../src/modules/identity-access/UserManagement';
import { SessionManagement } from '../../../src/modules/identity-access/SessionManagement';
import { WalletClient } from '../../wallet/WalletClient';

export default function UsersWalletsPage() {
  const { user } = useSession();
  const role = normalizeRole(user?.role);
  const isAdmin = useMemo(() => roleOrder[role] >= roleOrder.ADMIN, [role]);

  return (
    <div className="content">
      <div className="card-grid">
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>GhostWallet operations</div>
          <WalletClient />
        </div>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Users & sessions</div>
          {isAdmin ? (
            <>
              <UserManagement />
              <div style={{ marginTop: 24 }}>
                <SessionManagement />
              </div>
            </>
          ) : (
            <div className="muted">Admin role required for user and session management.</div>
          )}
        </div>
      </div>
    </div>
  );
}
