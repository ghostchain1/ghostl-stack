/**
 * ChainRelay – submits matched orders and placements to GhostXOrderBook on L2.
 *
 * The relay listens for "fill" events from the local matching engine and
 * calls `matchOrders` on-chain so the vault can settle funds atomically.
 *
 * For order placements the relay calls `placeLimitOrder` on-chain after
 * the engine has accepted the order.  The returned on-chain order ID is
 * stored back on the local order object.
 */
import { ghost, JsonRpcProvider, Wallet, Contract } from "@ghostchain/sdk";
import { Fill, LimitOrder } from "./types";

// Minimal ABI – only what the relay needs.
const ORDER_BOOK_ABI = [
  "function placeLimitOrder(address baseToken, address quoteToken, uint8 side, uint256 price, uint256 baseAmount) returns (uint256 orderId)",
  "function matchOrders(uint256 buyOrderId, uint256 sellOrderId) returns (uint256 fillId)",
  "function cancelOrder(uint256 orderId)",
  "event OrderPlaced(uint256 indexed orderId, address indexed trader, address baseToken, address quoteToken, uint8 side, uint256 price, uint256 baseAmount)",
  "event OrderFilled(uint256 indexed fillId, uint256 indexed buyOrderId, uint256 indexed sellOrderId, uint256 baseAmount, uint256 price)",
];

export class ChainRelay {
  private provider: JsonRpcProvider;
  private matcher: Wallet;
  private book: Contract;

  constructor(rpcUrl: string, matcherKey: string, bookAddress: string) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.matcher  = new Wallet(matcherKey, this.provider);
    this.book     = new Contract(bookAddress, ORDER_BOOK_ABI, this.matcher);
  }

  /** Called after the engine places an order – submit it on-chain. */
  async submitOrder(order: LimitOrder): Promise<bigint> {
    const side = order.side === "BUY" ? 0 : 1;
    const tx = await this.book.placeLimitOrder(
      order.baseToken,
      order.quoteToken,
      side,
      order.price,
      order.baseAmount,
    );
    const receipt = await tx.wait();

    // Parse OrderPlaced event for on-chain orderId.
    const iface = new ghost.Interface(ORDER_BOOK_ABI);
    for (const log of receipt.logs ?? []) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "OrderPlaced") {
          return parsed.args.orderId as bigint;
        }
      } catch { /* skip */ }
    }
    throw new Error("OrderPlaced event not found in receipt");
  }

  /** Called after local matching – settle on-chain. */
  async relayMatch(fill: Fill, buyOnChainId: bigint, sellOnChainId: bigint): Promise<bigint> {
    const tx = await this.book.matchOrders(buyOnChainId, sellOnChainId);
    const receipt = await tx.wait();

    const iface = new ghost.Interface(ORDER_BOOK_ABI);
    for (const log of receipt.logs ?? []) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "OrderFilled") {
          return parsed.args.fillId as bigint;
        }
      } catch { /* skip */ }
    }
    throw new Error("OrderFilled event not found in receipt");
  }

  /** Called when a trader cancels – cancel on-chain. */
  async cancelOrder(onChainId: bigint): Promise<void> {
    const tx = await this.book.cancelOrder(onChainId);
    await tx.wait();
  }
}

// Singleton – only created when env vars are present.
let _relay: ChainRelay | null = null;

export function getRelay(): ChainRelay | null {
  if (_relay) return _relay;
  const { L2_RPC_URL, MATCHER_PRIVATE_KEY, GHOSTX_ORDER_BOOK } = process.env;
  if (!L2_RPC_URL || !MATCHER_PRIVATE_KEY || !GHOSTX_ORDER_BOOK) return null;
  _relay = new ChainRelay(L2_RPC_URL, MATCHER_PRIVATE_KEY, GHOSTX_ORDER_BOOK);
  return _relay;
}
