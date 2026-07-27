import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

type Schema = typeof schema;

let _db: LibSQLDatabase<Schema> | undefined;

const LIVE_TURSO_HINT =
  "libsql://corepilot-ai-db-vercel-icfg-iurxedhaq7upmnrfjl1nqjpw.aws-us-east-1.turso.io";

function resolveUrl() {
  const url = (process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  const onVercel = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";

  // Production / Vercel must use the live Turso DB — never create a local file DB
  if (onVercel) {
    if (!url || url.startsWith("file:")) {
      throw new Error(
        `Production requires TURSO_DATABASE_URL pointing at corepilot-ai-db (e.g. ${LIVE_TURSO_HINT}). ` +
          "Do not use file:./data/local.db on Vercel. Set env vars in the Vercel project.",
      );
    }
    return url;
  }

  if (url) return url;
  return "file:./data/local.db";
}

function getDb() {
  if (_db) return _db;
  const url = resolveUrl();
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  if (!url.startsWith("file:") && !authToken) {
    console.warn("[db] TURSO_AUTH_TOKEN is empty — cloud Turso may reject connections");
  }
  const client = createClient({
    url,
    ...(authToken && !url.startsWith("file:") ? { authToken } : {}),
  });
  _db = drizzle(client, { schema });
  return _db;
}

/**
 * Production = live Turso `corepilot-ai-db` only (Vercel env).
 * Local = file:./data/local.db
 * Never wipe/recreate the live DB on deploy — use ALTER / drizzle-kit push only.
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
