/**
 * GhostChain Sovereign Identity Network — GID API Server
 *
 * RESTful HTTP API exposing the GID system: identity resolution, wallet
 * authentication, and reputation queries.
 *
 * Endpoints:
 *   GET  /health                   → liveness probe
 *   GET  /resolve/:username        → username → identity
 *   GET  /reverse/:address         → wallet   → identity
 *   POST /auth/challenge           → issue ECDSA challenge nonce
 *   POST /auth/verify              → verify signature, issue session
 *   GET  /auth/session/:sessionId  → check session validity
 *   DELETE /auth/session/:sessionId → logout / revoke session
 *   GET  /reputation/:address      → multi-category reputation scores
 *
 * Security:
 *   - Input validated before any processing.
 *   - Username format enforced: 3-32 chars, [a-z0-9-] only.
 *   - Address format enforced: 0x + 40 hex chars.
 *   - Rate limiting delegated to AuthGateway per wallet.
 *   - All error responses use a uniform shape (no stack leakage in production).
 *   - JSON body size capped at 64 KB.
 *
 * Advisory-only:
 *   The API never performs autonomous on-chain writes.  All mutations route
 *   through GhostIdentityRegistry (contract) or the signing relay at :7910.
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 */

import express, { type NextFunction, type Request, type Response } from "express";
import { AuthGateway, type AuthError, type SignatureVerifier } from "../auth/auth_gateway.js";
import { IdentityResolver } from "../resolver/identity_resolver.js";
import { ReputationAI } from "../reputation/reputation_ai.js";

// ── Constants ────────────────────────────────────────────────────────────────

const PORT              = parseInt(process.env["GID_API_PORT"]       ?? "8080", 10);
const BODY_LIMIT        = process.env["GID_BODY_LIMIT"]              ?? "64kb";
const USERNAME_RE       = /^[a-z0-9-]{3,32}$/;
const ADDRESS_RE        = /^0x[0-9a-fA-F]{40}$/;

// ── asyncHandler ─────────────────────────────────────────────────────────────

function asyncHandler<TReq extends Request = Request>(
  fn: (req: TReq, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: TReq, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ── Error Shape ───────────────────────────────────────────────────────────────

interface ApiError {
  error: string;
  code?:  string;
}

function sendError(res: Response, status: number, message: string, code?: string): void {
  const body: ApiError = { error: message, ...(code ? { code } : {}) };
  res.status(status).json(body);
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateUsername(username: unknown): string | null {
  if (typeof username !== "string") return null;
  const clean = username.trim().toLowerCase();
  return USERNAME_RE.test(clean) ? clean : null;
}

function validateAddress(address: unknown): string | null {
  if (typeof address !== "string") return null;
  const clean = address.trim();
  return ADDRESS_RE.test(clean) ? clean.toLowerCase() : null;
}

// ── Route Body Shapes ─────────────────────────────────────────────────────────

interface ChallengeBody {
  wallet?: unknown;
}

interface VerifyBody {
  wallet?:    unknown;
  signature?: unknown;
  username?:  unknown;
}

// ── GID API Server ────────────────────────────────────────────────────────────

export interface GidApiOptions {
  resolver?:       IdentityResolver;
  authGateway?:    AuthGateway;
  reputationAI?:   ReputationAI;
  /** Injected SignatureVerifier passed to a default AuthGateway if none given. */
  verifier?:       SignatureVerifier;
  port?:           number;
}

export class GidApiServer {
  private readonly app:          ReturnType<typeof express>;
  private readonly resolver:     IdentityResolver;
  private readonly authGateway:  AuthGateway;
  private readonly reputationAI: ReputationAI;
  private readonly port:         number;

  constructor(opts: GidApiOptions = {}) {
    this.port         = opts.port         ?? PORT;
    this.resolver     = opts.resolver     ?? new IdentityResolver();
    this.authGateway  = opts.authGateway  ?? new AuthGateway({ verifier: opts.verifier });
    this.reputationAI = opts.reputationAI ?? new ReputationAI();
    this.app          = express();
    this._mount();
  }

  start(): void {
    this.app.listen(this.port, () => {
      console.log(`[GidApi] Listening on :${this.port}`);
    });
  }

  /** Expose the Express app for testing without binding a port. */
  get handler(): ReturnType<typeof express> {
    return this.app;
  }

  // ── Middleware ─────────────────────────────────────────────────────────────

  private _mount(): void {
    this.app.use(express.json({ limit: BODY_LIMIT }));
    this.app.disable("x-powered-by");

    // ── Health ──────────────────────────────────────────────────────────────

    this.app.get("/health", (_req, res) => {
      res.json({
        status:    "ok",
        service:   "gid-api",
        chain_id:  14000101,
        gas_token: "GST",
        timestamp: Math.floor(Date.now() / 1000),
      });
    });

    // ── Resolution ──────────────────────────────────────────────────────────

    this.app.get(
      "/resolve/:username",
      asyncHandler(async (req, res) => {
        const username = validateUsername(req.params["username"]);
        if (!username) return sendError(res, 400, "Invalid username format");

        const identity = await this.resolver.resolve(username);
        if (!identity) return sendError(res, 404, "Identity not found");

        res.json(identity);
      }),
    );

    this.app.get(
      "/reverse/:address",
      asyncHandler(async (req, res) => {
        const address = validateAddress(req.params["address"]);
        if (!address) return sendError(res, 400, "Invalid address format");

        const identity = await this.resolver.reverseResolve(address);
        if (!identity) return sendError(res, 404, "No identity for this address");

        res.json(identity);
      }),
    );

    // ── Authentication ──────────────────────────────────────────────────────

    this.app.post(
      "/auth/challenge",
      asyncHandler(async (req, res) => {
        const body = req.body as ChallengeBody;
        const wallet = validateAddress(body.wallet);
        if (!wallet) return sendError(res, 400, "Invalid or missing wallet address");

        try {
          const challenge = this.authGateway.createChallenge(wallet);
          res.json({
            nonce:      challenge.nonce,
            expires_at: challenge.expiresAt,
            wallet:     challenge.wallet,
          });
        } catch (err: unknown) {
          const authErr = err as AuthError;
          if (authErr.code === "RATE_LIMITED")
            return sendError(res, 429, authErr.message, authErr.code);
          throw err;
        }
      }),
    );

    this.app.post(
      "/auth/verify",
      asyncHandler(async (req, res) => {
        const body      = req.body as VerifyBody;
        const wallet    = validateAddress(body.wallet);
        const signature = typeof body.signature === "string" ? body.signature.trim() : null;
        const username  = typeof body.username  === "string"
                            ? validateUsername(body.username)
                            : undefined;

        if (!wallet)    return sendError(res, 400, "Invalid or missing wallet address");
        if (!signature) return sendError(res, 400, "Missing signature");

        try {
          const session = await this.authGateway.verifyChallenge(
            wallet,
            signature,
            username ?? undefined,
          );
          res.json({
            session_id:  session.sessionId,
            wallet:      session.wallet,
            username:    session.username,
            expires_at:  session.expiresAt,
          });
        } catch (err: unknown) {
          const authErr = err as AuthError;
          const statusMap: Record<string, number> = {
            CHALLENGE_NOT_FOUND: 404,
            CHALLENGE_EXPIRED:   410,
            SIGNATURE_INVALID:   401,
          };
          const status = statusMap[authErr.code ?? ""] ?? 400;
          return sendError(res, status, authErr.message, authErr.code);
        }
      }),
    );

    this.app.get(
      "/auth/session/:sessionId",
      asyncHandler(async (req, res) => {
        const sid = req.params["sessionId"];
        if (!sid || !/^[0-9a-f]{64}$/.test(sid))
          return sendError(res, 400, "Invalid session ID format");

        try {
          const session = this.authGateway.getSession(sid);
          res.json({
            wallet:     session.wallet,
            username:   session.username,
            expires_at: session.expiresAt,
          });
        } catch (err: unknown) {
          const authErr = err as AuthError;
          const status = authErr.code === "SESSION_NOT_FOUND" ? 404 : 401;
          return sendError(res, status, authErr.message, authErr.code);
        }
      }),
    );

    this.app.delete(
      "/auth/session/:sessionId",
      (req, res) => {
        const sid = req.params["sessionId"];
        if (!sid || !/^[0-9a-f]{64}$/.test(sid))
          return sendError(res, 400, "Invalid session ID format");

        this.authGateway.revokeSession(sid);
        res.status(204).end();
      },
    );

    // ── Reputation ──────────────────────────────────────────────────────────

    this.app.get(
      "/reputation/:address",
      asyncHandler(async (req, res) => {
        const address = validateAddress(req.params["address"]);
        if (!address) return sendError(res, 400, "Invalid address format");

        const profile = await this.reputationAI.getProfile(address);
        res.json(profile);
      }),
    );

    // ── Error Handler ───────────────────────────────────────────────────────

    this.app.use(
      (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
        const isDev = process.env["NODE_ENV"] !== "production";
        const message = err instanceof Error ? err.message : "Internal server error";

        console.error("[GidApi] Unhandled error:", message);
        res.status(500).json({
          error: isDev ? message : "Internal server error",
        });
      },
    );
  }
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

// Direct start when run as main module.
const isMain = process.argv[1]?.endsWith("gid_api.ts")
            || process.argv[1]?.endsWith("gid_api.js");

if (isMain) {
  const server = new GidApiServer();
  server.start();
}
