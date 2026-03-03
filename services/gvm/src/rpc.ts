// GVM — JSON-RPC handler
// Handles eth_* and gvm_* namespaced methods.

import type { GvmExecutionEngine } from "./vm.js";
import type { JsonRpcRequest, JsonRpcResponse, GvmCallRequest } from "./types.js";
import { GvmErrors } from "./types.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

type RpcResult = JsonRpcResponse<unknown>;

function ok(id: JsonRpcRequest["id"], result: unknown): RpcResult {
  return { jsonrpc: "2.0", id, result };
}

function err(id: JsonRpcRequest["id"], e: { code: number; message: string }, data?: unknown): RpcResult {
  return { jsonrpc: "2.0", id, error: { ...e, data } };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export async function handleRpc(
  req: JsonRpcRequest,
  engine: GvmExecutionEngine,
): Promise<RpcResult> {
  const { id, method, params = [] } = req;

  logger.debug({ method, id }, "rpc request");

  try {
    switch (method) {
      // ── Standard eth_* ──────────────────────────────────────────────────────

      case "eth_chainId":
        return ok(id, "0x" + config().GVM_CHAIN_ID.toString(16));

      case "eth_blockNumber":
        return ok(id, "0x" + engine.latestBlock.number.toString(16));

      case "net_version":
        return ok(id, String(config().GVM_CHAIN_ID));

      case "eth_getBalance": {
        const [address] = params as [string];
        const bal = await engine.getBalance(address);
        return ok(id, "0x" + bal.toString(16));
      }

      case "eth_getCode": {
        const [address] = params as [string];
        return ok(id, await engine.getCode(address));
      }

      case "eth_getTransactionCount": {
        const [address] = params as [string];
        const nonce = await engine.getNonce(address);
        return ok(id, "0x" + nonce.toString(16));
      }

      case "eth_call": {
        const [tx] = params as [GvmCallRequest];
        const result = await engine.call(tx);
        if (!result.success) {
          return err(id, GvmErrors.EXECUTION_FAILED, {
            revertReason: result.revertReason,
            returnData: result.returnData,
          });
        }
        return ok(id, result.returnData);
      }

      case "eth_estimateGas": {
        const [tx] = params as [GvmCallRequest];
        try {
          const gas = await engine.estimateGas(tx);
          return ok(id, "0x" + gas.toString(16));
        } catch (e: unknown) {
          return err(id, GvmErrors.EXECUTION_FAILED, String(e));
        }
      }

      case "eth_gasPrice":
        return ok(id, "0x" + config().GVM_BASE_FEE.toString(16));

      case "eth_getBlockByNumber": {
        const [tag] = params as [string | number];
        if (tag === "latest" || tag === "pending") {
          return ok(id, engine.latestBlock);
        }
        const n = typeof tag === "number" ? tag : parseInt(String(tag), 16);
        return ok(id, engine.getBlockByNumber(n) ?? null);
      }

      case "eth_getBlockByHash": {
        const [hash] = params as [string];
        return ok(id, engine.getBlockByHash(hash) ?? null);
      }

      // ── GVM-specific methods ─────────────────────────────────────────────────

      case "gvm_chainId":
        return ok(id, config().GVM_CHAIN_ID);

      case "gvm_status": {
        return ok(id, {
          status:          "healthy",
          chainId:         config().GVM_CHAIN_ID,
          latestBlock:     engine.latestBlock.number,
          latestStateRoot: engine.latestStateRoot.stateRoot,
          uptimeMs:        engine.uptimeMs,
        });
      }

      case "gvm_stateRoot": {
        const sr = engine.latestStateRoot;
        return ok(id, {
          blockNumber:   sr.blockNumber,
          blockHash:     sr.blockHash,
          stateRoot:     sr.stateRoot,
          timestamp:     sr.timestamp,
        });
      }

      case "gvm_execute": {
        // Full EVM execution — returns result + state root + logs
        const [tx] = params as [GvmCallRequest];
        const result = await engine.call(tx);
        const stateRoot = engine.latestStateRoot;
        return ok(id, { ...result, stateRoot });
      }

      case "gvm_sealBlock": {
        // Manually seal a block (useful for testing; in production this is automatic)
        const block = await engine.sealBlock();
        return ok(id, block);
      }

      case "gvm_setBalance": {
        // Dev-only fund account
        const [address, balanceHex] = params as [string, string];
        await engine.setBalance(address, BigInt(balanceHex));
        return ok(id, true);
      }

      // ── Routing law enforcement ──────────────────────────────────────────────

      case "gvm_submitToL1":
        // Direct L3→L1 submission is FORBIDDEN per the routing law.
        // Use the L2 bridge + GhostVirtualMachine.submitStateRoot() instead.
        if (config().ENFORCE_ROUTING_LAW) {
          logger.warn({ method }, "routing law violation: L3→L1 direct path blocked");
          return err(id, GvmErrors.ROUTING_VIOLATION);
        }
        return err(id, { code: -32601, message: "Method not found" });

      default:
        return err(id, GvmErrors.METHOD_NOT_FOUND);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ method, err: msg }, "rpc internal error");
    return err(id, GvmErrors.INTERNAL_ERROR, msg);
  }
}
