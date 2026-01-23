export const toBigInt = (value?: string | number | bigint | null): bigint | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  const trimmed = value.toString();
  if (!trimmed) return null;
  if (trimmed.startsWith('0x')) return BigInt(trimmed);
  return BigInt(trimmed);
};

export const toNumber = (value: bigint | null): number | null => {
  if (value === null) return null;
  return Number(value);
};

export const toIsoTimeFromSeconds = (value: bigint | null): string | null => {
  if (value === null) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
};
