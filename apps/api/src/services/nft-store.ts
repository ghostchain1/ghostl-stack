import { promises as fs } from 'fs';
import path from 'path';
import type { NftContract, NftToken } from '@ghostchain/types/nfts';
import { openSqlite, type SqliteHandle } from './db';

type StoreShape = { contracts: NftContract[]; tokens: NftToken[] };

const normalizeAddress = (address: string) => address.trim().toLowerCase();

const contractKey = (chainId: string, address: string) => `${chainId}:${normalizeAddress(address)}`;
const tokenKey = (contractId: string, tokenId: string) => `${contractId}:${tokenId}`;

const loadStore = async (): Promise<StoreShape> => {
  const filePath = process.env.NFT_STORE_PATH || path.join(process.cwd(), 'data', 'nfts.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as StoreShape;
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const initial: StoreShape = { contracts: [], tokens: [] };
    await fs.writeFile(filePath, JSON.stringify(initial, null, 2));
    return initial;
  }
};

const saveStore = async (store: StoreShape) => {
  const filePath = process.env.NFT_STORE_PATH || path.join(process.cwd(), 'data', 'nfts.json');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2));
};

export const createNftStore = async () => {
  const sqlitePath = process.env.NFT_DB_PATH || process.env.SQLITE_DB_PATH;
  const db: SqliteHandle | undefined = sqlitePath ? openSqlite(sqlitePath) : undefined;
  if (db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS nft_contracts (
        id TEXT PRIMARY KEY,
        address TEXT,
        chainId TEXT,
        standard TEXT,
        name TEXT,
        symbol TEXT,
        metadataUri TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );
      CREATE TABLE IF NOT EXISTS nft_tokens (
        id TEXT PRIMARY KEY,
        contractId TEXT,
        contractAddress TEXT,
        chainId TEXT,
        tokenId TEXT,
        owner TEXT,
        uri TEXT,
        metadata TEXT,
        mintedAt TEXT,
        updatedAt TEXT,
        burnedAt TEXT,
        lastTx TEXT
      );
      CREATE INDEX IF NOT EXISTS nft_tokens_contract_idx ON nft_tokens(contractId);
      CREATE INDEX IF NOT EXISTS nft_tokens_owner_idx ON nft_tokens(owner);
    `);
  }

  const store = db ? null : await loadStore();
  const persist = async () => {
    if (!store) return;
    await saveStore(store);
  };
  const now = () => new Date().toISOString();

  const listContracts = async () => {
    if (db) {
      const rows = db.prepare('SELECT * FROM nft_contracts').all() as NftContract[];
      return rows;
    }
    return store!.contracts;
  };

  const listTokens = async (filter?: { contractId?: string; owner?: string }) => {
    if (db) {
      const clauses: string[] = [];
      const args: string[] = [];
      if (filter?.contractId) {
        clauses.push('contractId = ?');
        args.push(filter.contractId);
      }
      if (filter?.owner) {
        clauses.push('owner = ?');
        args.push(normalizeAddress(filter.owner));
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = db.prepare(`SELECT * FROM nft_tokens ${where}`).all(...args) as (NftToken & { metadata?: string })[];
      return rows.map((row) => ({ ...row, metadata: row.metadata ? JSON.parse(row.metadata) : undefined }));
    }
    let tokens = store!.tokens;
    if (filter?.contractId) tokens = tokens.filter((t) => t.contractId === filter.contractId);
    const ownerFilter = filter?.owner ? normalizeAddress(filter.owner) : undefined;
    if (ownerFilter) tokens = tokens.filter((t) => t.owner === ownerFilter);
    return tokens;
  };

  const getContract = async (id: string) => {
    if (db) {
      return (db.prepare('SELECT * FROM nft_contracts WHERE id = ?').get(id) as NftContract | undefined) || null;
    }
    return store!.contracts.find((c) => c.id === id) || null;
  };

  const registerContract = async (input: Omit<NftContract, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const id = input.id || contractKey(input.chainId, input.address);
    const createdAt = now();
    const updatedAt = now();
    const contract: NftContract = { ...input, id, createdAt, updatedAt };
    if (db) {
      const existing = db.prepare('SELECT id FROM nft_contracts WHERE id = ?').get(id) as { id?: string } | undefined;
      if (existing?.id) {
        db.prepare(
          'UPDATE nft_contracts SET address=@address,chainId=@chainId,standard=@standard,name=@name,symbol=@symbol,metadataUri=@metadataUri,updatedAt=@updatedAt WHERE id=@id'
        ).run(contract);
      } else {
        db.prepare(
          'INSERT INTO nft_contracts (id,address,chainId,standard,name,symbol,metadataUri,createdAt,updatedAt) VALUES (@id,@address,@chainId,@standard,@name,@symbol,@metadataUri,@createdAt,@updatedAt)'
        ).run(contract);
      }
    } else {
      const existing = store!.contracts.find((c) => c.id === id);
      if (existing) {
        Object.assign(existing, contract);
      } else {
        store!.contracts.push(contract);
      }
      await persist();
    }
    return contract;
  };

  const upsertToken = async (token: NftToken) => {
    const record = { ...token, owner: normalizeAddress(token.owner) };
    if (db) {
      const existing = db.prepare('SELECT id FROM nft_tokens WHERE id = ?').get(record.id) as { id?: string } | undefined;
      if (existing?.id) {
        db.prepare(
          'UPDATE nft_tokens SET owner=@owner,uri=@uri,metadata=@metadata,updatedAt=@updatedAt,burnedAt=@burnedAt,lastTx=@lastTx WHERE id=@id'
        ).run({ ...record, metadata: record.metadata ? JSON.stringify(record.metadata) : null });
      } else {
        db.prepare(
          'INSERT INTO nft_tokens (id,contractId,contractAddress,chainId,tokenId,owner,uri,metadata,mintedAt,updatedAt,burnedAt,lastTx) VALUES (@id,@contractId,@contractAddress,@chainId,@tokenId,@owner,@uri,@metadata,@mintedAt,@updatedAt,@burnedAt,@lastTx)'
        ).run({ ...record, metadata: record.metadata ? JSON.stringify(record.metadata) : null });
      }
    } else {
      const existing = store!.tokens.find((t) => t.id === record.id);
      if (existing) {
        Object.assign(existing, record);
      } else {
        store!.tokens.push(record);
      }
      await persist();
    }
    return record;
  };

  const markTransfer = async (contractId: string, tokenId: string, owner: string, tx?: string) => {
    const id = tokenKey(contractId, tokenId);
    const existing = (await listTokens({ contractId })).find((t) => t.id === id);
    const updatedAt = now();
    if (!existing) {
      return upsertToken({
        id,
        contractId,
        contractAddress: contractId.split(':').slice(1).join(':'),
        chainId: contractId.split(':')[0],
        tokenId,
        owner: normalizeAddress(owner),
        mintedAt: updatedAt,
        updatedAt,
        lastTx: tx
      });
    }
    return upsertToken({ ...existing, owner: normalizeAddress(owner), updatedAt, lastTx: tx });
  };

  const markBurned = async (contractId: string, tokenId: string, tx?: string) => {
    const id = tokenKey(contractId, tokenId);
    const existing = (await listTokens({ contractId })).find((t) => t.id === id);
    const updatedAt = now();
    if (!existing) {
      return upsertToken({
        id,
        contractId,
        contractAddress: contractId.split(':').slice(1).join(':'),
        chainId: contractId.split(':')[0],
        tokenId,
        owner: normalizeAddress('0x0000000000000000000000000000000000000000'),
        mintedAt: updatedAt,
        updatedAt,
        burnedAt: updatedAt,
        lastTx: tx
      });
    }
    return upsertToken({ ...existing, updatedAt, burnedAt: updatedAt, lastTx: tx });
  };

  return {
    contractKey,
    tokenKey,
    listContracts,
    getContract,
    registerContract,
    listTokens,
    upsertToken,
    markTransfer,
    markBurned
  };
};

export type NftStore = Awaited<ReturnType<typeof createNftStore>>;
