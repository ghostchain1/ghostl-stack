# Identity & Access Module

Pages
- Login (password)
- Users
- Sessions & Devices

Key components
- UserManagement
- SessionManagement

Services
- AuthService (password auth, session cookies)
- RBACService (role enforcement)
- AuditLogService (auth events)

Data models
- User { id, email, role, createdAt, updatedAt }
- Session { id, userId, deviceId, createdAt, lastSeenAt, expiresAt, revokedAt }
- Device { id, userId, deviceHash, lastSeenAt }
- AuditLog { id, userId, action, createdAt, metadata }

Roles
- READONLY
- OPERATOR
- ADMIN
- OWNER
