export type GipStatus = {
  ok: boolean;
  enabled: boolean;
  note?: string;
};

// GIP integration point (feature-flagged). v1 returns disabled unless you wire real sources.
export function getGipStatus(enabledFlag: boolean): GipStatus {
  return enabledFlag
    ? { ok: true, enabled: true, note: 'GIP integration enabled (wire to on-chain sources in a future phase).' }
    : { ok: true, enabled: false, note: 'GIP integration disabled.' };
}

