export function toHex(num: bigint | number): string {
  return "0x" + BigInt(num).toString(16);
}

export function fromHex(hex: string): bigint {
  return BigInt(hex.startsWith("0x") ? hex : "0x" + hex);
}

export function toHexPadded(num: bigint | number, bytes: number): string {
  return "0x" + BigInt(num).toString(16).padStart(bytes * 2, "0");
}

export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith("0x") ? hex.slice(2) : hex;
  const pairs = cleaned.match(/.{1,2}/g) ?? [];
  return new Uint8Array(pairs.map((b) => parseInt(b, 16)));
}

export function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
