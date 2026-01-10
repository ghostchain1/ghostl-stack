import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    roles?: string[];
    permissions?: string[];
    nonce?: string;
    nonceCreatedAt?: number;
    expiresAt?: number;
    lastSeenAt?: number;
  }
}
