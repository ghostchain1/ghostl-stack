// SIN configuration

export const SIN_PORT           = Number(process.env['SIN_PORT']     ?? 7928);
export const CYCLE_INTERVAL_MS  = Number(process.env['SIN_CYCLE_MS'] ?? 120_000);
export const DRY_RUN            = process.env['SIN_DRY_RUN'] === '1';
export const SIGNING_RELAY_URL  = process.env['SIGNING_RELAY_URL']    ?? 'http://localhost:7910';
export const API_BASE           = process.env['GHOSTSTACK_API_BASE']   ?? 'http://localhost:3000';

// GST targets (all in percent)
export const GST_TARGET_INFLATION_PCT = 2.0;   // 2% annual inflation target
export const GST_BURN_FLOOR_PCT       = 0.5;   // minimum burn rate
export const GST_ADJUSTMENT_CAP_PCT   = 1.0;   // max single-cycle adjustment

// Treasury allocation targets (must sum to 100)
export const TREASURY_TARGETS: Record<string, number> = {
  'ecosystem-grants':  30,
  'validator-rewards': 25,
  'infrastructure':    20,
  'security-reserve':  15,
  'r&d':               10,
};

// Governance quorums per proposal risk level
export const QUORUM: Record<string, number> = {
  low:    0.51,
  medium: 0.67,
  high:   0.80,
};

// Max proposals per cycle per category
export const MAX_PROPOSALS_PER_CYCLE = 3;
