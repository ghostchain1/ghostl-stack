import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GhostAgentBase } from './GhostAgentBase.js';
import type { SwarmEvent } from '../types.js';

const execFileAsync = promisify(execFile);

/** IPv4 or IPv6 address pattern. */
const SAFE_IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const SAFE_IPV6 = /^[0-9a-fA-F:]{2,39}$/;

function isValidIp(ip: string): boolean {
  if (SAFE_IPV4.test(ip)) {
    return ip.split('.').every(oct => Number(oct) <= 255);
  }
  return SAFE_IPV6.test(ip);
}

/**
 * GhostSecurityAgent — blocks attacking IP addresses using ufw.
 *
 * Security: the IP address is validated as a well-formed IPv4 or IPv6 address
 * before being passed to execFile. Shell meta-characters are impossible because
 * no shell is involved.
 */
export class GhostSecurityAgent extends GhostAgentBase {
  private readonly blocked = new Set<string>();

  constructor() {
    super('GhostSecurityAgent');
  }

  process(event: SwarmEvent): void {
    if (!event.attack) return;

    const ip = event.ip as string | undefined;
    if (!ip) {
      this.log('warn', 'attack event missing ip field');
      return;
    }

    if (!isValidIp(ip)) {
      this.log('error', 'Rejected malformed IP in attack event', { ip });
      return;
    }

    if (this.blocked.has(ip)) {
      this.log('info', 'IP already blocked', { ip });
      return;
    }

    this.blocked.add(ip);
    this.log('warn', `Blocking IP: ${ip}`);

    execFileAsync('ufw', ['deny', 'from', ip, 'to', 'any'])
      .then(() => this.log('info', 'ufw rule added', { ip }))
      .catch(err => this.log('error', 'ufw failed', { ip, err: String(err) }));
  }

  blockedIps(): string[] {
    return [...this.blocked];
  }
}
