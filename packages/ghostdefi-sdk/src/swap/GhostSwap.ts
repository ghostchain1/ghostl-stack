// GhostDeFi SDK — Swap Engine (GhostXchange AMM)

import { applySlippage, DEFAULT_SLIPPAGE_BPS } from '../types.js';
import type { GhostDeFiConfig, GhostSwapQuote } from '../types.js';

/**
 * GhostSwap — AMM token swap engine.
 * Interacts with the GhostXchange (GhostChain's native DEX, not Uniswap) router contract.
 * All swap gas is paid in GST.
 */
export class GhostSwap {
  private readonly config: GhostDeFiConfig;

  constructor(config: GhostDeFiConfig) {
    this.config = config;
  }

  /**
   * Get a swap quote for tokenIn → tokenOut.
   * @param amountIn - exact amount of input token (in wei)
   * @param path - token addresses [tokenIn, ...intermediaries, tokenOut]
   * @param slippageBps - slippage tolerance in basis points (default 50 = 0.5%)
   */
  async quote(
    amountIn: bigint,
    path: string[],
    slippageBps = DEFAULT_SLIPPAGE_BPS,
  ): Promise<GhostSwapQuote> {
    if (path.length < 2) throw new Error('GhostSwap: path must have at least 2 tokens');

    const amounts = await this._contractCall<string[]>(
      this.config.routerAddress,
      'getAmountsOut(uint256,address[])',
      [amountIn.toString(), path],
    );

    const amountOut = BigInt(amounts[amounts.length - 1]);

    // estimate gas for the swap
    const gasEstimate = await this._estimateGas({
      to: this.config.routerAddress,
      data: `swapExactTokensForTokens(${amountIn},${applySlippage(amountOut, slippageBps)},${JSON.stringify(path)})`,
    });

    const priceImpact = this._calcPriceImpact(amountIn, amountOut);

    return {
      amountIn,
      amountOut,
      amountOutMin: applySlippage(amountOut, slippageBps),
      priceImpact,
      path,
      gasEstimate,
    };
  }

  /**
   * Execute a swap: sell exact `amountIn` tokens for at least `amountOutMin`.
   * Returns the tx hash.
   */
  async swap(
    amountIn: bigint,
    amountOutMin: bigint,
    path: string[],
    to: string,
    deadlineSecs = 1200,
  ): Promise<string> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSecs);

    return this._sendTx('ghost_sendTransaction', {
      to: this.config.routerAddress,
      method: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
      params: [amountIn.toString(), amountOutMin.toString(), path, to, deadline.toString()],
    });
  }

  /**
   * Swap ETH (GST) for exact tokens.
   * Sends GST as msg.value to the router.
   */
  async swapGSTForTokens(
    gstAmount: bigint,
    amountOutMin: bigint,
    path: string[],
    to: string,
    deadlineSecs = 1200,
  ): Promise<string> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSecs);

    return this._sendTx('ghost_sendTransaction', {
      to: this.config.routerAddress,
      value: gstAmount.toString(),
      method: 'swapExactETHForTokens(uint256,address[],address,uint256)',
      params: [amountOutMin.toString(), path, to, deadline.toString()],
    });
  }

  private _calcPriceImpact(amountIn: bigint, amountOut: bigint): number {
    // simplified: actual calculation requires pool reserves
    if (amountOut === 0n) return 100;
    return Math.min(Number((amountIn * 10000n) / (amountOut * 10000n)), 100);
  }

  private async _contractCall<T>(address: string, method: string, params: unknown[]): Promise<T> {
    const result = await this._rpc<T>('ghost_call', [{
      to: address,
      data: this._encodeCall(method, params),
    }, 'latest']);
    return result;
  }

  private _encodeCall(method: string, _params: unknown[]): string {
    // In production, use GhostChain ABI encoder from ghost-sdk-core
    // This is a placeholder that delegates to the node's eth_call
    return `0x${Buffer.from(method).toString('hex')}`;
  }

  private async _estimateGas(tx: { to: string; data: string }): Promise<bigint> {
    const hex = await this._rpc<string>('ghost_estimateGas', [tx]);
    return BigInt(hex);
  }

  private async _sendTx(method: string, params: Record<string, unknown>): Promise<string> {
    return this._rpc<string>(method, [params]);
  }

  private async _rpc<T>(method: string, params: unknown[]): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(this.config.rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostSwap RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostSwap [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}
