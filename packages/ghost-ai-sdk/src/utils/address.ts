import { getAddress, isAddress, ZeroAddress } from "ethers";

/**
 * Safely checksum-encode an address string.
 * Returns null if the input is not a valid address.
 */
export function safeChecksumAddress(raw: string): string | null {
  try {
    return isAddress(raw) ? getAddress(raw) : null;
  } catch {
    return null;
  }
}

/** True if `addr` is the zero address (0x000…000). */
export function isZeroAddress(addr: string): boolean {
  try {
    return getAddress(addr) === ZeroAddress;
  } catch {
    return false;
  }
}
