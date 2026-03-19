import { afterEach, describe, expect, it, vi } from "vitest";
import type { GhostProvider, GhostSigner } from "@ghostchain/ghost-sdk-core";
import { HopExecutor, buildHopExecutorFromEnv } from "../src/routing/HopExecutor.js";

function decodeRelayCall(data: string): { target: string; minGasLimit: bigint; message: string } {
  const body = data.slice(10);
  const targetWord = body.slice(0, 64);
  const offsetWord = body.slice(64, 128);
  const gasWord = body.slice(128, 192);
  const offset = Number(BigInt(`0x${offsetWord}`)) * 2;
  const messageLength = Number(BigInt(`0x${body.slice(offset, offset + 64)}`));
  const messageStart = offset + 64;
  const messageEnd = messageStart + (messageLength * 2);

  return {
    target: `0x${targetWord.slice(24)}`.toLowerCase(),
    minGasLimit: BigInt(`0x${gasWord}`),
    message: `0x${body.slice(messageStart, messageEnd)}`.toLowerCase(),
  };
}

function makeSigner(hash = "0xabc123"): GhostSigner {
  return {
    send: vi.fn(async () => hash),
  } as unknown as GhostSigner;
}

function makeProviders(): { L1: GhostProvider; L2: GhostProvider; L3: GhostProvider } {
  return {
    L1: {} as GhostProvider,
    L2: {} as GhostProvider,
    L3: {} as GhostProvider,
  };
}

describe("HopExecutor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends same-layer transactions directly without relay wrapping", async () => {
    const signer = makeSigner("0xsame");
    const executor = new HopExecutor();

    const result = await executor.executeWithHops({
      plan: {
        executeOn: "L2",
        path: ["L2"],
        requiresMessaging: false,
      },
      tx: {
        to: "0x1111111111111111111111111111111111111111",
        data: "0xdeadbeef",
        gasLimit: 500000n,
      },
      signer,
      providers: makeProviders(),
    });

    expect(result).toEqual({ executeTxHash: "0xsame", hopTxHashes: [] });
    expect(signer.send).toHaveBeenCalledTimes(1);
    expect(signer.send).toHaveBeenCalledWith({
      to: "0x1111111111111111111111111111111111111111",
      data: "0xdeadbeef",
      value: 0n,
      gasLimit: 500000n,
      maxFeePerGas: undefined,
      maxPriorityFeePerGas: undefined,
      nonce: undefined,
    });
  });

  it("submits one nested relay envelope for L3 to L1 routes", async () => {
    const signer = makeSigner("0xrelay");
    const executor = new HopExecutor({
      L3ToL2Gateway: {
        address: "0x3333333333333333333333333333333333333333",
        abi: [{
          type: "function",
          name: "sendMessage",
          stateMutability: "nonpayable",
          inputs: [
            { name: "_target", type: "address" },
            { name: "_message", type: "bytes" },
            { name: "_minGasLimit", type: "uint32" },
          ],
          outputs: [],
        }],
      },
      L2ToL1Gateway: {
        address: "0x2222222222222222222222222222222222222222",
        abi: [{
          type: "function",
          name: "sendMessage",
          stateMutability: "nonpayable",
          inputs: [
            { name: "_target", type: "address" },
            { name: "_message", type: "bytes" },
            { name: "_minGasLimit", type: "uint32" },
          ],
          outputs: [],
        }],
      },
    });

    const result = await executor.executeWithHops({
      plan: {
        executeOn: "L3",
        path: ["L3", "L2", "L1"],
        requiresMessaging: true,
      },
      tx: {
        to: "0x1111111111111111111111111111111111111111",
        data: "0xdeadbeef",
      },
      signer,
      providers: makeProviders(),
      hopGasLimits: {
        "L3-L2": 210000n,
        "L2-L1": 310000n,
      },
    });

    expect(result).toEqual({ executeTxHash: "0xrelay", hopTxHashes: [] });
    expect(signer.send).toHaveBeenCalledTimes(1);

    const sentTx = vi.mocked(signer.send).mock.calls[0]?.[0];
    expect(sentTx?.to).toBe("0x3333333333333333333333333333333333333333");
    expect(sentTx?.value).toBe(0n);
    expect(sentTx?.gasLimit).toBe(210000n);

    const outer = decodeRelayCall(String(sentTx?.data));
    expect(outer.target).toBe("0x2222222222222222222222222222222222222222");
    expect(outer.minGasLimit).toBe(210000n);

    const inner = decodeRelayCall(outer.message);
    expect(inner.target).toBe("0x1111111111111111111111111111111111111111");
    expect(inner.minGasLimit).toBe(310000n);
    expect(inner.message).toBe("0xdeadbeef");
  });

  it("fails fast when a required relay gateway is missing", async () => {
    const signer = makeSigner();
    const executor = new HopExecutor({
      L3ToL2Gateway: {
        address: "0x3333333333333333333333333333333333333333",
        abi: [{
          type: "function",
          name: "sendMessage",
          stateMutability: "nonpayable",
          inputs: [
            { name: "_target", type: "address" },
            { name: "_message", type: "bytes" },
            { name: "_minGasLimit", type: "uint32" },
          ],
          outputs: [],
        }],
      },
    });

    await expect(() => executor.executeWithHops({
      plan: {
        executeOn: "L3",
        path: ["L3", "L2", "L1"],
        requiresMessaging: true,
      },
      tx: {
        to: "0x1111111111111111111111111111111111111111",
        data: "0xdeadbeef",
      },
      signer,
      providers: makeProviders(),
    })).rejects.toThrow(/missing relay gateway for L2 -> L1/);
  });

  it("accepts existing cross-domain messenger env names as gateway aliases", async () => {
    vi.stubEnv("L3_CROSS_DOMAIN_MESSENGER_ADDRESS", "0x3333333333333333333333333333333333333333");
    vi.stubEnv("L2_CROSS_DOMAIN_MESSENGER_ADDRESS", "0x2222222222222222222222222222222222222222");
    vi.stubEnv("HOP_EXECUTOR_RELAY_GAS_LIMIT", "250000");

    const signer = makeSigner("0xenvrelay");
    const executor = buildHopExecutorFromEnv();

    const result = await executor.executeWithHops({
      plan: {
        executeOn: "L3",
        path: ["L3", "L2", "L1"],
        requiresMessaging: true,
      },
      tx: {
        to: "0x1111111111111111111111111111111111111111",
        data: "0xdeadbeef",
      },
      signer,
      providers: makeProviders(),
    });

    expect(result).toEqual({ executeTxHash: "0xenvrelay", hopTxHashes: [] });

    const sentTx = vi.mocked(signer.send).mock.calls[0]?.[0];
    expect(sentTx?.to).toBe("0x3333333333333333333333333333333333333333");

    const outer = decodeRelayCall(String(sentTx?.data));
    expect(outer.target).toBe("0x2222222222222222222222222222222222222222");
    expect(outer.minGasLimit).toBe(250000n);
  });
});
