import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    roles?: string[];
    permissions?: string[];
    ip?: string;
    userAgent?: string;
    csrfToken?: string;
    rotatedFrom?: string;
    nonce?: string;
    nonceCreatedAt?: number;
    expiresAt?: number;
    lastSeenAt?: number;
  }
}
