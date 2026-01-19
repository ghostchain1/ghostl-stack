import session from 'express-session';
import { openSqlite } from './db';

export class SqliteSessionStore extends session.Store {
  private db;

  constructor(dbPath: string) {
    super();
    const db = openSqlite(dbPath);
    if (!db) throw new Error('auth_db_unavailable');
    this.db = db;
    this.db.exec(`
      create table if not exists sessions (
        id text primary key,
        user_id text,
        created_at text not null,
        expires_at text not null,
        rotated_from text,
        revoked_at text,
        ip text,
        user_agent text,
        csrf_token text,
        data text
      );
    `);
  }

  get(sid: string, callback: (err?: Error | null, session?: session.SessionData | null) => void) {
    try {
      const row = this.db.prepare('select * from sessions where id = ?').get(sid) as any;
      if (!row) {
        callback();
        return;
      }
      if (row.revoked_at) {
        callback();
        return;
      }
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
        this.db.prepare('delete from sessions where id = ?').run(sid);
        callback();
        return;
      }
      const data = row.data ? JSON.parse(row.data) : {};
      callback(null, data);
    } catch (err) {
      callback(err as Error);
    }
  }

  set(sid: string, sess: session.SessionData, callback?: (err?: Error | null) => void) {
    try {
      const now = new Date().toISOString();
      const ttl = Number(process.env.SESSION_TTL_MS || 30 * 60 * 1000);
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).toISOString() : new Date(Date.now() + ttl).toISOString();
      const userId = (sess as any).userId || null;
      if (!userId) {
        if (callback) callback();
        return;
      }
      const rotatedFrom = (sess as any).rotatedFrom || null;
      const csrfToken = (sess as any).csrfToken || null;
      const data = JSON.stringify(sess);
      this.db
        .prepare(
          'insert into sessions (id, user_id, created_at, expires_at, rotated_from, revoked_at, ip, user_agent, csrf_token, data) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)' +
            ' on conflict(id) do update set user_id = excluded.user_id, expires_at = excluded.expires_at, rotated_from = excluded.rotated_from, revoked_at = excluded.revoked_at, csrf_token = excluded.csrf_token, data = excluded.data'
        )
        .run(sid, userId, now, expires, rotatedFrom, null, (sess as any).ip || null, (sess as any).userAgent || null, csrfToken, data);
      if (callback) callback();
    } catch (err) {
      if (callback) callback(err as Error);
    }
  }

  destroy(sid: string, callback?: (err?: Error | null) => void) {
    try {
      this.db.prepare('update sessions set revoked_at = ? where id = ?').run(new Date().toISOString(), sid);
      if (callback) callback();
    } catch (err) {
      if (callback) callback(err as Error);
    }
  }

  touch(sid: string, sess: session.SessionData, callback?: (err?: Error | null) => void) {
    try {
      const userId = (sess as any).userId || null;
      if (!userId) {
        if (callback) callback();
        return;
      }
      const ttl = Number(process.env.SESSION_TTL_MS || 30 * 60 * 1000);
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).toISOString() : new Date(Date.now() + ttl).toISOString();
      this.db.prepare('update sessions set expires_at = ?, data = ? where id = ?').run(expires, JSON.stringify(sess), sid);
      if (callback) callback();
    } catch (err) {
      if (callback) callback(err as Error);
    }
  }
}

export const createSessionStore = () => {
  const dbPath = process.env.AUTH_DB_PATH || process.env.SQLITE_DB_PATH || 'data/auth.db';
  return new SqliteSessionStore(dbPath);
};
