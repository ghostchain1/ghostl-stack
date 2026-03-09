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
    // ── PKCE / authorization-code flow (consumed and cleared in /auth/oidc/callback) ──
    /** PKCE code_verifier — S256 challenge stored during /auth/oidc/login */
    oidcPkceVerifier?: string;
    /** Anti-CSRF state nonce stored during /auth/oidc/login */
    oidcState?: string;
    /** Post-login redirect destination (relative path or validated absolute URL) */
    oidcRedirectTo?: string;
  }
}
