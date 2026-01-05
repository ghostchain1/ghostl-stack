# Identity & Access Module

Pages
- Login (Wallet / SSO)
- Users & Roles
- API Keys
- Sessions

Key components
- WalletConnectButton
- RoleEditor
- PolicyViewer
- ApprovalFlowPanel (multi-sig approvals)

Services
- AuthService (wallet signature, SSO tokens)
- RBACService (role → permissions matrix)
- AuditLogService (write once, immutable view)

Data models
- User { id, email, wallets[], roles[] }
- Role { id, name, permissions[] }
- ApiKey { id, name, scopes[], lastUsedAt }
- Session { id, userId, createdAt, ip }
