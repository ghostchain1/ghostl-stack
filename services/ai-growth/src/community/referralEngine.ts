/**
 * ReferralEngine — generates unique referral codes for users and
 * tracks on-chain referral activity.
 */

import * as crypto from "crypto";
import logger from "../utils/logger";

export interface ReferralCode {
  code:       string;
  wallet:     string;
  createdAt:  string;
  uses:       number;
  gstEarned:  number;
}

export interface ReferralEvent {
  code:       string;
  referrer:   string;
  newUser:    string;
  eventType:  "signup" | "trade" | "stake";
  gstAwarded: number;
  ts:         string;
}

const REWARDS: Record<ReferralEvent["eventType"], number> = {
  signup: 10,
  trade:  20,
  stake:  50,
};

const referralCodes: Map<string, ReferralCode> = new Map();
const events: ReferralEvent[] = [];

export function generateReferralCode(wallet: string): ReferralCode {
  const existing = [...referralCodes.values()].find(r => r.wallet === wallet);
  if (existing) return existing;

  const code: string = crypto
    .createHash("sha256")
    .update(`${wallet}-${Date.now()}`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();

  const record: ReferralCode = { code, wallet, createdAt: new Date().toISOString(), uses: 0, gstEarned: 0 };
  referralCodes.set(code, record);
  logger.info(`ReferralEngine: code generated for ${wallet.slice(0, 10)}…`);
  return record;
}

export function recordReferralEvent(code: string, newUser: string, eventType: ReferralEvent["eventType"]): ReferralEvent | null {
  const ref = referralCodes.get(code);
  if (!ref) {
    logger.warn(`ReferralEngine: unknown code ${code}`);
    return null;
  }

  const gstAwarded = REWARDS[eventType];
  ref.uses      += 1;
  ref.gstEarned += gstAwarded;

  const event: ReferralEvent = {
    code, referrer: ref.wallet, newUser, eventType, gstAwarded, ts: new Date().toISOString(),
  };

  events.unshift(event);
  if (events.length > 1000) events.pop();
  logger.info(`ReferralEngine: ${eventType} event → +${gstAwarded} GST to ${ref.wallet.slice(0, 10)}…`);
  return event;
}

export function getReferralStats() {
  const totals = [...referralCodes.values()].reduce(
    (acc, r) => ({ uses: acc.uses + r.uses, gstEarned: acc.gstEarned + r.gstEarned }),
    { uses: 0, gstEarned: 0 },
  );
  return { totalCodes: referralCodes.size, ...totals, recentEvents: events.slice(0, 20) };
}
