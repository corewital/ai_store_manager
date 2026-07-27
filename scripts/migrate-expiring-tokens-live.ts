/**
 * Live session columns + clear stale offline tokens. Master DB only.
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { MASTER_TURSO_DATABASE_URL, requireMasterTursoUrl } from "../app/db/master-db";

const url = requireMasterTursoUrl(
  process.env.TURSO_DATABASE_URL || MASTER_TURSO_DATABASE_URL,
);
const token = process.env.TURSO_AUTH_TOKEN || "";

if (!token) {
  console.error("Need TURSO_AUTH_TOKEN");
  process.exit(1);
}

const c = createClient({ url, authToken: token });

async function ensureColumn(column: string, ddl: string) {
  const info = await c.execute(
    `SELECT name FROM pragma_table_info('sessions') WHERE name = '${column}'`,
  );
  if (info.rows.length > 0) {
    console.log("ok     sessions." + column);
    return;
  }
  await c.execute(ddl);
  console.log("added  sessions." + column);
}

async function main() {
  console.log("Live DB:", url);
  await ensureColumn("refresh_token", "ALTER TABLE sessions ADD COLUMN refresh_token text");
  await ensureColumn(
    "refresh_token_expires",
    "ALTER TABLE sessions ADD COLUMN refresh_token_expires integer",
  );

  const stale = await c.execute(
    `SELECT COUNT(*) AS n FROM sessions
     WHERE is_online = 0
       AND access_token IS NOT NULL
       AND (refresh_token IS NULL OR refresh_token = '')`,
  );
  console.log("stale offline sessions:", stale.rows[0]?.n ?? stale.rows[0]);

  await c.execute(
    `DELETE FROM sessions
     WHERE is_online = 0
       AND access_token IS NOT NULL
       AND (refresh_token IS NULL OR refresh_token = '')`,
  );
  console.log("cleared stale offline sessions");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
