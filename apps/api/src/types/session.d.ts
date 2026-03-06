import 'express-session';
import type { OIDCRealm, RealmClaim } from '../../../../packages/types';

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
    /** OIDC realm claim populated by realm-auth middleware after JWT validation */
    realmClaim?: RealmClaim;
    /** Raw OIDC access token (stored for downstream service delegation) */
    oidcAccessToken?: string;
    /** The realm that authenticated this session via OIDC */
    oidcRealm?: OIDCRealm;
  }
}
