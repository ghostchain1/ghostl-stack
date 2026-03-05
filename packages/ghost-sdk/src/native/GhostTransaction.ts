import type { GhostAddress, GhostTxRequest, Hex } from "./types.js";
import { GhostValidationError } from "../errors/GhostErrors.js";
import { rlpEncode } from "./rlp.js";
import { bytesToHex, hexToBytes } from "./bytes.js";
import { add0x, strip0x } from "./hex.js";

function toBuf(hex: Hex | undefined): Uint8Array {
  if (!hex || hex === "0x") return new Uint8Array([]);
  return hexToBytes(hex);
}

function biToBuf(v: bigint | undefined): Uint8Array {
  if (v === undefined || v === 0n) return new Uint8Array([]);
  let h = v.toString(16);
  if (h.length % 2) h = `0${h}`;
  return hexToBytes(add0x(h));
}

function numToBuf(v: number | undefined): Uint8Array {
  return v === undefined ? new Uint8Array([]) : biToBuf(BigInt(v));
}

function addrToBuf(a: GhostAddress | undefined): Uint8Array {
  if (!a) return new Uint8Array([]);
  const s = strip0x(a);
  if (s.length !== 40) throw new GhostValidationError("Invalid address length");
  return hexToBytes(add0x(s));
}

type Eip1559Required = Required<
  Pick<GhostTxRequest, "chainId" | "nonce" | "gasLimit" | "maxFeePerGas" | "maxPriorityFeePerGas">
> &
  GhostTxRequest;

/** EIP-1559 (type 0x02) transaction serializer — pure TypeScript, no ethers. */
export class GhostTransaction {
  static assertEip1559Ready(tx: GhostTxRequest): asserts tx is Eip1559Required {
    if (tx.chainId === undefined) throw new GhostValidationError("chainId required");
    if (tx.nonce === undefined) throw new GhostValidationError("nonce required");
    if (tx.gasLimit === undefined) throw new GhostValidationError("gasLimit required");
    if (tx.maxFeePerGas === undefined) throw new GhostValidationError("maxFeePerGas required");
    if (tx.maxPriorityFeePerGas === undefined) throw new GhostValidationError("maxPriorityFeePerGas required");
  }

  static serializeUnsigned(tx: Eip1559Required): Uint8Array {
    const accessList = (tx.accessList ?? []).map((i) => [
      addrToBuf(i.address),
      i.storageKeys.map((k) => toBuf(k)),
    ]);
    const rlp = rlpEncode([
      biToBuf(BigInt(tx.chainId)),
      numToBuf(tx.nonce),
      biToBuf(tx.maxPriorityFeePerGas),
      biToBuf(tx.maxFeePerGas),
      biToBuf(tx.gasLimit),
      addrToBuf(tx.to),
      biToBuf(tx.value ?? 0n),
      toBuf(tx.data ?? ("0x" as Hex)),
      accessList,
    ]);
    return Uint8Array.from([0x02, ...rlp]);
  }

  static serializeSigned(
    tx: Eip1559Required,
    sig: { yParity: 0 | 1; r: Uint8Array; s: Uint8Array }
  ): Hex {
    const accessList = (tx.accessList ?? []).map((i) => [
      addrToBuf(i.address),
      i.storageKeys.map((k) => toBuf(k)),
    ]);
    const rlp = rlpEncode([
      biToBuf(BigInt(tx.chainId)),
      numToBuf(tx.nonce),
      biToBuf(tx.maxPriorityFeePerGas),
      biToBuf(tx.maxFeePerGas),
      biToBuf(tx.gasLimit),
      addrToBuf(tx.to),
      biToBuf(tx.value ?? 0n),
      toBuf(tx.data ?? ("0x" as Hex)),
      accessList,
      biToBuf(BigInt(sig.yParity)),
      sig.r,
      sig.s,
    ]);
    return bytesToHex(Uint8Array.from([0x02, ...rlp]));
  }
}
