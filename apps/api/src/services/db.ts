import path from 'path';
import type Database from 'better-sqlite3';

export type SqliteHandle = Database.Database;

let warned = false;

const loadSqlite = () => {
  try {
    return require('better-sqlite3') as typeof import('better-sqlite3');
  } catch (err) {
    if (!warned) {
      console.warn('[api] better-sqlite3 unavailable, falling back to JSON store', err);
      warned = true;
    }
    return null;
  }
};

export const openSqlite = (relativePath: string): SqliteHandle | undefined => {
  const Sqlite = loadSqlite();
  if (!Sqlite) return undefined;
  const dbPath = path.isAbsolute(relativePath) ? relativePath : path.join(process.cwd(), relativePath);
  try {
    const db = new Sqlite(dbPath);
    db.pragma('journal_mode = WAL');
    return db;
  } catch (err) {
    console.warn('[api] sqlite init failed, falling back to JSON store', err);
    return undefined;
  }
};
