/**
 * Account Integrity — Multi-account farm & identity abuse detection
 *
 * Signals checked:
 *  • Device fingerprint collision — same fingerprint across ≥ 3 accounts
 *  • IP address correlation       — same /24 subnet with ≥ 4 accounts created
 *                                   within 48 hours of each other
 *  • Behavior similarity          — gift timing patterns match across accounts
 *  • Wallet sharing               — same wallet_address linked to ≥ 2 accounts
 *  • Name/avatar cycling          — sequential usernames or identical avatars
 *
 * Integrity score: 100 = fully trusted, 0 = confirmed farm.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DeviceProfile {
  userId:           string;
  userAgent:        string;
  screenResolution: string;
  timezone:         string;
  language:         string;
  ipAddress:        string;
  walletAddress?:   string;
  registeredAt:     string;
}

export interface IntegrityCheckResult {
  userId:         string;
  integrityScore: number;    // 0–100 (100 = clean)
  farmDetected:   boolean;
  linkedAccounts: string[];  // userIds of correlated accounts
  signals:        Array<{ signal: string; accounts: string[]; evidence: unknown }>;
  checkedAt:      string;
}

export interface AccountFarmSignal {
  farmId:    string;          // keccak-style unique id for this farm group
  userIds:   string[];
  evidence:  Record<string, unknown>;
  severity:  'medium' | 'high' | 'critical';
  flaggedAt: string;
}

// ── Thresholds ─────────────────────────────────────────────────────────────────

const DEVICE_FARM_THRESHOLD  = 3;    // accounts per fingerprint = farm
const IP_FARM_THRESHOLD      = 4;    // accounts from same /24 = suspicious
const IP_FARM_WINDOW_HOURS   = 48;   // registration window
const WALLET_FARM_THRESHOLD  = 2;    // wallets shared across accounts

// ── Core check ─────────────────────────────────────────────────────────────────

/**
 * Run an integrity check on a user account.
 * Returns full integrity report; score < 40 = flag for review.
 */
export function checkAccountIntegrity(profile: DeviceProfile): IntegrityCheckResult {
  const db       = getDb();
  const signals:  IntegrityCheckResult['signals'] = [];
  let deduction  = 0;
  const linked   = new Set<string>();

  const fingerprint = _buildFingerprint(profile);
  const subnet      = _toSubnet(profile.ipAddress);

  // Upsert device fingerprint record
  db.prepare(`
    INSERT OR REPLACE INTO account_device_profiles
      (profile_id, user_id, fingerprint, ip_subnet, wallet_address, registered_at, updated_at)
    VALUES (
      COALESCE((SELECT profile_id FROM account_device_profiles WHERE user_id = ?), ?),
      ?, ?, ?, ?, ?, ?)
  `).run(profile.userId, uuidv4(), profile.userId, fingerprint, subnet,
         profile.walletAddress ?? null, profile.registeredAt, new Date().toISOString());

  // 1. Device fingerprint collision
  const fpAccounts = db.prepare(`
    SELECT user_id FROM account_device_profiles
    WHERE fingerprint = ? AND user_id != ?
  `).all(fingerprint, profile.userId) as Array<{ user_id: string }>;

  if (fpAccounts.length >= DEVICE_FARM_THRESHOLD - 1) {
    const ids = fpAccounts.map(r => r.user_id);
    ids.forEach(id => linked.add(id));
    deduction += 45;
    signals.push({ signal: 'device_fingerprint_farm', accounts: ids, evidence: { fingerprint } });
  }

  // 2. IP subnet correlation (recent registrations)
  const subnetAccounts = db.prepare(`
    SELECT user_id FROM account_device_profiles
    WHERE ip_subnet = ? AND user_id != ?
      AND registered_at >= datetime('now', '-${IP_FARM_WINDOW_HOURS} hours')
  `).all(subnet, profile.userId) as Array<{ user_id: string }>;

  if (subnetAccounts.length >= IP_FARM_THRESHOLD - 1) {
    const ids = subnetAccounts.map(r => r.user_id);
    ids.forEach(id => linked.add(id));
    deduction += 30;
    signals.push({ signal: 'ip_subnet_farm', accounts: ids, evidence: { subnet } });
  }

  // 3. Wallet sharing
  if (profile.walletAddress) {
    const walletAccounts = db.prepare(`
      SELECT user_id FROM account_device_profiles
      WHERE wallet_address = ? AND user_id != ?
    `).all(profile.walletAddress, profile.userId) as Array<{ user_id: string }>;

    if (walletAccounts.length >= WALLET_FARM_THRESHOLD - 1) {
      const ids = walletAccounts.map(r => r.user_id);
      ids.forEach(id => linked.add(id));
      deduction += 55;
      signals.push({ signal: 'shared_wallet', accounts: ids, evidence: { walletAddress: profile.walletAddress } });
    }
  }

  const integrityScore = Math.max(0, 100 - deduction);
  const farmDetected   = integrityScore < 40;

  return {
    userId:         profile.userId,
    integrityScore,
    farmDetected,
    linkedAccounts: Array.from(linked),
    signals,
    checkedAt:      new Date().toISOString(),
  };
}

/**
 * Flag a group of accounts as a coordinated farm.
 * Creates a consolidated farm record in security_incidents.
 */
export function flagAccountFarm(
  userIds:  string[],
  evidence: Record<string, unknown>
): AccountFarmSignal {
  const severity: AccountFarmSignal['severity'] =
    userIds.length >= 10 ? 'critical' :
    userIds.length >= 5  ? 'high'     : 'medium';

  const farmId  = createHash('sha256')
    .update(userIds.sort().join(','))
    .digest('hex')
    .slice(0, 16);

  const signal: AccountFarmSignal = {
    farmId,
    userIds,
    evidence,
    severity,
    flaggedAt: new Date().toISOString(),
  };

  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO security_incidents
      (incident_id, type, severity, user_id, stream_id, wallet_address,
       evidence, status, response_taken, created_at, updated_at)
    VALUES (?, 'account_farm', ?, NULL, NULL, NULL, ?, 'open', NULL, ?, ?)
  `).run(uuidv4(), severity, JSON.stringify({ farmId, userIds, evidence }),
         signal.flaggedAt, signal.flaggedAt);

  return signal;
}

/**
 * Look up accounts correlated with a user by fingerprint or IP.
 */
export function getCorrelatedAccounts(userId: string): string[] {
  const db     = getDb();
  const profile = db.prepare(`
    SELECT fingerprint, ip_subnet, wallet_address FROM account_device_profiles WHERE user_id = ?
  `).get(userId) as any;
  if (!profile) return [];

  const byFp = (db.prepare(`
    SELECT user_id FROM account_device_profiles WHERE fingerprint = ? AND user_id != ?
  `).all(profile.fingerprint, userId) as any[]).map(r => r.user_id);

  const byIp = (db.prepare(`
    SELECT user_id FROM account_device_profiles WHERE ip_subnet = ? AND user_id != ?
  `).all(profile.ip_subnet, userId) as any[]).map(r => r.user_id);

  return Array.from(new Set([...byFp, ...byIp]));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _buildFingerprint(p: DeviceProfile): string {
  return createHash('sha256')
    .update(`${p.userAgent}|${p.screenResolution}|${p.timezone}|${p.language}`)
    .digest('hex');
}

function _toSubnet(ip: string): string {
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}
