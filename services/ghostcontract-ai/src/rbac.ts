/**
 * GhostContractAI — RBAC Middleware
 *
 * Roles:
 *   viewer    — GET endpoints only
 *   operator  — compile, audit, verify
 *   auditor   — all audit and report endpoints
 *   governor  — deploy, upgrade, rollback (requires governance approval ref)
 *
 * In production, validate JWT against Keycloak/OIDC.
 * The stub below reads the X-Role header for devnet only.
 */

import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger.js";

export type RbacRole = "viewer" | "operator" | "auditor" | "governor";

const ROLE_HIERARCHY: Record<RbacRole, number> = {
  viewer:   0,
  operator: 1,
  auditor:  2,
  governor: 3,
};

export interface AuthContext {
  sub: string;
  role: RbacRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Middleware: populate req.auth from JWT or X-Role stub header.
 * Replace JWT validation stub with proper jose / Keycloak integration.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  const roleHeader = req.headers["x-role"] as string | undefined;

  // Production path: validate JWT Bearer token.
  if (authHeader?.startsWith("Bearer ")) {
    // TODO: validate with jose + OIDC JWKS endpoint (JWT_ISSUER env var)
    // Stub: extract role from token claims (insecure stub).
    const role = (roleHeader ?? "viewer") as RbacRole;
    req.auth = { sub: "jwt-user", role };
    return next();
  }

  // Devnet/CI stub: X-Role header (never use in production).
  if (roleHeader && process.env.NODE_ENV !== "production") {
    req.auth = { sub: "x-role-stub", role: roleHeader as RbacRole };
    return next();
  }

  // Unauthenticated: grant viewer by default (or reject in production).
  req.auth = { sub: "anonymous", role: "viewer" };
  next();
}

/**
 * Middleware: require minimum role level.
 */
export function requireRole(minRole: RbacRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.auth?.role ?? "viewer";
    if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY[minRole]) {
      logger.warn("Unauthorized: insufficient role", {
        required: minRole,
        provided: role,
        path: req.path,
      });
      res.status(403).json({
        ok: false,
        error: `Forbidden: requires role '${minRole}', got '${role}'`,
      });
      return;
    }
    next();
  };
}

/**
 * Audit log middleware: records privileged calls to structured log.
 */
export function auditLog(action: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    logger.info("AUDIT", {
      action,
      actor: req.auth?.sub ?? "anonymous",
      role:  req.auth?.role ?? "viewer",
      method: req.method,
      path:   req.path,
      ip:     req.ip,
    });
    next();
  };
}
