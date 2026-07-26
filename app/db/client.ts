import "dotenv/config";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "./schema";

type Schema = typeof schema;

let _db: MySql2Database<Schema> | undefined;
let _pool: Pool | undefined;

function getPool(): Pool {
  if (_pool) return _pool;

  const host = process.env.DB_HOST || "127.0.0.1";
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME || "corepilot_ai";

  _pool = createPool({
    host,
    port,
    user,
    password,
    database,
    connectionLimit: 10,
  });
  return _pool;
}

/** Local = MySQL. Set DB_PROVIDER=turso later when Turso keys are ready. */
export const db = new Proxy({} as MySql2Database<Schema>, {
  get(_target, prop, receiver) {
    if (!_db) {
      _db = drizzle(getPool(), { schema, mode: "default" });
    }
    return Reflect.get(_db, prop, receiver);
  },
});

export type Db = MySql2Database<Schema>;
