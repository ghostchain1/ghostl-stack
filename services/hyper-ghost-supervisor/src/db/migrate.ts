import fs from 'node:fs';
import path from 'node:path';
import type { SqliteDb } from './sqlite.js';

type Migration = { id: string; sql: string };

const readSqlFiles = (dir: string): Migration[] => {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
  return files.map((file) => {
    const full = path.join(dir, file);
    return { id: file, sql: fs.readFileSync(full, 'utf8') };
  });
};

export function runMigrations(db: SqliteDb, opts: { migrationsDir: string }): { applied: string[] } {
  const migrations = readSqlFiles(opts.migrationsDir);
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_ts INTEGER NOT NULL)"
  );
  const applied = new Set<string>(
    db.prepare('SELECT id FROM schema_migrations ORDER BY applied_ts ASC').all().map((r: any) => String(r.id))
  );

  const newlyApplied: string[] = [];
  const now = () => Math.floor(Date.now() / 1000);

  db.transaction(() => {
    for (const m of migrations) {
      if (applied.has(m.id)) continue;
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_ts) VALUES (?, ?)').run(m.id, now());
      newlyApplied.push(m.id);
    }
  })();

  return { applied: newlyApplied };
}
