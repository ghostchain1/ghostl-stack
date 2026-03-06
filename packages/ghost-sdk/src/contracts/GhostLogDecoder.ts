/**
 * GhostLogDecoder — decode raw eth_getLogs entries using an ABI.
 *
 * Usage:
 *   const decoder = new GhostLogDecoder(abi)
 *   const logs = await provider.getLogs({ address, fromBlock: "0x0", toBlock: "latest" })
 *   const decoded = decoder.decode(logs)
 */

import { GhostEventParser, type ParsedEvent } from "./GhostEventParser.js";
import type { AbiFragment } from "./GhostInterface.js";
import type { GhostTxReceipt } from "../native/types.js";

export type DecodedLog = ParsedEvent & {
  blockNumber: bigint;
  transactionHash: string;
  logIndex: number;
};

export class GhostLogDecoder {
  private readonly parser: GhostEventParser;

  constructor(abi: AbiFragment[]) {
    this.parser = new GhostEventParser(abi);
  }

  /** Decode an array of raw logs from eth_getLogs. */
  decode(logs: GhostTxReceipt["logs"]): DecodedLog[] {
    return logs.flatMap(log => {
      const parsed = this.parser.parseLog(log);
      if (!parsed) return [];
      return [{
        ...parsed,
        blockNumber: BigInt(parseInt(log.blockNumber, 16)),
        transactionHash: log.transactionHash,
        logIndex: parseInt(log.logIndex, 16),
      }];
    });
  }

  /** Filter logs by event name after decoding. */
  decodeByEvent(logs: GhostTxReceipt["logs"], eventName: string): DecodedLog[] {
    return this.decode(logs).filter(l => l.name === eventName);
  }

  /** Decode a single log. Returns null if not in ABI. */
  decodeOne(log: GhostTxReceipt["logs"][number]): DecodedLog | null {
    const parsed = this.parser.parseLog(log);
    if (!parsed) return null;
    return {
      ...parsed,
      blockNumber: BigInt(parseInt(log.blockNumber, 16)),
      transactionHash: log.transactionHash,
      logIndex: parseInt(log.logIndex, 16),
    };
  }
}
