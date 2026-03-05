import { ProcessRunner, Logger } from "@ghostchain/devkit";
import { promises as fs } from "node:fs";
import * as os from "node:os";

const log = Logger.create("DomainController");

export interface DnsRecord {
  name: string;
  ip: string;
  type?: "A" | "AAAA" | "CNAME";
  ttl?: number;
}

/**
 * GhostDomainController — manages DNS records via a GhostBrain HTTP
 * API with an /etc/hosts fallback, and issues TLS certs via certbot.
 */
export class GhostDomainController {
  private readonly apiBase: string;
  private readonly hostsFile: string;

  constructor(opts: { apiBase?: string; hostsFile?: string } = {}) {
    this.apiBase   = opts.apiBase   ?? (process.env["GHOSTBRAIN_API"] ?? "http://localhost:8080");
    this.hostsFile = opts.hostsFile ?? "/etc/hosts";
  }

  // ─── DNS record management ────────────────────────────────────────

  /** Add or update a DNS A record. */
  async addRecord(record: DnsRecord): Promise<void> {
    const success = await this.apiBrainAddRecord(record);
    if (!success) {
      await this.hostsAddRecord(record);
    }
    log.info(`DNS addRecord: ${record.name} → ${record.ip}`);
  }

  /** Remove a DNS record. */
  async removeRecord(name: string): Promise<void> {
    const success = await this.apiBrainRemoveRecord(name);
    if (!success) {
      await this.hostsRemoveRecord(name);
    }
    log.info(`DNS removeRecord: ${name}`);
  }

  /** Resolve a hostname. Returns null if not resolvable. */
  async resolve(hostname: string): Promise<string | null> {
    try {
      const out = await ProcessRunner.exec("getent", ["hosts", hostname]);
      const parts = out.trim().split(/\s+/);
      return parts[0] ?? null;
    } catch {
      return null;
    }
  }

  // ─── TLS certificates via certbot ─────────────────────────────────

  /** Issue a TLS certificate for a domain using certbot standalone mode. */
  async issueCert(domain: string, email: string): Promise<void> {
    log.info(`Issuing TLS cert for ${domain}`);
    await ProcessRunner.exec("certbot", [
      "certonly", "--standalone",
      "--non-interactive", "--agree-tos",
      "-m", email,
      "-d", domain,
    ], { stream: true });
    log.info(`TLS cert issued: ${domain}`);
  }

  /** Renew all certificates due for renewal. */
  async renewCerts(): Promise<string> {
    const out = await ProcessRunner.exec("certbot", ["renew", "--non-interactive"]);
    log.info(`certbot renew: ${out.slice(0, 200)}`);
    return out;
  }

  /** Return the cert and key paths for a domain (expected certbot layout). */
  certPaths(domain: string): { cert: string; key: string; chain: string } {
    const base = `/etc/letsencrypt/live/${domain}`;
    return {
      cert:  `${base}/fullchain.pem`,
      key:   `${base}/privkey.pem`,
      chain: `${base}/chain.pem`,
    };
  }

  // ─── GhostBrain API helpers ──────────────────────────────────────

  private async apiBrainAddRecord(record: DnsRecord): Promise<boolean> {
    try {
      const resp = await fetch(`${this.apiBase}/dns/add`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(record),
        signal:  AbortSignal.timeout(5_000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  private async apiBrainRemoveRecord(name: string): Promise<boolean> {
    try {
      const resp = await fetch(`${this.apiBase}/dns/remove`, {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name }),
        signal:  AbortSignal.timeout(5_000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  // ─── /etc/hosts fallback ──────────────────────────────────────────

  private async hostsAddRecord(record: DnsRecord): Promise<void> {
    const line = `${record.ip}\t${record.name}\t# ghost-infra`;
    const content = await fs.readFile(this.hostsFile, "utf-8");
    if (content.includes(`\t${record.name}\t`)) {
      // Replace existing entry
      const updated = content
        .split(os.EOL)
        .map((l) => l.includes(`\t${record.name}\t`) ? line : l)
        .join(os.EOL);
      await fs.writeFile(this.hostsFile, updated, "utf-8");
    } else {
      await fs.appendFile(this.hostsFile, `${os.EOL}${line}${os.EOL}`, "utf-8");
    }
    log.info(`/etc/hosts updated: ${record.name} → ${record.ip}`);
  }

  private async hostsRemoveRecord(name: string): Promise<void> {
    const content = await fs.readFile(this.hostsFile, "utf-8");
    const updated = content
      .split(os.EOL)
      .filter((l) => !l.includes(`\t${name}\t`))
      .join(os.EOL);
    await fs.writeFile(this.hostsFile, updated, "utf-8");
  }
}
