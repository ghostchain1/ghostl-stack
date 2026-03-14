// ─────────────────────────────────────────────────────────────────────────────
// GhostEventDecoder – Decode on-chain event logs using ABI definitions
// ─────────────────────────────────────────────────────────────────────────────
import { GhostAbiCoder } from "./GhostAbiCoder";
import { GhostABIError } from "../errors";
import type { GhostABIFragment, GhostLog } from "../types";

export interface DecodedEvent {
  name: string;
  signature: string;
  args: Record<string, unknown>;
  log: GhostLog;
}

export class GhostEventDecoder {
  private coder = new GhostAbiCoder();
  private eventMap = new Map<string, GhostABIFragment>();

  constructor(abi: GhostABIFragment[]) {
    for (const frag of abi) {
      if (frag.type === "event") {
        const topic = this.coder.encodeEventTopic(frag);
        this.eventMap.set(topic, frag);
      }
    }
  }

  decode(log: GhostLog): DecodedEvent {
    const topic0 = log.topics[0];
    const frag = this.eventMap.get(topic0);
    if (!frag) {
      throw new GhostABIError(`Unknown event topic: ${topic0}`);
    }

    const inputs = frag.inputs ?? [];
    const indexed = inputs.filter((i) => i.indexed);
    const nonIndexed = inputs.filter((i) => !i.indexed);

    const args: Record<string, unknown> = {};
    let topicIdx = 1;
    for (const input of indexed) {
      args[input.name] = this.decodeWord(log.topics[topicIdx++], input.type);
    }

    const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
    let offset = 0;
    for (const input of nonIndexed) {
      const word = data.slice(offset, offset + 64);
      args[input.name] = this.decodeWord(word, input.type);
      offset += 64;
    }

    const sig = `${frag.name}(${inputs.map((i) => i.type).join(",")})`;
    return { name: frag.name!, signature: sig, args, log };
  }

  private decodeWord(hex: string, type: string): unknown {
    const cleaned = hex.replace("0x", "");
    if (type.startsWith("uint") || type.startsWith("int")) return BigInt("0x" + cleaned);
    if (type === "address") return "0x" + cleaned.slice(24);
    if (type === "bool") return cleaned.slice(63) === "1";
    if (type === "bytes32") return "0x" + cleaned;
    return "0x" + cleaned;
  }
}
