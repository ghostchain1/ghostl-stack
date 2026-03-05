import type { TxRequest } from "./Types.js";
import { safeChecksumAddress } from "../utils/address.js";

export class TxBuilder {
  private req: Partial<TxRequest> = {};

  static create(): TxBuilder {
    return new TxBuilder();
  }

  to(address: string): this {
    const checksummed = safeChecksumAddress(address);
    if (!checksummed) throw new TypeError(`TxBuilder: invalid address: ${address}`);
    this.req.to = checksummed;
    return this;
  }

  value(wei: bigint): this {
    this.req.value = wei;
    return this;
  }

  data(hex: string): this {
    if (!/^0x[0-9a-fA-F]*$/.test(hex)) {
      throw new TypeError(`TxBuilder: invalid hex data: ${hex}`);
    }
    this.req.data = hex;
    return this;
  }

  gasLimit(limit: bigint): this {
    this.req.gasLimit = limit;
    return this;
  }

  nonce(n: number): this {
    this.req.nonce = n;
    return this;
  }

  build(): TxRequest {
    if (!this.req.to) throw new Error("TxBuilder: missing to address");
    return this.req as TxRequest;
  }
}
