// GhostMobile SDK — JavaScript bridge for GhostChain mobile applications.
// Compatible with React Native and Flutter JS interop.
// Wraps ghost-sdk-core for mobile-safe usage (no Node.js built-ins).

export type GhostMobileLayer = 'l1' | 'l2' | 'l3';

export interface GhostMobileConfig {
  l1Rpc: string;    // http://localhost:18545
  l2Rpc: string;    // http://localhost:29545
  l3Rpc: string;    // http://localhost:39545
  walletApiUrl?: string; // GhostWallet mobile API
}

export interface GhostMobileTransaction {
  to: string;
  value: bigint;     // GST in wei
  data?: string;
  chainId: number;
  nonce?: number;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
}

export interface GhostSignedMessage {
  message: string;
  signature: string;
  signer: string;
}

export interface GhostMobileWalletInfo {
  address: string;
  balanceL1: bigint;
  balanceL2: bigint;
  balanceL3: bigint;
  nftCount: number;
}

export interface GhostDeepLink {
  /** ghost://pay?to=ADDRESS&amount=AMOUNT&layer=l2 */
  uri: string;
  action: 'pay' | 'connect' | 'sign' | 'bridge';
  params: Record<string, string>;
}

/**
 * GhostMobile — GhostChain SDK for mobile applications.
 * Wraps GhostChain RPC calls in a mobile-friendly interface with deep link support.
 *
 * @example
 * ```ts
 * // React Native
 * import { GhostMobile } from '@ghostchain/ghostmobile-sdk';
 *
 * const ghost = new GhostMobile({
 *   l1Rpc: 'https://rpc.ghostchain.io',
 *   l2Rpc: 'https://l2.ghostchain.io',
 *   l3Rpc: 'https://l3.ghostchain.io',
 * });
 *
 * const balance = await ghost.getBalance(address, 'l2');
 * const txHash = await ghost.sendTransaction(signedTx, 'l2');
 * ```
 */
export class GhostMobile {
  private readonly config: GhostMobileConfig;

  static readonly CHAIN_IDS = { l1: 14000101, l2: 901, l3: 903 } as const;
  static readonly GST_UNIT = 10n ** 18n;

  constructor(config: GhostMobileConfig) {
    this.config = config;
  }

  // ─── Wallet ───────────────────────────────────────────────────────────────

  /** Get GST balance on a specific layer */
  async getBalance(address: string, layer: GhostMobileLayer = 'l2'): Promise<bigint> {
    const rpc = this._rpcUrl(layer);
    const result = await this._jsonRpc<string>(rpc, 'ghost_getBalance', [address, 'latest']);
    return hexToBigInt(result);
  }

  /** Get full wallet info across all layers */
  async getWalletInfo(address: string): Promise<GhostMobileWalletInfo> {
    const [balL1, balL2, balL3] = await Promise.all([
      this.getBalance(address, 'l1'),
      this.getBalance(address, 'l2'),
      this.getBalance(address, 'l3'),
    ]);
    return {
      address,
      balanceL1: balL1,
      balanceL2: balL2,
      balanceL3: balL3,
      nftCount: 0,
    };
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  /** Send a pre-signed raw transaction hex */
  async sendTransaction(rawTxHex: string, layer: GhostMobileLayer = 'l2'): Promise<string> {
    const rpc = this._rpcUrl(layer);
    return this._jsonRpc<string>(rpc, 'ghost_sendRawTransaction', [rawTxHex]);
  }

  /** Get the receipt for a transaction hash */
  async getReceipt(txHash: string, layer: GhostMobileLayer = 'l2'): Promise<unknown> {
    return this._jsonRpc<unknown>(this._rpcUrl(layer), 'ghost_getTransactionReceipt', [txHash]);
  }

  /** Get current suggested gas price on a layer */
  async gasPrice(layer: GhostMobileLayer = 'l2'): Promise<bigint> {
    const result = await this._jsonRpc<string>(this._rpcUrl(layer), 'ghost_gasPrice', []);
    return hexToBigInt(result);
  }

  /** Get nonce (transaction count) for an address */
  async getNonce(address: string, layer: GhostMobileLayer = 'l2'): Promise<number> {
    const result = await this._jsonRpc<string>(this._rpcUrl(layer), 'ghost_getTransactionCount', [address, 'pending']);
    return Number(hexToBigInt(result));
  }

  // ─── Signing (via GhostWallet API) ───────────────────────────────────────

  /**
   * Request GhostWallet to sign a message.
   * Routes through the GhostWallet API (no private key in app code).
   */
  async signMessage(params: { address: string; message: string }): Promise<GhostSignedMessage> {
    if (!this.config.walletApiUrl) throw new Error('GhostMobile: walletApiUrl required for signing');
    const res = await fetch(`${this.config.walletApiUrl}/ghost/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`GhostMobile sign error: ${res.status}`);
    return res.json() as Promise<GhostSignedMessage>;
  }

  // ─── Deep Links ───────────────────────────────────────────────────────────

  /**
   * Build a GhostChain deep link URI.
   * ghost://pay?to=ADDRESS&amount=WEI&layer=l2
   */
  buildDeepLink(action: GhostDeepLink['action'], params: Record<string, string>): GhostDeepLink {
    const query = new URLSearchParams(params).toString();
    return {
      uri: `ghost://${action}?${query}`,
      action,
      params,
    };
  }

  /**
   * Parse a ghost:// deep link URI into structured parameters.
   */
  parseDeepLink(uri: string): GhostDeepLink {
    if (!uri.startsWith('ghost://')) throw new Error(`Invalid GhostChain deep link: ${uri}`);
    const url = new URL(uri.replace('ghost://', 'ghost://host/'));
    const action = url.pathname.replace('/', '') as GhostDeepLink['action'];
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { params[k] = v; });
    return { uri, action, params };
  }

  // ─── QR Code Support ─────────────────────────────────────────────────────

  /** Generate QR code data (base64 PNG) via GhostWallet API */
  async generatePaymentQR(params: {
    address: string;
    amount: bigint;
    layer: GhostMobileLayer;
  }): Promise<string> {
    if (!this.config.walletApiUrl) throw new Error('GhostMobile: walletApiUrl required for QR generation');
    const res = await fetch(`${this.config.walletApiUrl}/ghost/qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, amount: params.amount.toString() }),
    });
    if (!res.ok) throw new Error(`GhostMobile QR error: ${res.status}`);
    const json = await res.json() as { qrBase64: string };
    return json.qrBase64;
  }

  // ─── Utils ────────────────────────────────────────────────────────────────

  /** Format GST amount from wei to human-readable */
  static formatGST(wei: bigint, decimals = 4): string {
    const whole = wei / GhostMobile.GST_UNIT;
    const frac  = (wei % GhostMobile.GST_UNIT).toString().padStart(18, '0').slice(0, decimals);
    return `${whole}.${frac} GST`;
  }

  /** Parse human-readable GST amount to wei */
  static parseGST(amount: string): bigint {
    const [whole, frac = ''] = amount.replace(/\s*GST\s*$/i, '').split('.');
    const fracPadded = frac.slice(0, 18).padEnd(18, '0');
    return BigInt(whole) * GhostMobile.GST_UNIT + BigInt(fracPadded);
  }

  private _rpcUrl(layer: GhostMobileLayer): string {
    if (layer === 'l1') return this.config.l1Rpc;
    if (layer === 'l2') return this.config.l2Rpc;
    return this.config.l3Rpc;
  }

  private async _jsonRpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`GhostMobile [${method}]: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostMobile [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}

function hexToBigInt(hex: string): bigint {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex.startsWith('0x') ? hex : `0x${hex}`);
}

export default GhostMobile;
