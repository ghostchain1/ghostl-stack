import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type SqliteDb = Database.Database;

const ensureDir = (filePath: string) => {
  const dir = path.dirname(filePath);
  if (!dir || dir === '.' || dir === '/') return;
  fs.mkdirSync(dir, { recursive: true });
};

export function openDb(dbPath: string): SqliteDb {
  ensureDir(dbPath);
  const db = new Database(dbPath);

  // Safety + concurrency defaults.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  return db;
}

