import { createClient } from "@libsql/client";
import { MASTER_TURSO_DATABASE_URL } from "../app/db/master-db";

const c = createClient({
  url: MASTER_TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const r = await c.execute("SELECT COUNT(*) AS n FROM admin_users");
console.log("ok", r.rows);
