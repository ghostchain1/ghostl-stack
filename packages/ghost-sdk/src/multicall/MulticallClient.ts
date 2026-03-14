/**
 * MulticallClient — batch multiple read-only calls in a single RPC round-trip
 * using the Multicall3 contract (deployed at the canonical address on most networks).
 *
 * Multicall3: https://github.com/mds1/multicall
 * Address (deterministic):  0xcA11bde05977b3631167028862bE2a173976CA11
 */

import type { HttpProvider } from "../providers/HttpProvider.js";

export const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

// aggregate3 ABI: (Call3[] calls) returns (Result[] returnData)
// struct Call3 { address target; bool allowFailure; bytes callData; }
// struct Result { bool success; bytes returnData; }
const AGGREGATE3_SELECTOR = "82ad56cb"; // keccak256("aggregate3((address,bool,bytes)[])")[0:4]
const AGGREGATE3_VALUE_SELECTOR = "174dea71"; // aggregate3Value variant

export interface MulticallCall {
  target: `0x${string}`;
  callData: `0x${string}`;
  /** If true, a failed call doesn't revert the entire batch (default: true) */
  allowFailure?: boolean;
}

export interface MulticallResult {
  success: boolean;
  returnData: `0x${string}`;
}

export interface MulticallOptions {
  /** Override the Multicall3 contract address */
  multicallAddress?: `0x${string}`;
  /** Block tag (default: "latest") */
  blockTag?: string;
}

export class MulticallClient {
  private readonly provider: HttpProvider;
  private readonly multicallAddress: `0x${string}`;

  constructor(provider: HttpProvider, opts: MulticallOptions = {}) {
    this.provider = provider;
    this.multicallAddress = opts.multicallAddress ?? MULTICALL3_ADDRESS;
  }

  // ── Main entry point ─────────────────────────────────────────────────────

  async aggregate(
    calls: MulticallCall[],
    opts: MulticallOptions = {},
  ): Promise<MulticallResult[]> {
    const callAddress = opts.multicallAddress ?? this.multicallAddress;
    const block = opts.blockTag ?? "latest";
    const encoded = this._encodeAggregate3(calls);

    const raw = await this.provider.call(
      { to: callAddress, data: encoded },
      block as import("../native/types.js").GhostBlockTag,
    );

    return this._decodeAggregate3Results(raw, calls.length);
  }

  /**
   * Convenience: returns decoded return data for each call in order.
   * Failed calls return null when allowFailure=true.
   */
  async call<T = `0x${string}`>(
    calls: MulticallCall[],
    opts: MulticallOptions = {},
  ): Promise<Array<T | null>> {
    const results = await this.aggregate(calls, opts);
    return results.map((r) =>
      r.success ? (r.returnData as unknown as T) : null,
    );
  }

  // ── Encoding ─────────────────────────────────────────────────────────────

  private _encodeAggregate3(calls: MulticallCall[]): `0x${string}` {
    // aggregate3((address,bool,bytes)[]) — ABI manual encode
    // Head: selector (4) + offset to array (32) = 36 bytes for selector+offset
    // [offset (32)] + [arrayLen (32)] + [per-call tuples]

    const callCount = calls.length;

    // Each call tuple uses a head slot (offset to its data) + body
    // For each Call3: (address:32, bool:32, bytesOffset:32) + (bytesLen:32, bytesData:padded)
    const tupleHeadSize = 32 * 3; // address + bool + bytes_offset per call

    // First compute data offsets for each call's bytes field
    // The tuple head section comes first: callCount * tupleHeadSize bytes
    const tupleHeadsTotal = callCount * tupleHeadSize;

    // For each call accumulate bytes data
    const callDatas = calls.map((c) => {
      const hex = c.callData.startsWith("0x") ? c.callData.slice(2) : c.callData;
      return hex;
    });

    // Build each call's dynamic bytes portion
    // Offset is relative to start of the tuple array body
    let bodyOffset = tupleHeadsTotal;
    const tupleHeads: string[] = [];
    const tupleBody: string[] = [];

    for (let i = 0; i < callCount; i++) {
      const call = calls[i];
      const rawHex = callDatas[i];
      const byteLen = rawHex.length / 2;
      const paddedData = rawHex.padEnd(Math.ceil(rawHex.length / 64) * 64, "0");

      // offset for bytes field within the i-th tuple:
      // The tuple head is a struct so its bytes field is at bodyOffset
      const intraOffset = bodyOffset - i * tupleHeadSize;

      tupleHeads.push(
        call.target.slice(2).toLowerCase().padStart(64, "0") + // address (padded)
          ((call.allowFailure ?? true) ? 1 : 0).toString(16).padStart(64, "0") +
          intraOffset.toString(16).padStart(64, "0"), // offset to bytes
      );

      const bodyEntry =
        byteLen.toString(16).padStart(64, "0") + // bytes length
        (paddedData || ""); // bytes data (padded to 32-byte boundary)

      tupleBody.push(bodyEntry);
      bodyOffset += 32 + Math.ceil(byteLen / 32) * 32; // len slot + padded data
    }

    // Outer ABI encoding: aggregate3 takes (Call3[] calls)
    // Function params: (bytes)  — encoded as:
    //   offset to array (32) = 0x20
    //   array length (32)    = callCount
    //   [tuple heads] then [tuple bodies]

    const arrayOffset = "20".padStart(64, "0");
    const arrayLen = callCount.toString(16).padStart(64, "0");
    const inner = tupleHeads.join("") + tupleBody.join("");

    return `0x${AGGREGATE3_SELECTOR}${arrayOffset}${arrayLen}${inner}` as `0x${string}`;
  }

  private _decodeAggregate3Results(
    raw: `0x${string}`,
    count: number,
  ): MulticallResult[] {
    const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
    if (hex.length < 128) return Array(count).fill({ success: false, returnData: "0x" });

    // Result[] is ABI encoded:
    //   offset (32) + arrayLen (32) + [per-result tuples]
    // Each Result: (bool success, bytes returnData)
    let pos = 64; // skip outer offset (32) + arrayLen (32) — we trust count

    const results: MulticallResult[] = [];

    // Array elements are tuples with dynamic bytes so each has a head offset
    const headStart = pos;
    const resultOffsets: number[] = [];
    for (let i = 0; i < count; i++) {
      const offsetHex = hex.slice(pos, pos + 64);
      resultOffsets.push(parseInt(offsetHex, 16));
      pos += 64;
    }

    for (let i = 0; i < count; i++) {
      const tupleStart = headStart + resultOffsets[i] * 2; // convert byte offset to hex chars
      // wait — offsets in ABI are byte offsets from start of array element area
      // Let's re-read from headStart in bytes
      const byteStart = 64 + resultOffsets[i]; // 64 hex chars = 32 bytes (outer offset+len already consumed)
      const charStart = byteStart * 2;

      if (charStart + 128 > hex.length) {
        results.push({ success: false, returnData: "0x" });
        continue;
      }

      const successHex = hex.slice(charStart, charStart + 64);
      const success = parseInt(successHex, 16) !== 0;

      const dataOffsetHex = hex.slice(charStart + 64, charStart + 128);
      const dataOffset = parseInt(dataOffsetHex, 16); // offset from tuple start to bytes data

      const dataStart = charStart + dataOffset * 2;
      if (dataStart + 64 > hex.length) {
        results.push({ success, returnData: "0x" });
        continue;
      }

      const dataLen = parseInt(hex.slice(dataStart, dataStart + 64), 16);
      const dataHex = hex.slice(dataStart + 64, dataStart + 64 + dataLen * 2);
      results.push({ success, returnData: `0x${dataHex}` });
    }

    return results;
  }
}
