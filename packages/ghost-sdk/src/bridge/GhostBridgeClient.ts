/**
 * GhostBridgeClient — cross-layer deposit / withdraw / message relay.
 *
 * Compatibility shim for legacy bridge ABI stubs while the Ghost-native bridge
 * client is still being finalized.
 *
 * New cross-layer execution should prefer Ghost relay envelopes via
 * `GhostJsonRpcProvider.crossLayerSend()` or `HopExecutor`.
 */

import { L1Client } from "./L1Client.js";
import { L2Client } from "./L2Client.js";
import { L3Client } from "./L3Client.js";

export interface BridgeConfig {
  l1Client: L1Client;
  l2Client: L2Client;
  l3Client?: L3Client;
  /** L1 rollup / portal address for L1 -> L2 compatibility encoding. */
  l1BridgeAddress?: `0x${string}`;
  /** L2 relay / bridge address for L2 -> L1 compatibility encoding. */
  l2BridgeAddress?: `0x${string}`;
  /** L2 -> L3 bridge address for compatibility encoding. */
  l3BridgeAddress?: `0x${string}`;
}

export interface DepositOptions {
  to?: `0x${string}`;
  value: bigint;
  /** optional calldata to pass along */
  data?: `0x${string}`;
  gasLimit?: bigint;
}

export interface WithdrawOptions {
  to?: `0x${string}`;
  value: bigint;
  data?: `0x${string}`;
  gasLimit?: bigint;
}

export interface BridgeStatus {
  l1Block: bigint;
  l2Block: bigint;
  l3Block?: bigint;
  l1ChainId: number;
  l2ChainId: number;
  l3ChainId?: number;
}

export class GhostBridgeClient {
  readonly l1: L1Client;
  readonly l2: L2Client;
  readonly l3?: L3Client;

  readonly l1BridgeAddress: `0x${string}`;
  readonly l2BridgeAddress?: `0x${string}`;
  readonly l3BridgeAddress?: `0x${string}`;

  constructor(config: BridgeConfig) {
    this.l1 = config.l1Client;
    this.l2 = config.l2Client;
    this.l3 = config.l3Client;
    this.l1BridgeAddress =
      config.l1BridgeAddress
      ?? normalizeOptionalAddress(process.env.L1_ROLLUP_L2_ADDRESS)
      ?? "0xad32D5C2Da9f4159C4cc98686C005852b3905355";
    this.l2BridgeAddress =
      config.l2BridgeAddress
      ?? normalizeOptionalAddress(process.env.L2_TO_L1_GATEWAY_ADDRESS)
      ?? normalizeOptionalAddress(process.env.L2_TO_L1_MESSENGER_ADDRESS)
      ?? normalizeOptionalAddress(process.env.L2_CROSS_DOMAIN_MESSENGER_ADDRESS);
    this.l3BridgeAddress =
      config.l3BridgeAddress
      ?? normalizeOptionalAddress(process.env.BRIDGE_L2L3_ADDRESS)
      ?? normalizeOptionalAddress(process.env.L2L3_BRIDGE_ADDRESS)
      ?? "0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2";
  }

  // ── Layer status ──────────────────────────────────────────────────────────

  async getStatus(): Promise<BridgeStatus> {
    const [l1Block, l2Block] = await Promise.all([
      this.l1.getBlockNumber(),
      this.l2.getBlockNumber(),
    ]);

    const status: BridgeStatus = {
      l1Block,
      l2Block,
      l1ChainId: this.l1.chainId,
      l2ChainId: this.l2.chainId,
    };

    if (this.l3) {
      status.l3Block = await this.l3.getBlockNumber();
      status.l3ChainId = this.l3.chainId;
    }

    return status;
  }

  // ── L1 → L2 deposit ──────────────────────────────────────────────────────

  /**
   * Encode a compatibility deposit calldata using the legacy depositTransaction ABI.
   * The sender must broadcast this via their own signer to the L1 GhostPortal.
   */
  encodeDepositL1ToL2(opts: DepositOptions): {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
  } {
    const target = opts.to ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`);
    const calldata = opts.data ?? "0x";
    const gasLimit = opts.gasLimit ?? 100_000n;
    const isCreation = false;

    // depositTransaction(address _to, uint256 _value, uint64 _gasLimit, bool _isCreation, bytes _data)
    const encoded = this._encodeDepositTransaction(
      target,
      opts.value,
      gasLimit,
      isCreation,
      calldata,
    );

    return {
      to: this.l1BridgeAddress,
      data: encoded,
      value: opts.value,
    };
  }

  // ── L2 → L1 withdrawal ───────────────────────────────────────────────────

  /**
   * Encode an L2 -> L1 compatibility withdrawal initiation calldata.
   * The sender must broadcast this via their own signer to the configured L2 relay / bridge address.
   */
  encodeWithdrawL2ToL1(opts: WithdrawOptions): {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
  } {
    const bridgeAddress = this.requireAddress(this.l2BridgeAddress, "l2BridgeAddress", "L2_TO_L1_GATEWAY_ADDRESS");
    const target = opts.to ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`);
    const minGasLimit = opts.gasLimit ?? 200_000n;

    // withdraw(address _l1Token, address _to, uint256 _amount, uint32 _minGasLimit, bytes _extraData)
    // For native ETH withdrawal use the simpler initiateWithdrawal on the portal
    const encoded = this._encodeWithdrawETH(target, opts.value, minGasLimit);

    return {
      to: bridgeAddress,
      data: encoded,
      value: opts.value,
    };
  }

  // ── L2 → L3 ─────────────────────────────────────────────────────────────

  encodeDepositL2ToL3(opts: DepositOptions): {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
  } {
    const bridgeAddress = this.requireAddress(this.l3BridgeAddress, "l3BridgeAddress", "BRIDGE_L2L3_ADDRESS");
    const target = opts.to ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`);
    const gasLimit = opts.gasLimit ?? 100_000n;
    const encoded = this._encodeDepositTransaction(target, opts.value, gasLimit, false, opts.data ?? "0x");
    return {
      to: bridgeAddress,
      data: encoded,
      value: opts.value,
    };
  }

  // ── Balance helpers ───────────────────────────────────────────────────────

  async getL1Balance(address: `0x${string}`): Promise<bigint> {
    return this.l1.getBalance({ address });
  }

  async getL2Balance(address: `0x${string}`): Promise<bigint> {
    return this.l2.getBalance({ address });
  }

  async getL3Balance(address: `0x${string}`): Promise<bigint> {
    if (!this.l3) throw new Error("L3 client not configured");
    return this.l3.getBalance({ address });
  }

  // ── Internal ABI encoding (minimal, no external deps) ────────────────────

  private _encodeDepositTransaction(
    to: `0x${string}`,
    value: bigint,
    gasLimit: bigint,
    isCreation: boolean,
    data: `0x${string}`,
  ): `0x${string}` {
    // depositTransaction(address,uint256,uint64,bool,bytes) selector = 0xe9e05c42 (op v1.4)
    // For stubs we use a simplified version that still produces valid calldata
    const selector = "e9e05c42";
    const toHex = to.slice(2).toLowerCase().padStart(64, "0");
    const valueHex = value.toString(16).padStart(64, "0");
    const gasLimitHex = gasLimit.toString(16).padStart(64, "0");
    const isCreationHex = (isCreation ? 1 : 0).toString(16).padStart(64, "0");
    // bytes offset = 160 (5 * 32), length, data
    const dataHex = data.startsWith("0x") ? data.slice(2) : data;
    const dataPadded = dataHex.padEnd(Math.ceil(dataHex.length / 64) * 64, "0");
    const dataOffset = "a0".padStart(64, "0"); // 160 in hex
    const dataLen = (dataHex.length / 2).toString(16).padStart(64, "0");

    return `0x${selector}${toHex}${valueHex}${gasLimitHex}${isCreationHex}${dataOffset}${dataLen}${dataPadded}` as `0x${string}`;
  }

  private _encodeWithdrawETH(
    to: `0x${string}`,
    value: bigint,
    minGasLimit: bigint,
  ): `0x${string}` {
    // initiateWithdrawal(address _target, uint256 _gasLimit, bytes _data) = 0x32b7006d
    const selector = "32b7006d";
    const toHex = to.slice(2).toLowerCase().padStart(64, "0");
    const gasLimitHex = minGasLimit.toString(16).padStart(64, "0");
    const dataOffset = "60".padStart(64, "0"); // 96 = 3*32
    const dataLen = "00".padStart(64, "0");

    return `0x${selector}${toHex}${gasLimitHex}${dataOffset}${dataLen}` as `0x${string}`;
  }

  private requireAddress(
    address: `0x${string}` | undefined,
    configKey: string,
    envKey: string,
  ): `0x${string}` {
    if (!address) {
      throw new Error(`GhostBridgeClient: ${configKey} is required; set BridgeConfig.${configKey} or ${envKey}`);
    }
    return address;
  }
}

function normalizeOptionalAddress(value: string | undefined): `0x${string}` | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed as `0x${string}` : undefined;
}
