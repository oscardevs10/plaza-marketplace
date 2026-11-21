/**
 * Conexión a la base de datos, compartida por la app y los scripts (migrar, sembrar, pruebas).
 * - Con DATABASE_URL: PostgreSQL real (Neon, Supabase, Railway…).
 * - Sin DATABASE_URL: PGlite, un Postgres embebido guardado en .data/pglite (solo desarrollo).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type DB = PostgresJsDatabase<typeof schema>;

/** db.execute() devuelve un arreglo con postgres-js y { rows } con PGlite; esto normaliza ambos. */
export function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows: T[] }).rows ?? []);
}

export function createDb(opts: { url?: string; dataDir?: string } = {}): DB {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (url) {
    // prepare: false → compatible con poolers en modo transacción (Neon, Supabase). Pocas conexiones por instancia serverless.
    return drizzlePostgres(postgres(url, { max: Number(process.env.DATABASE_POOL_SIZE ?? (process.env.VERCEL ? 3 : 10)), prepare: false }), { schema, casing: 'snake_case' });
  }
  if (process.env.NODE_ENV === 'production' && !opts.dataDir && !process.env.PGLITE_DIR) { // PGLITE_DIR: compilar/probar en local
    throw new Error('DATABASE_URL es obligatoria en producción');
  }
  const dir = opts.dataDir ?? process.env.PGLITE_DIR ?? '.data/pglite';
  if (!dir.startsWith('memory://')) mkdirSync(path.dirname(path.resolve(dir)), { recursive: true });
  const client = new PGlite(dir, { extensions: { unaccent, pg_trgm } });
  // Ambos drivers exponen la misma API de Drizzle para Postgres.
  return drizzlePglite(client, { schema, casing: 'snake_case' }) as unknown as DB;
}
