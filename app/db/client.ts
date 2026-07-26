import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

type Schema = typeof schema;

let _db: LibSQLDatabase<Schema> | undefined;

function resolveUrl() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "";
  if (url) return url;
  // Local offline default (same SQLite dialect as Turso)
  return "file:./data/local.db";
}

function getDb() {
  if (_db) return _db;
  const url = resolveUrl();
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  const client = createClient({
    url,
    ...(authToken && !url.startsWith("file:") ? { authToken } : {}),
  });
  _db = drizzle(client, { schema });
  return _db;
}

/**
 * Production = Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN).
 * Local = file:./data/local.db (or point TURSO_* at your Turso DB).
 * Legacy MySQL is no longer used — Turso/libSQL is the single dialect (Sec 15.7).
 */
export const db = new Proxy({} as LibSQLDatabase<Schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export type Db = LibSQLDatabase<Schema>;

/** Insert one row and return the new autoincrement id (SQLite/Turso). */
export async function insertReturningId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: any,
): Promise<number> {
  const rows = await getDb().insert(table).values(values).returning({ id: table.id });
  const id = rows[0]?.id;
  if (id == null) throw new Error("insertReturningId: no id returned");
  return Number(id);
}
