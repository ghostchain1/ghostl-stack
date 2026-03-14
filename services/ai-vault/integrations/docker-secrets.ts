/**
 * GhostStack AI Vault — Docker Secrets Integration
 * Provides secure secret injection for Docker containers via the vault API.
 *
 * Usage patterns:
 *   1. Token-based: container exchanges a short-lived token for its secrets
 *   2. CLI-based:   `ghost-vault get docker/postgres/password`
 *   3. ENV inject:  ghost-vault injects env vars into a container at launch
 *
 * Containers authenticate via:
 *   • Pre-issued container token (short-lived JWT)
 *   • Container label fingerprint
 *   • Docker socket namespace isolation
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { createHmac, randomBytes } from 'node:crypto';
import type { SecretManager } from '../core/secret-manager.js';
import type { ActorIdentity } from '../core/identity-engine.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { SecurityBrain } from '../ai/security-brain.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContainerRegistration {
  containerId: string;
  containerName: string;
  imageName: string;
  allowedSecretPaths: string[];  // vault:// paths the container is allowed to read
  token: string;                 // short-lived access token
  tokenExpiresAt: number;
  registeredAt: number;
  registeredBy: string;
}

export interface SecretInjectionRequest {
  containerId: string;
  token: string;
  path: string;         // vault:// path
  sourceIp?: string;
}

export interface SecretInjectionResult {
  ok: boolean;
  value?: string;
  error?: string;
}

// ── DockerSecretsIntegration ───────────────────────────────────────────────

export class DockerSecretsIntegration {
  private readonly _secretMgr:  SecretManager;
  private readonly _identity:   { type: ActorIdentity['type'] } | null;
  private readonly _audit:      AuditLedger;
  private readonly _brain:      SecurityBrain;

  // In-memory registry: containerId → registration
  private readonly _containers = new Map<string, ContainerRegistration>();

  // Token → containerId reverse lookup
  private readonly _tokenIndex = new Map<string, string>();

  private static readonly TOKEN_TTL_MS = 5 * 60 * 1000;  // 5 minutes

  constructor(
    secretMgr: SecretManager,
    identity: { type: ActorIdentity['type'] } | null,
    audit: AuditLedger,
    brain: SecurityBrain,
  ) {
    this._secretMgr = secretMgr;
    this._identity  = identity;
    this._audit     = audit;
    this._brain     = brain;
    this._startTokenCleanup();
  }

  // ── Container Registration ─────────────────────────────────────────────────

  /**
   * Register a Docker container and issue it a short-lived access token.
   * Called by the orchestrator or CI/CD pipeline before container startup.
   */
  registerContainer(
    containerId: string,
    containerName: string,
    imageName: string,
    allowedPaths: string[],
    registeredBy: string,
  ): ContainerRegistration {
    // Validate paths
    for (const p of allowedPaths) {
      if (!p.startsWith('vault://docker/')) {
        throw new Error(`Container secrets must be under vault://docker/ (got: ${p})`);
      }
    }

    const token      = this._generateToken(containerId);
    const expiresAt  = Date.now() + DockerSecretsIntegration.TOKEN_TTL_MS;

    const reg: ContainerRegistration = {
      containerId,
      containerName,
      imageName,
      allowedSecretPaths: allowedPaths,
      token,
      tokenExpiresAt: expiresAt,
      registeredAt:   Date.now(),
      registeredBy,
    };

    this._containers.set(containerId, reg);
    this._tokenIndex.set(token, containerId);

    this._audit.append({
      actor: registeredBy, actorType: 'vault',
      resource: `vault://docker/container/${containerId}`,
      action: 'auth.issue', result: 'success', riskScore: 0,
      message: `Container registered: ${containerName} (${imageName})`,
    });

    return { ...reg };
  }

  /**
   * Renew a container token before it expires.
   */
  renewToken(containerId: string, actor: string): string {
    const reg = this._containers.get(containerId);
    if (!reg) throw new Error(`Container ${containerId} not registered`);

    // Remove old token
    this._tokenIndex.delete(reg.token);

    // Issue new token
    const token     = this._generateToken(containerId);
    const expiresAt = Date.now() + DockerSecretsIntegration.TOKEN_TTL_MS;

    reg.token          = token;
    reg.tokenExpiresAt = expiresAt;
    this._tokenIndex.set(token, containerId);

    this._audit.append({
      actor, actorType: 'docker-container',
      resource: `vault://docker/container/${containerId}`,
      action: 'auth.issue', result: 'success', riskScore: 0,
      message: `Container token renewed: ${reg.containerName}`,
    });

    return token;
  }

  // ── Secret Retrieval ───────────────────────────────────────────────────────

  /**
   * Retrieve a secret for a registered container. The container presents
   * its token and requests a specific vault path.
   */
  async getSecret(req: SecretInjectionRequest): Promise<SecretInjectionResult> {
    // Resolve container from token
    const containerId = this._tokenIndex.get(req.token);
    if (!containerId || containerId !== req.containerId) {
      this._audit.append({
        actor: req.containerId, actorType: 'docker-container',
        resource: req.path, action: 'secret.read',
        result: 'denied', riskScore: 0.8,
        message: 'Invalid container token',
      });
      return { ok: false, error: 'Invalid token' };
    }

    const reg = this._containers.get(containerId);
    if (!reg) return { ok: false, error: 'Container not registered' };

    // Check token expiry
    if (Date.now() > reg.tokenExpiresAt) {
      this._tokenIndex.delete(req.token);
      return { ok: false, error: 'Token expired — renew with vault API' };
    }

    // Enforce path allowlist
    const allowed = reg.allowedSecretPaths.some(p => req.path === p || req.path.startsWith(p.replace('**', '')));
    if (!allowed) {
      this._audit.append({
        actor: containerId, actorType: 'docker-container',
        resource: req.path, action: 'secret.read',
        result: 'denied', riskScore: 0.6,
        message: `Container ${reg.containerName} not allowed to access ${req.path}`,
      });
      return { ok: false, error: 'Path not in container allowlist' };
    }

    // AI security screening
    const verdict = this._brain.analyze({
      actorId:  containerId,
      resource: req.path,
      action:   'secret.read',
      ...(req.sourceIp !== undefined && { sourceIp: req.sourceIp }),
      success:  true,
      ts:       Date.now(),
    });
    if (!verdict.allow) {
      return { ok: false, error: `Denied by security brain: ${verdict.message}` };
    }

    // Retrieve secret
    try {
      const secretValue = await this._secretMgr.get(req.path, containerId, 'docker-container');
      if (!secretValue) return { ok: false, error: 'Secret not found or expired' };
      return { ok: true, value: secretValue.value };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Generate an env-var map for a container: { ENV_VAR: secretValue }
   * Used by the container orchestrator to inject all registered secrets at once.
   */
  async generateEnvInjection(containerId: string, token: string): Promise<Record<string, string>> {
    const reg = this._containers.get(containerId);
    if (!reg) throw new Error(`Container ${containerId} not registered`);

    const result: Record<string, string> = {};

    for (const path of reg.allowedSecretPaths) {
      const res = await this.getSecret({ containerId, token, path });
      if (res.ok && res.value !== undefined) {
        // Convert vault://docker/postgres/password → POSTGRES_PASSWORD
        const envKey = path
          .replace('vault://docker/', '')
          .replace(/\//g, '_')
          .toUpperCase();
        result[envKey] = res.value;
      }
    }

    return result;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  getRegistration(containerId: string): ContainerRegistration | undefined {
    const reg = this._containers.get(containerId);
    return reg ? { ...reg } : undefined;
  }

  listContainers(): ContainerRegistration[] {
    return [...this._containers.values()].map(r => ({ ...r }));
  }

  deregister(containerId: string, actor: string): void {
    const reg = this._containers.get(containerId);
    if (!reg) return;
    this._tokenIndex.delete(reg.token);
    this._containers.delete(containerId);
    this._audit.append({
      actor, actorType: 'vault',
      resource: `vault://docker/container/${containerId}`,
      action: 'auth.revoke', result: 'success', riskScore: 0,
      message: `Container deregistered: ${reg.containerName}`,
    });
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _generateToken(containerId: string): string {
    const nonce = randomBytes(16).toString('hex');
    const hmac  = createHmac('sha256', nonce).update(containerId).digest('hex');
    return `ct.${nonce}.${hmac}`;
  }

  private _startTokenCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [token, containerId] of this._tokenIndex) {
        const reg = this._containers.get(containerId);
        if (!reg || now > reg.tokenExpiresAt) {
          this._tokenIndex.delete(token);
        }
      }
    }, 60_000).unref();
  }
}
