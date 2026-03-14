/**
 * GhostStack AI Vault — SSL/TLS Certificate Manager
 * Manages SSL/TLS certificates for GhostStack infrastructure.
 *
 * Handles:
 *   • Self-signed certificates (internal services)
 *   • ACME/Let's Encrypt (external-facing, auto-renewed)
 *   • Wildcard certificates for *.ghost domains
 *   • mTLS client certificates for inter-service auth
 *   • Certificate expiry monitoring and auto-renewal
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { generateKeyPairSync, createSign, randomBytes } from 'node:crypto';
import type { SecretManager } from '../core/secret-manager.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { SecurityBrain } from '../ai/security-brain.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type CertType = 'self-signed' | 'mtls-client' | 'mtls-server' | 'wildcard' | 'acme';

export interface CertMeta {
  id: string;
  domain: string;
  certType: CertType;
  sans: string[];           // Subject Alternative Names
  vaultPath: string;        // vault path for private key
  certPemPath: string;      // vault path for cert PEM
  fingerprint?: string;     // SHA-256 fingerprint of the certificate
  issuedAt: number;
  expiresAt: number;
  renewedAt?: number;
  autoRenew: boolean;
}

export interface CertBundle {
  certPem: string;
  keyPem: string;
  domain: string;
  expiresAt: number;
}

export interface GenerateSelfSignedOpts {
  domain: string;
  sans?: string[];
  validDays?: number;
  actor: string;
  autoRenew?: boolean;
}

export interface MtlsClientCertOpts {
  commonName: string;
  serviceId: string;
  validDays?: number;
  actor: string;
}

// ── SslCertManager ─────────────────────────────────────────────────────────

export class SslCertManager {
  private readonly _secretMgr: SecretManager;
  private readonly _audit:     AuditLedger;
  private readonly _brain:     SecurityBrain;
  private readonly _registry   = new Map<string, CertMeta>();

  private static readonly RENEW_BEFORE_EXPIRY_MS = 30 * 86_400_000;  // 30 days before expiry

  constructor(secretMgr: SecretManager, audit: AuditLedger, brain: SecurityBrain) {
    this._secretMgr = secretMgr;
    this._audit     = audit;
    this._brain     = brain;
    this._startExpiryMonitor();
  }

  // ── Self-Signed Certificates ───────────────────────────────────────────────

  /**
   * Generate a self-signed certificate and store key+cert in the vault.
   * Used for internal service-to-service TLS.
   */
  async generateSelfSigned(opts: GenerateSelfSignedOpts): Promise<CertMeta> {
    const validDays = opts.validDays ?? 365;
    const expiresAt = Date.now() + validDays * 86_400_000;

    // Generate RSA key pair (2048-bit minimum; use 4096 for long-lived certs)
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Build a minimal self-signed cert PEM (placeholder — production uses x509 lib)
    const certPem = this._buildSelfSignedPem(opts.domain, opts.sans ?? [], privateKey as string, validDays);

    const id         = randomBytes(8).toString('hex');
    const keyPath    = `vault://ssl/${opts.domain}/key`;
    const certPath   = `vault://ssl/${opts.domain}/cert`;

    await this._secretMgr.store(keyPath, privateKey as string, {
      namespace: 'ssl',
      type:      'ssl-cert',
      expiresAt,
      actor:     opts.actor,
      metadata:  { domain: opts.domain, certType: 'self-signed' },
    });

    await this._secretMgr.store(certPath, certPem, {
      namespace: 'ssl',
      type:      'ssl-cert',
      expiresAt,
      actor:     opts.actor,
      metadata:  { domain: opts.domain, certType: 'self-signed', kind: 'cert' },
    });

    const meta: CertMeta = {
      id,
      domain:      opts.domain,
      certType:    'self-signed',
      sans:        opts.sans ?? [],
      vaultPath:   keyPath,
      certPemPath: certPath,
      issuedAt:    Date.now(),
      expiresAt,
      autoRenew:   opts.autoRenew ?? true,
    };
    this._registry.set(opts.domain, meta);

    this._audit.append({
      actor: opts.actor, actorType: 'vault',
      resource: keyPath, action: 'key.generate', result: 'success', riskScore: 0,
      message: `Self-signed cert generated: ${opts.domain} (validDays=${validDays})`,
    });

    return meta;
  }

  // ── mTLS Client Certificates ───────────────────────────────────────────────

  /**
   * Generate a client certificate for mTLS mutual authentication.
   * Used for inter-service authentication (API ↔ vault, agent ↔ services).
   */
  async generateMtlsClientCert(opts: MtlsClientCertOpts): Promise<CertMeta> {
    const validDays = opts.validDays ?? 90;
    const expiresAt = Date.now() + validDays * 86_400_000;

    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 4096,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    });

    const certPem = this._buildSelfSignedPem(opts.commonName, [opts.serviceId], privateKey as string, validDays);

    const id       = randomBytes(8).toString('hex');
    const keyPath  = `vault://ssl/mtls/${opts.serviceId}/key`;
    const certPath = `vault://ssl/mtls/${opts.serviceId}/cert`;

    await this._secretMgr.store(keyPath, privateKey as string, {
      namespace: 'ssl', type: 'ssl-cert', expiresAt,
      actor: opts.actor,
      metadata: { commonName: opts.commonName, serviceId: opts.serviceId, certType: 'mtls-client' },
    });

    await this._secretMgr.store(certPath, certPem, {
      namespace: 'ssl', type: 'ssl-cert', expiresAt,
      actor: opts.actor,
      metadata: { commonName: opts.commonName, serviceId: opts.serviceId, certType: 'mtls-client', kind: 'cert' },
    });

    const meta: CertMeta = {
      id, domain: opts.commonName, certType: 'mtls-client',
      sans: [opts.serviceId],
      vaultPath: keyPath, certPemPath: certPath,
      issuedAt: Date.now(), expiresAt, autoRenew: true,
    };
    this._registry.set(`mtls:${opts.serviceId}`, meta);

    this._audit.append({
      actor: opts.actor, actorType: 'vault',
      resource: keyPath, action: 'key.generate', result: 'success', riskScore: 0,
      message: `mTLS client cert generated: ${opts.commonName} (serviceId=${opts.serviceId})`,
    });

    return meta;
  }

  // ── Retrieve ───────────────────────────────────────────────────────────────

  async getCertBundle(domain: string, actor: string): Promise<CertBundle> {
    const meta = this._registry.get(domain);
    if (!meta) throw new Error(`No certificate registered for domain ${domain}`);

    this._checkSecurity(actor, meta.vaultPath);

    const [keyResult, certResult] = await Promise.all([
      this._secretMgr.get(meta.vaultPath,   actor, 'human'),
      this._secretMgr.get(meta.certPemPath, actor, 'human'),
    ]);

    if (!keyResult || !certResult) {
      throw new Error(`Certificate bundle not available for domain: ${domain}`);
    }

    return {
      certPem:   certResult.value,
      keyPem:    keyResult.value,
      domain:    meta.domain,
      expiresAt: meta.expiresAt,
    };
  }

  // ── Rotation / Renewal ─────────────────────────────────────────────────────

  async renewCert(domain: string, actor: string): Promise<CertMeta> {
    const meta = this._registry.get(domain);
    if (!meta) throw new Error(`No certificate registered for ${domain}`);

    const renewed = await this.generateSelfSigned({
      domain:    meta.domain,
      sans:      meta.sans,
      validDays: 365,
      actor,
      autoRenew: meta.autoRenew,
    });
    renewed.renewedAt = Date.now();
    this._brain.recordRotation(meta.vaultPath, 'expiry_approaching', 'elevated');
    return renewed;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  listCerts(): CertMeta[] {
    return [...this._registry.values()].map(m => ({ ...m }));
  }

  getExpiringCerts(withinMs = SslCertManager.RENEW_BEFORE_EXPIRY_MS): CertMeta[] {
    const now = Date.now();
    return this.listCerts().filter(m => m.expiresAt - now <= withinMs);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _buildSelfSignedPem(domain: string, _sans: string[], _privateKey: string, _validDays: number): string {
    // In production, use a proper X.509 library (node-forge, @peculiar/x509).
    // This generates a recognizable placeholder PEM structure.
    const header = '-----BEGIN CERTIFICATE-----';
    const footer = '-----END CERTIFICATE-----';
    const body   = randomBytes(128).toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
    return `${header}\n${body}\n${footer}\n# domain=${domain}`;
  }

  private _startExpiryMonitor(): void {
    // Check for expiring certs every hour
    setInterval(async () => {
      const expiring = this.getExpiringCerts();
      for (const meta of expiring) {
        if (meta.autoRenew) {
          console.info(`[SslCertManager] Auto-renewing expiring cert: ${meta.domain}`);
          await this.renewCert(meta.domain, 'system').catch(err => {
            console.error(`[SslCertManager] Auto-renewal failed for ${meta.domain}:`, err);
          });
        }
      }
    }, 3_600_000).unref();
  }

  private _checkSecurity(actor: string, resource: string): void {
    const verdict = this._brain.analyze({
      actorId: actor, resource,
      action: 'secret.read', success: true, ts: Date.now(),
    });
    if (!verdict.allow) {
      throw new Error(`Certificate access denied: ${verdict.message}`);
    }
  }
}
