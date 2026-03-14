import { keccak256 } from "../crypto/keccak";

export function isAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export function checksumAddress(address: string): string {
  const addr = address.toLowerCase().replace("0x", "");
  const hash = Buffer.from(keccak256(new TextEncoder().encode(addr))).toString("hex");
  let result = "0x";
  for (let i = 0; i < addr.length; i++) {
    result += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
  }
  return result;
}

export function isChecksumAddress(addr: string): boolean {
  return isAddress(addr) && addr === checksumAddress(addr);
}

export function zeroAddress(): string {
  return "0x" + "0".repeat(40);
}
