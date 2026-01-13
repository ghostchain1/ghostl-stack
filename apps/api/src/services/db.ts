import path from 'path';
import Database from 'better-sqlite3';

export type SqliteHandle = Database.Database;

export const openSqlite = (relativePath: string): SqliteHandle => {
  const dbPath = path.isAbsolute(relativePath) ? relativePath : path.join(process.cwd(), relativePath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
};
