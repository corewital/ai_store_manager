import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { isLiveRuntime, resolveDatabaseUrl } from "./master-db";
import { getDbConfigError, resolveTursoAuthToken } from "./turso-env";

type Schema = typeof schema;

let _db: LibSQLDatabase<Schema> | undefined;

function getDb() {
  if (_db) return _db;

  const configError = getDbConfigError();
  if (configError) throw new Error(`[db] ${configError}`);

  const url = resolveDatabaseUrl();

  if (isLiveRuntime() && url.startsWith("file:")) {
    throw new Error(
      "Production must not use file: DB. Live always uses master corepilot-ai-db Turso.",
    );
  }

  const authToken = resolveTursoAuthToken();
  if (!url.startsWith("file:") && !authToken) {
    throw new Error(
      "[db] TURSO_AUTH_TOKEN is required for live Turso (corepilot-ai-db).",
    );
  }

  const client = createClient({
    url,
    ...(authToken && !url.startsWith("file:") ? { authToken } : {}),
  });
  _db = drizzle(client, { schema });
  return _db;
}

/**
 * Live (Vercel): always master `corepilot-ai-db` — no branch DBs, no file:.
 * Local: `file:./data/local.db` or TURSO_DATABASE_URL from .env.
 */
export const db = new Proxy({} as LibSQLDatabase<Schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export type Db = LibSQLDatabase<Schema>;

/** Quick connectivity check for health routes / startup diagnostics. */
export async function pingDatabase(): Promise<{ ok: boolean; error?: string }> {
  const configError = getDbConfigError();
  if (configError) return { ok: false, error: configError };
  try {
    const url = resolveDatabaseUrl();
    const authToken = resolveTursoAuthToken();
    const client = createClient({
      url,
      ...(authToken && !url.startsWith("file:") ? { authToken } : {}),
    });
    await client.execute("SELECT 1");
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: msg.slice(0, 300) };
  }
}

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
