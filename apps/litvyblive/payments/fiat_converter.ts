/**
 * Fiat → GST Conversion Engine
 *
 * Converts USD (and EUR/GBP/JPY) amounts into GST units using a configurable
 * exchange rate.  In production this rate is sourced from GhostBrain's oracle
 * layer — never from Chainlink or any external feed.
 *
 * Canonical rate: 1 GST = $0.10 USD  →  $1 = 10 GST  →  $10 = 100 GST
 *
 * All output is in GST wei (1 GST = 1e18 wei) for on-chain settlement.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FiatCurrency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD';

export interface FiatRate {
  currency:     FiatCurrency;
  usdEquivalent: number;  // 1 unit of this currency in USD
}

export interface ConversionResult {
  fiatAmount:   number;
  fiatCurrency: FiatCurrency;
  usdAmount:    number;
  gstAmount:    number;      // human-readable GST (e.g. 100.0)
  gstWei:       bigint;      // GST in wei for on-chain calls
  rateUsed:     number;      // USD per GST at time of conversion
  convertedAt:  string;
}

// ── Rate registry ─────────────────────────────────────────────────────────────

// Approximate mid-market rates — updated by GhostBrain oracle in production.
export const FIAT_RATES: Record<FiatCurrency, number> = {
  USD: 1.00,
  EUR: 1.09,
  GBP: 1.27,
  JPY: 0.0067,
  CAD: 0.74,
  AUD: 0.65,
};

// GST price in USD — injected by GhostBrain oracle, defaults to $0.10
let _gstPriceUSD = 0.10;

/**
 * Override the GST/USD rate (called by GhostBrain oracle poller).
 * Must be > 0; silently rejected otherwise.
 */
export function setGSTPrice(usdPerGST: number): void {
  if (usdPerGST > 0) _gstPriceUSD = usdPerGST;
}

export function getGSTPrice(): number {
  return _gstPriceUSD;
}

// ── Conversion fee (platform take) ───────────────────────────────────────────

/** 2 % platform conversion fee — deducted before GST is issued. */
const PLATFORM_FEE_PCT = 0.02;

// ── Core conversion ───────────────────────────────────────────────────────────

/**
 * Convert a fiat amount into GST.
 *
 * @param amount   Payment amount in the given currency.
 * @param currency Fiat currency code (default: USD).
 * @returns        ConversionResult with human-readable and wei amounts.
 */
export function convertFiatToGST(
  amount:   number,
  currency: FiatCurrency = 'USD'
): ConversionResult {
  if (amount <= 0) throw new Error('Payment amount must be positive');

  const usdRate   = FIAT_RATES[currency] ?? 1;
  const usdAmount = amount * usdRate;

  // Deduct platform fee
  const usdNet    = usdAmount * (1 - PLATFORM_FEE_PCT);

  // Convert to GST
  const gstAmount = usdNet / _gstPriceUSD;
  const gstWei    = BigInt(Math.floor(gstAmount * 1e18));

  return {
    fiatAmount:   amount,
    fiatCurrency: currency,
    usdAmount,
    gstAmount,
    gstWei,
    rateUsed:     _gstPriceUSD,
    convertedAt:  new Date().toISOString(),
  };
}

/**
 * Reverse lookup: how much fiat does a given GST amount cost?
 */
export function gstToFiat(gstAmount: number, currency: FiatCurrency = 'USD'): number {
  const usdRate = FIAT_RATES[currency] ?? 1;
  const usdGross = (gstAmount * _gstPriceUSD) / (1 - PLATFORM_FEE_PCT);
  return usdGross / usdRate;
}

/**
 * Round a USD cent amount to a user-friendly GST display string.
 * e.g. 100.0034782 → "100.00 GST"
 */
export function formatGST(gstAmount: number): string {
  return `${gstAmount.toFixed(2)} GST`;
}

/** Minimum purchase: $1.00 USD equivalent. */
export function minimumFiatAmount(currency: FiatCurrency): number {
  const usdRate = FIAT_RATES[currency] ?? 1;
  return parseFloat((1.00 / usdRate).toFixed(2));
}
