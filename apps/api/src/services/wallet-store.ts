import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Wallet } from 'ethers';
import type { WalletRecord, WalletPolicy } from '@ghostl/types';
import { openSqlite, type SqliteHandle } from './db';

type CreateWalletInput = {
  label: string;
  address: string;
  chainId: string;
  ownerUserId?: string;
  policy?: WalletPolicy;
};

type CreateCustodialInput = {
  label: string;
  chainId: string;
  ownerUserId?: string;
  policy?: WalletPolicy;
};

type StoreShape = { wallets: WalletRecord[] };

const loadStore = async (): Promise<StoreShape> => {
  const filePath = process.env.WALLET_STORE_PATH || path.join(process.cwd(), 'data', 'wallets.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as StoreShape;
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const initial: StoreShape = { wallets: [] };
    await fs.writeFile(filePath, JSON.stringify(initial, null, 2));
    return initial;
  }
};

const saveStore = async (store: StoreShape) => {
  const filePath = process.env.WALLET_STORE_PATH || path.join(process.cwd(), 'data', 'wallets.json');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2));
};

export const createWalletService = async () => {
  const sqlitePath = process.env.WALLET_DB_PATH || process.env.SQLITE_DB_PATH;
  const db: SqliteHandle | undefined = sqlitePath ? openSqlite(sqlitePath) : undefined;
  if (db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS wallets (
        id TEXT PRIMARY KEY,
        label TEXT,
        address TEXT,
        chainId TEXT,
        type TEXT,
        ownerUserId TEXT,
        status TEXT,
        policy TEXT,
        keyPreview TEXT,
        version INTEGER,
        createdAt TEXT,
        updatedAt TEXT
      );
    `);
  }

  const store = db ? null : await loadStore();
  const persist = async () => {
    if (!store) return;
    await saveStore(store);
  };
  const now = () => new Date().toISOString();

  const baseRecord = (input: { label: string; address: string; chainId: string; ownerUserId?: string; policy?: WalletPolicy }) => {
    const ts = now();
    return {
      id: randomUUID(),
      createdAt: ts,
      updatedAt: ts,
      status: 'active' as const,
      version: 1,
      ...input
    };
  };

  const serializePolicy = (p?: WalletPolicy) => (p ? JSON.stringify(p) : null);
  const hydratePolicy = (p?: string | null) => (p ? (JSON.parse(p) as WalletPolicy) : undefined);

  const createWatch = async (input: CreateWalletInput) => {
    const record: WalletRecord = {
      ...baseRecord(input),
      type: 'watch'
    };
    if (db) {
      db.prepare(
        `INSERT INTO wallets (id,label,address,chainId,type,ownerUserId,status,policy,keyPreview,version,createdAt,updatedAt)
         VALUES (@id,@label,@address,@chainId,@type,@ownerUserId,@status,@policy,@keyPreview,@version,@createdAt,@updatedAt)`
      ).run({ ...record, policy: serializePolicy(record.policy) });
    } else {
      store!.wallets.push(record);
      await persist();
    }
    return record;
  };

  const createCustodial = async (input: CreateCustodialInput) => {
    const generated = Wallet.createRandom();
    const record: WalletRecord = {
      ...baseRecord({ ...input, address: generated.address }),
      type: 'custodial',
      keyPreview: `${generated.privateKey.slice(0, 8)}…${generated.privateKey.slice(-4)}`
    };
    if (db) {
      db.prepare(
        `INSERT INTO wallets (id,label,address,chainId,type,ownerUserId,status,policy,keyPreview,version,createdAt,updatedAt)
         VALUES (@id,@label,@address,@chainId,@type,@ownerUserId,@status,@policy,@keyPreview,@version,@createdAt,@updatedAt)`
      ).run({ ...record, policy: serializePolicy(record.policy) });
    } else {
      store!.wallets.push(record);
      await persist();
    }
    return { wallet: record, exportedKey: generated.privateKey };
  };

  const list = async () => {
    if (db) {
      const rows = db.prepare('SELECT * FROM wallets').all() as (WalletRecord & { policy?: string })[];
      return rows.map((w) => ({ ...w, policy: hydratePolicy(w.policy) }));
    }
    return store!.wallets;
  };

  const get = async (id: string) => {
    if (db) {
      const row = db.prepare('SELECT * FROM wallets WHERE id=?').get(id) as (WalletRecord & { policy?: string }) | undefined;
      return row ? { ...row, policy: hydratePolicy(row.policy) } : null;
    }
    return store!.wallets.find((w) => w.id === id) || null;
  };

  return {
    async list() {
      return list();
    },
    async get(id: string) {
      return get(id);
    },
    async createWatch(input: CreateWalletInput) {
      return createWatch(input);
    },
    async importWatch(input: CreateWalletInput) {
      return createWatch(input);
    },
    async createCustodial(input: CreateCustodialInput) {
      return createCustodial(input);
    },
    async rotateCustodial(id: string) {
      const wallet = await get(id);
      if (!wallet || wallet.type !== 'custodial') throw new Error('wallet not found or not custodial');
      const generated = Wallet.createRandom();
      wallet.address = generated.address;
      wallet.keyPreview = `${generated.privateKey.slice(0, 8)}…${generated.privateKey.slice(-4)}`;
      wallet.version = (wallet.version || 1) + 1;
      wallet.updatedAt = now();
      if (db) {
        db.prepare('UPDATE wallets SET address=@address,keyPreview=@keyPreview,version=@version,updatedAt=@updatedAt WHERE id=@id').run(wallet);
      } else {
        await persist();
      }
      return { wallet, exportedKey: generated.privateKey };
    },
    async update(id: string, input: Partial<Omit<WalletRecord, 'id' | 'createdAt' | 'type'>>) {
      const wallet = await get(id);
      if (!wallet) throw new Error('wallet not found');
      Object.assign(wallet, input, { updatedAt: now() });
      if (db) {
        db.prepare(
          'UPDATE wallets SET label=@label,address=@address,chainId=@chainId,ownerUserId=@ownerUserId,status=@status,policy=@policy,updatedAt=@updatedAt WHERE id=@id'
        ).run({ ...wallet, policy: serializePolicy(wallet.policy) });
      } else {
        await persist();
      }
      return wallet;
    },
    async delete(id: string) {
      const wallet = await get(id);
      if (!wallet) return;
      wallet.status = 'revoked';
      wallet.updatedAt = now();
      if (db) {
        db.prepare('UPDATE wallets SET status=@status,updatedAt=@updatedAt WHERE id=@id').run(wallet);
      } else {
        await persist();
      }
    }
  };
};

export type WalletService = Awaited<ReturnType<typeof createWalletService>>;
