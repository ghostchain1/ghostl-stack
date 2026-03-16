/**
 * GhostScan Indexer — polls GhostChain nodes and writes blocks/txs to SQLite.
 */

import type Database from 'better-sqlite3';
import type { GhostRPC, GhostBlockRPC, GhostTxRPC } from './rpc.js';
import type { GhostLayer } from './index.js';

const POLL_INTERVAL_MS = parseInt(process.env.GHOSTSCAN_POLL_MS ?? '2000', 10);

export class Indexer {
  private db:  Database.Database;
  private rpc: GhostRPC;
  private heads: Map<GhostLayer, number> = new Map();

  constructor(db: Database.Database, rpc: GhostRPC) {
    this.db  = db;
    this.rpc = rpc;
  }

  /** Start polling a layer for new blocks */
  start(layer: GhostLayer): void {
    // Seed from stored head
    const stored = this.db.prepare(
      'SELECT MAX(height) as h FROM blocks WHERE layer=?'
    ).get(layer) as { h: number | null };
    this.heads.set(layer, stored.h ?? 0);

    const poll = async () => {
      try {
        await this.syncLayer(layer);
      } catch (e) {
        console.warn(`GhostScan indexer [${layer}] poll error:`, (e as Error).message);
      } finally {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    setTimeout(poll, POLL_INTERVAL_MS);
    console.log(`GhostScan indexer started for ${layer} (head=${stored.h ?? 0})`);
  }

  private async syncLayer(layer: GhostLayer): Promise<void> {
    const currentHead  = this.heads.get(layer) ?? 0;
    const chainHead    = await this.rpc.getBlockNumber(layer);

    if (chainHead <= currentHead) return;

    // Process up to 20 blocks per poll to avoid overwhelming the DB
    const maxBlock = Math.min(chainHead, currentHead + 20);

    for (let h = currentHead + 1; h <= maxBlock; h++) {
      const block = await this.rpc.getBlockByNumber(layer, h);
      if (!block) continue;
      this.indexBlock(layer, block);
      this.rpc.emitBlock(layer, block);
    }

    this.heads.set(layer, maxBlock);
  }

  private indexBlock(layer: GhostLayer, block: GhostBlockRPC): void {
    const height    = parseInt(block.number, 16);
    const gasUsed   = parseInt(block.gasUsed  || '0x0', 16);
    const gasLimit  = parseInt(block.gasLimit  || '0x1C9C380', 16);
    const timestamp = parseInt(block.timestamp || '0x0', 16);

    const txs = (block.transactions ?? []) as GhostTxRPC[];
    const txCount = txs.length;

    const insertBlock = this.db.prepare(`
      INSERT OR REPLACE INTO blocks(layer, height, hash, parent_hash, proposer, gas_used, gas_limit, tx_count, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTx = this.db.prepare(`
      INSERT OR REPLACE INTO transactions(layer, hash, height, from_addr, to_addr, value, gas, gas_price, nonce, input, status, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertContract = this.db.prepare(`
      INSERT OR IGNORE INTO contracts(layer, address, creator, height, bytecode)
      VALUES (?, ?, ?, ?, ?)
    `);

    const doTx = this.db.transaction(() => {
      insertBlock.run(layer, height, block.hash, block.parentHash, block.miner ?? '', gasUsed, gasLimit, txCount, timestamp);

      for (const tx of txs) {
        const gas      = parseInt(tx.gas      || '0x0', 16);
        const gasPrice = tx.gasPrice ?? '0x0';
        const nonce    = parseInt(tx.nonce    || '0x0', 16);
        const value    = tx.value ?? '0x0';
        const to       = tx.to?.toLowerCase() ?? null;
        const from     = (tx.from ?? '').toLowerCase();

        insertTx.run(layer, tx.hash.toLowerCase(), height, from, to, value, gas, gasPrice, nonce, tx.input ?? '0x', 1, timestamp);

        // Contract deployment: to == null
        if (to === null && tx.hash) {
          // The deployed address is sha256(from, nonce) — simplified
          const deployedAddr = `0x${Buffer.from(`${from}${nonce}`).toString('hex').slice(0, 40)}`;
          insertContract.run(layer, deployedAddr, from, height, tx.input ?? '0x');
        }
      }
    });

    doTx();
  }
}
