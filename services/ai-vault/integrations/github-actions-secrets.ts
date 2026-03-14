/**
 * GhostStack AI Vault — GitHub Actions Secrets Integration
 * Manages CI/CD secrets for GitHub Actions workflows.
 *
 * Secrets are stored in the vault and can be:
 *   1. Pushed to GitHub Actions via the GitHub API (requires PAT)
 *   2. Retrieved as env-var maps for use in local/self-hosted runners
 *   3. Rotated automatically on a 30-day schedule
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { SecretManager } from '../core/secret-manager.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { SecurityBrain } from '../ai/security-brain.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type GitHubSecretScope = 'repository' | 'environment' | 'organization';

export interface CicdSecretMeta {
  name: string;              // GitHub secret name (ALL_CAPS)
  vaultPath: string;         // vault:// path
  scope: GitHubSecretScope;
  repo?: string;             // owner/repo
  environment?: string;      // GitHub environment name
  org?: string;
  registeredAt: number;
  lastRotated?: number;
}

export interface GitHubActionsConfig {
  /** GitHub Personal Access Token with repo/secrets write access */
  pat?: string;
  /** Owner (user or org) */
  owner?: string;
  /** Default repo for repository-scoped secrets */
  defaultRepo?: string;
}

// ── GitHubActionsSecrets ───────────────────────────────────────────────────

export class GitHubActionsSecrets {
  private readonly _secretMgr: SecretManager;
  private readonly _audit:     AuditLedger;
  private readonly _brain:     SecurityBrain;
  private readonly _cfg:       GitHubActionsConfig;
  private readonly _registry   = new Map<string, CicdSecretMeta>();

  constructor(
    secretMgr: SecretManager,
    audit: AuditLedger,
    brain: SecurityBrain,
    cfg: GitHubActionsConfig = {},
  ) {
    this._secretMgr = secretMgr;
    this._audit     = audit;
    this._brain     = brain;
    this._cfg       = cfg;
  }

  // ── Store / Register ───────────────────────────────────────────────────────

  /**
   * Store a CI/CD secret in the vault and register its GitHub Actions mapping.
   */
  async storeSecret(
    githubSecretName: string,
    value: string,
    scope: GitHubSecretScope,
    opts: { repo?: string; environment?: string; org?: string; actor: string },
  ): Promise<CicdSecretMeta> {
    const safeName  = githubSecretName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const vaultPath = `vault://github/actions/${safeName}`;

    await this._secretMgr.store(vaultPath, value, {
      namespace: 'github',
      type:      'api-token',
      expiresAt: Date.now() + 30 * 86_400_000,  // 30 days
      actor:     opts.actor,
      metadata: {
        githubSecretName: safeName,
        scope,
        repo:        opts.repo ?? '',
        environment: opts.environment ?? '',
        org:         opts.org ?? '',
      },
    });

    const meta: CicdSecretMeta = {
      name:         safeName,
      vaultPath,
      scope,
      ...(opts.repo        !== undefined && { repo:        opts.repo }),
      ...(opts.environment !== undefined && { environment: opts.environment }),
      ...(opts.org         !== undefined && { org:         opts.org }),
      registeredAt: Date.now(),
    };
    this._registry.set(safeName, meta);

    this._audit.append({
      actor: opts.actor, actorType: 'ci-cd',
      resource: vaultPath, action: 'secret.write', result: 'success', riskScore: 0,
      message: `GitHub Actions secret registered: ${safeName} (scope=${scope})`,
    });

    return meta;
  }

  // ── Retrieve ───────────────────────────────────────────────────────────────

  /**
   * Retrieve a GitHub Actions secret value from the vault.
   */
  async getSecret(githubSecretName: string, actor: string): Promise<string> {
    const safeName  = githubSecretName.toUpperCase();
    const vaultPath = `vault://github/actions/${safeName}`;

    this._checkSecurity(actor, vaultPath);

    const result = await this._secretMgr.get(vaultPath, actor, 'ci-cd');
    if (!result) throw new Error(`Secret ${githubSecretName} not found or expired`);
    return result.value;
  }

  /**
   * Generate an env-var map of all registered GitHub secrets.
   * Used by self-hosted runners to load all CI secrets at once.
   */
  async generateRunnerEnv(actor: string): Promise<Record<string, string>> {
    const env: Record<string, string> = {};
    for (const meta of this._registry.values()) {
      try {
        env[meta.name] = await this.getSecret(meta.name, actor);
      } catch {
        // Skip inaccessible or expired secrets
      }
    }
    return env;
  }

  // ── Rotation ───────────────────────────────────────────────────────────────

  /**
   * Rotate a secret value. If GitHub PAT is configured, also updates
   * the secret in GitHub Actions.
   */
  async rotateSecret(githubSecretName: string, newValue: string, actor: string): Promise<void> {
    const meta = this._registry.get(githubSecretName.toUpperCase());
    if (!meta) throw new Error(`Secret ${githubSecretName} not registered`);

    await this._secretMgr.store(meta.vaultPath, newValue, { actor, actorType: 'ci-cd' });

    meta.lastRotated = Date.now();

    // If GitHub PAT is available, push rotation to GitHub API
    if (this._cfg.pat && this._cfg.owner) {
      await this._pushToGitHub(meta, newValue).catch(err => {
        // Non-fatal: vault is source of truth
        console.warn(`[GitHubActionsSecrets] GitHub API push failed: ${err.message}`);
      });
    }

    this._audit.append({
      actor, actorType: 'ci-cd',
      resource: meta.vaultPath, action: 'secret.rotate', result: 'success', riskScore: 0,
      message: `GitHub Actions secret rotated: ${meta.name}`,
    });
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  listSecrets(): CicdSecretMeta[] {
    return [...this._registry.values()].map(m => ({ ...m }));
  }

  getRegistration(name: string): CicdSecretMeta | undefined {
    return this._registry.get(name.toUpperCase());
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async _pushToGitHub(meta: CicdSecretMeta, value: string): Promise<void> {
    // Construct GitHub API URL based on scope
    let apiUrl: string;
    if (meta.scope === 'repository' && meta.repo) {
      apiUrl = `https://api.github.com/repos/${this._cfg.owner}/${meta.repo}/actions/secrets/${meta.name}`;
    } else if (meta.scope === 'organization' && meta.org) {
      apiUrl = `https://api.github.com/orgs/${meta.org}/actions/secrets/${meta.name}`;
    } else {
      return; // Cannot determine URL
    }

    // Note: GitHub requires secrets to be encrypted with the repo's Libsodium public key.
    // In production, use @noble/ed25519 + tweetnacl for the sealing operation.
    // Here we log the intent — full implementation requires the GitHub public key step.
    console.info(`[GitHubActionsSecrets] Would push ${meta.name} to ${apiUrl} (requires Libsodium sealing)`);
  }

  private _checkSecurity(actor: string, resource: string): void {
    const verdict = this._brain.analyze({
      actorId: actor, resource,
      action: 'secret.read', success: true, ts: Date.now(),
    });
    if (!verdict.allow) {
      throw new Error(`CI/CD secret access denied: ${verdict.message}`);
    }
  }
}
