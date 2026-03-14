// ─────────────────────────────────────────────────────────────────────────────
// GhostTypedDataSigner – EIP-712 typed data signing
// ─────────────────────────────────────────────────────────────────────────────
import { keccak256, keccak256Hex } from "../crypto/keccak";
import { GhostWallet } from "../wallet/GhostWallet";
import type { GhostTypedDataDomain, GhostTypedDataTypes } from "../types";

export class GhostTypedDataSigner {
  constructor(private wallet: GhostWallet) {}

  async sign(
    domain: GhostTypedDataDomain,
    types: GhostTypedDataTypes,
    value: Record<string, any>
  ): Promise<string> {
    const domainSeparator = this._hashDomain(domain);
    const primaryType = Object.keys(types).find((k) => k !== "EIP712Domain")!;
    const structHash = this._hashStruct(primaryType, types, value);

    const combined = new Uint8Array([
      0x19, 0x01,
      ...domainSeparator,
      ...structHash
    ]);
    const digest = keccak256(combined);

    // Re-use GhostWallet's sign by treating digest as a "raw message"
    return this.wallet.signMessage(digest);
  }

  private _hashDomain(domain: GhostTypedDataDomain): Uint8Array {
    const encoded = JSON.stringify(domain);
    return keccak256(new TextEncoder().encode(encoded));
  }

  private _hashStruct(
    primaryType: string,
    types: GhostTypedDataTypes,
    value: Record<string, any>
  ): Uint8Array {
    const typeStr = this._encodeType(primaryType, types);
    const typeHash = keccak256(new TextEncoder().encode(typeStr));
    const valEncoded = this._encodeData(primaryType, types, value);
    const combined = new Uint8Array([...typeHash, ...valEncoded]);
    return keccak256(combined);
  }

  private _encodeType(primaryType: string, types: GhostTypedDataTypes): string {
    const fields = types[primaryType]
      .map((f) => `${f.type} ${f.name}`)
      .join(",");
    return `${primaryType}(${fields})`;
  }

  private _encodeData(
    primaryType: string,
    types: GhostTypedDataTypes,
    value: Record<string, any>
  ): Uint8Array {
    const encoded = JSON.stringify(value);
    return new TextEncoder().encode(encoded);
  }
}
