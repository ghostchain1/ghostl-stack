# Identity & Access Module

Pages
- Login (password / SSO)
- Users & Roles
- API Keys
- Sessions

Key components
- GhostWalletButton
- RoleEditor
- PolicyViewer
- ApprovalFlowPanel (multi-sig approvals)

Services
- AuthService (password auth, SSO tokens)
- RBACService (role → permissions matrix)
- AuditLogService (write once, immutable view)

Data models
- User { id, email, wallets[], roles[] }
- Role { id, name, permissions[] }
- ApiKey { id, name, scopes[], lastUsedAt }
- Session { id, userId, createdAt, ip }

Permission groups (RBAC you’ll want)
- Viewer: read-only dashboards
- Operator: node/validator ops actions
- Security Admin: keys, vault, policies, incident response
- Treasury Admin: payouts, multisig flows, financial exports
- Protocol Admin: fee model, forks, feature flags
- Developer: contracts registry, webhooks, RPC management
