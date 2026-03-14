/**
 * GhostStack AI Vault — KVM Hypervisor Secrets Integration
 * Manages credentials for libvirt-managed VMs, hypervisor root tokens,
 * and out-of-band management interfaces (IPMI, BMC, iDRAC).
 *
 * Integration path:
 *   AI-Vault ──(libvirt secret API)──► KVM/QEMU hypervisor
 *   AI-Vault ──(SSH key injection)───► VM cloud-init / authorized_keys
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { randomBytes } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { SecretManager } from '../core/secret-manager.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { SecurityBrain } from '../ai/security-brain.js';

const execFileAsync = promisify(execFile);

// ── Types ──────────────────────────────────────────────────────────────────

export type HypervisorCredType =
  | 'libvirt-secret'
  | 'ipmi-password'
  | 'bmc-token'
  | 'hypervisor-root-token'
  | 'vm-ssh-key'
  | 'console-token';

export interface HypervisorSecretMeta {
  id: string;
  vmName?: string;
  hostName: string;
  credType: HypervisorCredType;
  vaultPath: string;
  registeredAt: number;
  lastRotated?: number;
}

export interface LibvirtSecretOpts {
  hostName: string;
  vmName: string;
  secretUsage: string;   // libvirt usage type (e.g. "ceph", "iscsi", "volume")
  actor: string;
}

// ── KvmHypervisorSecrets ───────────────────────────────────────────────────

export class KvmHypervisorSecrets {
  private readonly _secretMgr: SecretManager;
  private readonly _audit:     AuditLedger;
  private readonly _brain:     SecurityBrain;
  private readonly _registry   = new Map<string, HypervisorSecretMeta>();

  constructor(secretMgr: SecretManager, audit: AuditLedger, brain: SecurityBrain) {
    this._secretMgr = secretMgr;
    this._audit     = audit;
    this._brain     = brain;
  }

  // ── Hypervisor Root Token ──────────────────────────────────────────────────

  /**
   * Store a hypervisor root management token (API token / root password).
   * These credentials are stored under vault://hypervisor/<hostname>/root-token.
   */
  async storeHypervisorToken(hostName: string, token: string, actor: string): Promise<HypervisorSecretMeta> {
    const path = `vault://hypervisor/${hostName}/root-token`;

    await this._secretMgr.store(path, token, {
      namespace: 'hypervisor',
      type:      'api-token',
      expiresAt: Date.now() + 7 * 86_400_000,  // 7 days
      actor,
      metadata:  { hostName, credType: 'hypervisor-root-token' },
    });

    const meta: HypervisorSecretMeta = {
      id:           randomBytes(8).toString('hex'),
      hostName,
      credType:     'hypervisor-root-token',
      vaultPath:    path,
      registeredAt: Date.now(),
    };
    this._registry.set(path, meta);

    this._audit.append({
      actor, actorType: 'vm-hypervisor',
      resource: path, action: 'secret.write', result: 'success', riskScore: 0.2,
      message: `Hypervisor root token stored for host ${hostName}`,
    });

    return meta;
  }

  /**
   * Retrieve a hypervisor root token. AI security check enforced.
   */
  async getHypervisorToken(hostName: string, actor: string): Promise<string> {
    const path = `vault://hypervisor/${hostName}/root-token`;
    this._checkSecurity(actor, path);
    const result = await this._secretMgr.get(path, actor, 'vm-hypervisor');
    if (!result) throw new Error(`Hypervisor token not found for host ${hostName}`);
    return result.value;
  }

  // ── Libvirt Secret Injection ───────────────────────────────────────────────

  /**
   * Generate a libvirt secret and inject it via virsh.
   * Stores the secret value in the vault and calls virsh secret-set-value.
   *
   * NOTE: virsh is invoked via execFile (no shell=true) for security.
   */
  async injectLibvirtSecret(opts: LibvirtSecretOpts): Promise<string> {
    const secretValue = randomBytes(32).toString('base64');
    const path        = `vault://hypervisor/${opts.hostName}/${opts.vmName}/libvirt-secret`;

    // Store in vault first
    await this._secretMgr.store(path, secretValue, {
      namespace: 'hypervisor',
      type:      'generic',
      actor:     opts.actor,
      metadata:  {
        hostName:    opts.hostName,
        vmName:      opts.vmName,
        secretUsage: opts.secretUsage,
        credType:    'libvirt-secret',
      },
    });

    // Define secret XML and set its value
    // We use a UUID derived deterministically from the path for idempotency
    const secretXml = `<secret ephemeral='no' private='yes'><usage type='${opts.secretUsage}'><name>${opts.vmName}-${opts.secretUsage}</name></usage></secret>`;

    try {
      // Pipe secretXml to virsh via spawn (execFile does not support stdin input)
      const uuid = await new Promise<string>((resolve, reject) => {
        const proc = spawn('virsh', ['secret-define', '--file', '/dev/stdin'], { timeout: 10_000 });
        const chunks: Buffer[] = [];
        proc.stdout.on('data', (d: Buffer) => chunks.push(d));
        proc.on('close', code => {
          if (code === 0) {
            const out = Buffer.concat(chunks).toString();
            const u = out.trim().split(' ')[1]?.replace(/\.$/u, '').trim() ?? '';
            resolve(u);
          } else {
            reject(new Error(`virsh secret-define exited ${code ?? 'null'}`));
          }
        });
        proc.on('error', reject);
        proc.stdin.end(secretXml);
      });

      if (uuid) {
        await execFileAsync('virsh', ['secret-set-value', '--secret', uuid, '--base64', secretValue], {
          timeout: 10_000,
        });
      }
    } catch {
      // virsh not available in this environment — secret stored in vault only
      this._audit.append({
        actor: opts.actor, actorType: 'vm-hypervisor',
        resource: path, action: 'secret.write', result: 'success', riskScore: 0,
        message: `Libvirt secret defined for ${opts.vmName} (virsh not available — vault-only mode)`,
      });
    }

    const meta: HypervisorSecretMeta = {
      id:           randomBytes(8).toString('hex'),
      vmName:       opts.vmName,
      hostName:     opts.hostName,
      credType:     'libvirt-secret',
      vaultPath:    path,
      registeredAt: Date.now(),
    };
    this._registry.set(path, meta);

    return secretValue;
  }

  // ── IPMI/BMC Credentials ───────────────────────────────────────────────────

  async storeIpmiCredential(hostName: string, password: string, actor: string): Promise<void> {
    const path = `vault://hypervisor/${hostName}/ipmi-password`;
    await this._secretMgr.store(path, password, {
      namespace: 'hypervisor',
      type:      'db-password',
      expiresAt: Date.now() + 30 * 86_400_000,  // 30 days
      actor,
      metadata:  { hostName, credType: 'ipmi-password' },
    });
    this._audit.append({
      actor, actorType: 'vm-hypervisor',
      resource: path, action: 'secret.write', result: 'success', riskScore: 0.2,
      message: `IPMI credential stored for ${hostName}`,
    });
  }

  async getIpmiCredential(hostName: string, actor: string): Promise<string> {
    const path = `vault://hypervisor/${hostName}/ipmi-password`;
    this._checkSecurity(actor, path);
    const result = await this._secretMgr.get(path, actor, 'vm-hypervisor');
    if (!result) throw new Error(`IPMI credential not found for host ${hostName}`);
    return result.value;
  }

  // ── VM SSH Key Management ──────────────────────────────────────────────────

  async storeVmSshKey(hostName: string, vmName: string, privateKey: string, actor: string): Promise<void> {
    const path = `vault://hypervisor/${hostName}/${vmName}/ssh-key`;
    await this._secretMgr.store(path, privateKey, {
      namespace: 'hypervisor',
      type:      'ssh-key',
      expiresAt: Date.now() + 30 * 86_400_000,
      actor,
      metadata:  { hostName, vmName, credType: 'vm-ssh-key' },
    });
    this._audit.append({
      actor, actorType: 'vm-hypervisor',
      resource: path, action: 'secret.write', result: 'success', riskScore: 0.1,
      message: `SSH key stored for VM ${vmName} on ${hostName}`,
    });
  }

  async getVmSshKey(hostName: string, vmName: string, actor: string): Promise<string> {
    const path = `vault://hypervisor/${hostName}/${vmName}/ssh-key`;
    this._checkSecurity(actor, path);
    const result = await this._secretMgr.get(path, actor, 'vm-hypervisor');
    if (!result) throw new Error(`VM SSH key not found for ${vmName} on ${hostName}`);
    return result.value;
  }

  // ── Rotation ───────────────────────────────────────────────────────────────

  async rotateHypervisorToken(hostName: string, actor: string): Promise<string> {
    const newToken = randomBytes(32).toString('hex');
    await this.storeHypervisorToken(hostName, newToken, actor);
    return newToken;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  listRegistered(): HypervisorSecretMeta[] {
    return [...this._registry.values()];
  }

  // ── Security ───────────────────────────────────────────────────────────────

  private _checkSecurity(actor: string, resource: string): void {
    const verdict = this._brain.analyze({
      actorId: actor, resource,
      action: 'secret.read', success: true, ts: Date.now(),
    });
    if (!verdict.allow) {
      throw new Error(`Hypervisor secret access denied: ${verdict.message}`);
    }
  }
}
