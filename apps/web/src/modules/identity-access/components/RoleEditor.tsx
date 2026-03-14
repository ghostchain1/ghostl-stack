'use client';

import { useState } from 'react';
import type { Role } from '@ghostl/types/auth';

type Props = {
  roles: Role[];
  onSave?: (next: Role[]) => void;
};

const emptyRole = (): Role => ({ id: crypto.randomUUID(), name: 'New Role', permissions: [] });

export function RoleEditor({ roles, onSave }: Props) {
  const [drafts, setDrafts] = useState<Role[]>(roles.length ? roles : [emptyRole()]);
  const [newPerm, setNewPerm] = useState<string>('');

  const updateRole = (idx: number, next: Partial<Role>) => {
    setDrafts((prev) => prev.map((r, i) => (i === idx ? { ...r, ...next } : r)));
  };

  const addPermission = (idx: number) => {
    if (!newPerm.trim()) return;
    updateRole(idx, { permissions: Array.from(new Set([...(drafts[idx].permissions || []), newPerm.trim()])) });
    setNewPerm('');
  };

  const addRole = () => setDrafts((prev) => [...prev, emptyRole()]);

  const save = () => onSave?.(drafts);

  return (
    <div className="stack" style={{ gap: 10 }}>
      {drafts.map((role, idx) => (
        <div key={role.id} className="card">
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            <input
              className="input"
              value={role.name}
              onChange={(e) => updateRole(idx, { name: e.target.value })}
              placeholder="Role name"
            />
            <div className="badge">{role.permissions.length} perms</div>
          </div>
          <div className="muted mono" style={{ marginTop: 6 }}>
            {role.permissions.length ? role.permissions.join(', ') : 'No permissions yet'}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <input
              className="input"
              value={newPerm}
              onChange={(e) => setNewPerm(e.target.value)}
              placeholder="permission string (e.g., guard:write)"
            />
            <button className="button secondary" type="button" onClick={() => addPermission(idx)}>
              Add perm
            </button>
          </div>
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <button className="button secondary" type="button" onClick={addRole}>
          Add role
        </button>
        <button className="button" type="button" onClick={save}>
          Save roles
        </button>
      </div>
    </div>
  );
}
