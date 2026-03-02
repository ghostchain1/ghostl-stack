/**
 * chain/client.ts — Ethers.js provider + wallet for L1 interaction.
 *
 * The wallet is the PROPOSER key only — it holds no custody rights.
 * It can only call TreasuryGovernor.propose(), which is gated by the
 * proposers mapping (set by governance).
 */

import { ethers } from 'ethers';
import type { Config } from '../config.js';
import { logger } from '../logger.js';

export interface ChainClient {
  provider: ethers.JsonRpcProvider;
  wallet:   ethers.Wallet;
  chainId:  number;
}

let _client: ChainClient | undefined;

export async function getChainClient(cfg: Config): Promise<ChainClient> {
  if (_client) return _client;

  const provider = new ethers.JsonRpcProvider(cfg.L1_RPC_URL, {
    chainId: cfg.CHAIN_ID_L1,
    name:    'ghostchain-l1',
  });

  const wallet = new ethers.Wallet(cfg.PROPOSER_PRIVATE_KEY, provider);

  const network = await provider.getNetwork();
  if (Number(network.chainId) !== cfg.CHAIN_ID_L1) {
    throw new Error(
      `ChainID mismatch: expected ${cfg.CHAIN_ID_L1}, got ${network.chainId}`,
    );
  }

  logger.info('chain client initialised', {
    chainId:  cfg.CHAIN_ID_L1,
    proposer: wallet.address,
  });

  _client = { provider, wallet, chainId: cfg.CHAIN_ID_L1 };
  return _client;
}
