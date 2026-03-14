import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { JsonRpcProvider, Contract } from 'ghost';
import type { TokenRecord } from '@ghostl/types';
import { openSqlite, type SqliteHandle } from './db';

type StoreShape = { tokens: TokenRecord[] };

const loadStore = async (): Promise<StoreShape> => {
  const filePath = process.env.TOKEN_STORE_PATH || path.join(process.cwd(), 'data', 'tokens.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as StoreShape;
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const initial: StoreShape = { tokens: [] };
    await fs.writeFile(filePath, JSON.stringify(initial, null, 2));
    return initial;
  }
};

const saveStore = async (store: StoreShape) => {
  const filePath = process.env.TOKEN_STORE_PATH || path.join(process.cwd(), 'data', 'tokens.json');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2));
};

const erc20Abi = ['function symbol() view returns (string)', 'function name() view returns (string)', 'function decimals() view returns (uint8)'];

const fetchMetadata = async (address: string, rpc?: string) => {
  if (!rpc) return {};
  try {
    const provider = new JsonRpcProvider(rpc);
    const c = new Contract(address, erc20Abi, provider);
    const [symbol, name, decimals] = await Promise.all([c.symbol(), c.name(), c.decimals()]);
    return { symbol, name, decimals: Number(decimals) };
  } catch {
    return {};
  }
};

export const createTokenService = async () => {
  const sqlitePath = process.env.TOKEN_DB_PATH || process.env.WALLET_DB_PATH || process.env.SQLITE_DB_PATH;
  const db: SqliteHandle | undefined = sqlitePath ? openSqlite(sqlitePath) : undefined;
  if (db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        walletId TEXT,
        chainId TEXT,
        address TEXT,
        type TEXT,
        symbol TEXT,
        name TEXT,
        decimals INTEGER,
        logoUri TEXT,
        verified INTEGER,
        createdAt TEXT
      );
    `);
  }
  const store = db ? null : await loadStore();
  const persist = async () => {
    if (!store) return;
    await saveStore(store);
  };
  const now = () => new Date().toISOString();

  return {
    async list(walletId?: string) {
      if (db) {
        const rows = walletId
          ? (db.prepare('SELECT * FROM tokens WHERE walletId=?').all(walletId) as TokenRecord[])
          : (db.prepare('SELECT * FROM tokens').all() as TokenRecord[]);
        return rows;
      }
      return walletId ? store!.tokens.filter((t) => t.walletId === walletId) : store!.tokens;
    },
    async importToken(input: { walletId: string; chainId: string; address: string; type?: string; rpc?: string }) {
      const meta = await fetchMetadata(input.address, input.rpc);
      const token: TokenRecord = {
        id: randomUUID(),
        walletId: input.walletId,
        chainId: input.chainId,
        address: input.address,
        type: (input.type as TokenRecord['type']) || 'erc20',
        symbol: (meta as { symbol?: string }).symbol || 'UNKNOWN',
        name: (meta as { name?: string }).name || 'Unverified Token',
        decimals: (meta as { decimals?: number }).decimals || 18,
        verified: false,
        createdAt: now()
      };
      if (db) {
        db.prepare(
          `INSERT INTO tokens (id,walletId,chainId,address,type,symbol,name,decimals,logoUri,verified,createdAt)
           VALUES (@id,@walletId,@chainId,@address,@type,@symbol,@name,@decimals,@logoUri,@verified,@createdAt)`
        ).run({ ...token, verified: token.verified ? 1 : 0 });
      } else {
        store!.tokens.push(token);
        await persist();
      }
      return token;
    },
    async delete(id: string) {
      if (db) {
        db.prepare('DELETE FROM tokens WHERE id=?').run(id);
      } else {
        store!.tokens = store!.tokens.filter((t) => t.id !== id);
        await persist();
      }
    }
  };
};

export type TokenService = Awaited<ReturnType<typeof createTokenService>>;
