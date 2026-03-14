import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL || 'postgres://ghost:ghost@postgres:5432/ghost_compliance';

export const pool = new Pool({ connectionString: databaseUrl });

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
