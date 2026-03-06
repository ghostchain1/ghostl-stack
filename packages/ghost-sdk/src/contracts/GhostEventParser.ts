/**
 * GhostEventParser — parse smart contract event logs into structured objects.
 *
 * Usage:
 *   const parser = new GhostEventParser(abi)
 *   const events = parser.parseLog(log)
 *   const transfers = parser.parseLogs(logs, "Transfer")
 */

import { GhostInterface } from "./GhostInterface.js";
import type { AbiFragment, AbiEventFragment } from "./GhostInterface.js";
import { add0x } from "../native/hex.js";
import { keccak256Utf8 } from "../native/keccak.js";
import type { GhostTxReceipt, Hex } from "../native/types.js";

export type ParsedEvent = {
  name: string;
  signature: string;
  args: Record<string, unknown>;
  raw: GhostTxReceipt["logs"][number];
};

export class GhostEventParser {
  private readonly iface: GhostInterface;
  private readonly topicMap: Map<Hex, AbiEventFragment>;

  constructor(private readonly abi: AbiFragment[]) {
    this.iface = new GhostInterface(abi);
    this.topicMap = new Map();

    for (const fragment of abi) {
      if (fragment.type !== "event") continue;
      const ev = fragment as AbiEventFragment;
      const sig = `${ev.name}(${ev.inputs.map(i => i.type).join(",")})`;
      const topic = add0x(keccak256Utf8(sig).replace(/^0x/, "")) as Hex;
      this.topicMap.set(topic, ev);
    }
  }

  /** Parse a single log entry. Returns null if not recognized. */
  parseLog(log: GhostTxReceipt["logs"][number]): ParsedEvent | null {
    const topic0 = log.topics[0];
    if (!topic0) return null;

    const ev = this.topicMap.get(topic0);
    if (!ev) return null;

    const sig = `${ev.name}(${ev.inputs.map(i => i.type).join(",")})`;

    try {
      const args = this.iface.decodeEventLog(ev.name, log.topics, log.data);
      return { name: ev.name, signature: sig, args, raw: log };
    } catch {
      return null;
    }
  }

  /** Parse all logs in a receipt, optionally filtered by event name. */
  parseLogs(logs: GhostTxReceipt["logs"], eventName?: string): ParsedEvent[] {
    const parsed = logs.flatMap(log => {
      const result = this.parseLog(log);
      return result ? [result] : [];
    });
    return eventName ? parsed.filter(e => e.name === eventName) : parsed;
  }
}
